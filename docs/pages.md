# Páginas

Antes de falarmos exatamente sobre a B-Tree, primeiro vamos falar sobre o sistema de páginas: se cada página tem 4kb, como saber onde fica a próxima página?

É simples, se 4kb é o tamanho da página, a página 0 começa no byte 0, a página 1 começa no byte 4096, a página 2 começa no byte 8192, e assim por diante. Logo, para acessar a página N, basta ler os bytes de `N * 4096` a `N * 4096 + 4095`. É aritmética mesmo, bem simples.

```ts
offset = pageNumber * pageSize
```

> Acho que inclusive isso não é exclusivo de bancos de dados KV, provavelmente é uma prática comum (Postgres e SQLite fazem o mesmo, se não me engano).

## O que tem dentro de uma página?

Uma página é só um bloco de bytes de tamanho fixo, só que bytes sem estruturas são inúteis, então nós organizamos uma estrutura pra identificar algumas coisas com um cabeçalho (header) com metadados e o restante da página é usado para armazenar os dados.

Vamos usar um header mínimo:
```plaintext
┌─────────────────────────────────────────┐  <- byte 0
│  pageType   (1 byte)                    │  internal, leaf, overflow e etc
│  numCells   (2 bytes)                   │  quantos pares KV existem aqui
│  freeStart  (2 bytes)                   │  onde começa o espaço livre
│  ...                                    │
├─────────────────────────────────────────┤  <- byte N (dependendo do tamanho do header)
│                                         │
│            DADOS (cells)                │
│                                         │
└─────────────────────────────────────────┘  <- byte 4095
```

## O que o Pager precisa ter?

Conceitualmente, o Pager precisa ter:

```typescript
open(filepath)              // Abre ou cria um arquivo
read(pageNumber)            // Retorna os 4KB daquela página como Buffer
write(pageNumber, buffer)   // Escreve 4KB naquela posição
close()                     // Fecha o arquivo
```

O externo não sabe que existe um arquivo, ele só pede as páginas, o Pager é quem cuida do resto.

### Lidando com arquivos no Node.js

Temos algumas peculiaridades ao lidar com arquivos no Node.js, então eu vou listar aqui algumas coisas que precisamos ter em mente:

1. `fs.open` recebe uma flag que define o modo de abertura. A flag `r+` abre pra leitura e escrita, mas falha se o arquivo não existir. A flag `w+` cria o arquivo, mas trunca se já existir. Para o DB, precisamos de um comportamento específico: abrir se existir, criar se não existir, mas **sem truncar**.

2. `fs.read` e `fs.write` na forma de baixo nível (de acordo com a documentação) recebem um `fd` (file descriptor), um `Buffer` e uma `position`. O parâmetro `position` é exatamente o offset que "calculamos" antes.

---

Para o caso da flag, `a+` pode parecer a flag ideal, mas ela tem um "problema" sutil (não é bem um problema, é só a forma com que ela se comporta que não é ideal pra gente): A flag `a+` abre para leitura e escrita, e cria o arquivo se não existir. Mas o `a` vem de _append_, o que em vários sistemas operacionais forçam todas as escritas para o final do arquivo, ignorando o `position` que passarmos para o `fs.write`. Isso quebraria o Pager, porque precisamos de escrever em posições arbitrárias. Então é melhor usarmos `r+` e `w` (somado com `r+` em seguida) pra garantir que teremos o comportamento desejado

Já para o caso do `fs.read` e `fs.write`, nós não vamos precisar implementar um I/O, o Node já faz isso pra gente. A gente só precisa implementar a lógica do Pager em cima dessas chamadas, nada de novo e que não tenhamos falado antes: calcular o `offset`, alocar o Buffer do tamanho certo, tratar o caso da página inexistente e etc.

> Ah, importante lembrar que eu não citei se é pra usar o sync ou assync, mas é só pra entender o conceito, no fim acredito que o uso real seja do sync

## Guardando células (Cells)

Num DB KV, uma célula é um par KV. No entando, no disco, tudo é bytes. Não há "string" ou "number" no arquivo, mas sim uma sequência de bytes que você interpreta de uma forma X ou Y. Então, isso nos leva a uma pergunta importante:

> Em que formato vamos armazenar chaves e valores?

Pra responder isso, precisamos tomar duas decisões:

### 1. Tipos Suportados

Vamos aceitar qualquer valor binário (como o Redis), ou vamos restringir a strings? Se restringirmos a strings, precisamos definir um encoding (UTF-8 é o mais comum). Se aceitarmos binário, precisamos de uma forma de indicar o tamanho da chave e do valor, para que possamos ler corretamente.

De certa forma, o projeto é simples, mas salvar só strings é simplificar até demais, e aceitar binário é mais complexo, mas é mais flexível. Eu acho que o ideal é aceitar binário, mas com uma estrutura clara para indicar os tamanhos.

### 2. Tamanho fixo ou variável

Strings têm tamanho variável, o que complica a serialização. Um campo de taamnho fixo (ex: uma chave de 64 bytes) é mais simples de implementar mas desperdiça espaço. A solução padrão é guardar o comprimento **ANTES** do dado:

```plaintext
┌────────────┬──────────────────┬───────────┬──────────────────┐
│ key_len    │     key          │  val_len  │     value        │
│ (2 bytes)  │ (key_len bytes)  │ (2 bytes) │ (val_len bytes)  │
└────────────┴──────────────────┴───────────┴──────────────────┘
```

> Isso se chama **length-prefixed encoding** (e é o que a maioria dos bancos usa)

## Definições

Nem só string e nem só binário puro: **um valor tem um tipo explícito** e nós suportaremos um conjunto pequeno deles:

```plaintext
string | integer | float | boolean | null
```

Por quê? Isso vai nos forçar a implementar um **type tag**: um byte que precede o valor e diz como interpretá-lo, assim como bancos reais fazem; além de que o custo de implementação é baixo enquanto o aprendizado é alto. A chave vai continuar sendo uma simples `string`, isso faz sentido semanticamente e simplifica a `B-tree` pra frente

---

A melhor* arquitetura separa as duas representações em camadas distintas:

```plaintext
Cell (em memória)   -> serialização   -> bytes (no disco)
^                                         ^
{                                         [Buffer / Uint8Array]
  key: string
  value: OrlonValue
}
```

`Cell` representa o dado como pensamos nele (conceitualmente), enquanto a camada de serialização é responsável por converter para bytes (e voltar). Essas duas coisas **NUNCA** devem se misturar na mesma abstração, pois se acontecer, qualquer mudança no formato do disco vai quebrar a lógica de negócio e vice-versa, o que é um pesadelo pra manutenção.

O nome disso é **separação entre modelo lógico e modelo físico**, é um dos princípios centrais de design de storage engines.

> *pelo que eu entendi enquanto estudava

## Convertendo entre Page e bytes

Precisamos de duas funções:

```typescript
serialize(page: Page): Buffer         // Page  ->  bytes
deserialize(buffer: Buffer): Page     // bytes ->  Page
```

Para isso, usaremos os Buffers do Node.js:

```typescript
buf.writeUInt8(pageType, offset)       // Escreve 1 byte
buf.writeUInt16BE(numCells, offset)    // Escreve 2 bytes (big-endian)
buf.writeInt32BE(value, offset)        // Escreve 4 bytes com sinal
buf.writeDoubleBE(value, offset)       // Escreve 8 bytes -> IEEE 754
buf.write(str, offset, 'utf-8')        // Escreve uma string com encoding
```

> ⚠️ Eu preciso pesquisar mais sobre **Big-endian** (BE) e **Little-endian** (LE), mas a ideia geral é a ordem em que os bytes de um número multi-byte são armazenados, o BE escreve o byte mais significativo primeiro. Bancos de dados geralmente usam BE porque facilita a comparação direta de bytes, mas isso é algo que eu preciso pesquisar mais a fundo depois.

### Header

O header é fixo, então é fácil de definirmos o tamanho:

```plainscript
pageNumber: 4 bytes (32 bits)
pageType: 1 byte (0 = internal, 1 = leaf, 2 = overflow, ...)
numCells: 2 bytes (16 bits)
freeStart: 2 bytes (16 bits)

┌────────────┬──────┬───────────┬────────────┐
│ pageNumber │ type │ numCells  │ freeStart  │
│  4 bytes   │1 byte│  2 bytes  │  2 bytes   │
└────────────┴──────┴───────────┴────────────┘
byte 0     byte 4  byte 5     byte 7       byte 9
```

Após o byte 9, começam as cells. E `freeStart` vai apontar para o primeiro byte livre depois das cells já escritas.

#### E se o Buffer estiver zerado?

O `type` retornaria 0 (internal), é um tipo válido, mas a questão é que o dado é inválido: um buffer zerado não é uma página real (o `pageNumber` seria 0, `numCells` seria 0, etc). Então é importante checar no `fromBuffer` se o `pageNumber` lido bate com o esperado, e lançar um erro se parece corrompido.

### Cells

Uma cell tem tamanho variável, a chave e o valor podem ter qualquer tamanho, então o formato que vamos usar é o **length-prefixed encoding** (que falamos antes):

```plaintext

┌────────────┬───────────────┬───────────┬─────────────────────┐
│  keyLen    │      key      │  valType  │        value        │
│  2 bytes   │ key_len bytes │  1 byte   │  tamanho variável   │
└────────────┴───────────────┴───────────┴─────────────────────┘
```

O `valType` é um byte que indica COMO interpretar os bytes do valor (exatamente o type tag que citamos antes). Além disso, é interessante saber o espaço ocupado por cada tipo de valor no discord:

- string*: 2 bytes + (n) bytes
- integer**: 4~8 bytes
- float: 8 bytes
- boolean: 1 byte
- null: 0 bytes (só precisamos do type tag dizendo que o valor é nulo, mas 0 bytes de valor)

> *Depende do encoding: ASCII, UTF-8 etc
> **O padrão para bancos é de 4 a 8 bytes (int32 e int64), usaremos 8

E vale lembrar que TODA cell tem o prefixo da chave (`2 + n bytes`) e o type tag do valor (`1 byte`).
