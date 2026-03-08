# Fazendo um DB Key-Value (KV)

Considerando que eu já tenho certo conhecimento sobre como funcionam DBs (relacionais, KV, etc), vamos pular direto para algumas perguntas e tópicos (que eu acredito saber a resposta por parecerem lógicamente óbvias, mas estudar também é rever conceitos e ter certeza de que realmente os entendi):

- Por que não dá pra simplesmente ler o arquivo `orlon.db` com 1mi de pares KV e procurar a chave `user:500000`? O que isso custaria e o que precisaria existir para que a busca fosse eficiente?

Explicando apenas de forma superficial (ainda vamos abordar outros tópicos que também se encaixariam nessa resposta, mas não quero ramificar muito), o I/O seria extremamente custoso, já que o arquivo teria que ser lido inteiro para encontrar a chave. A leitura sequencial é O(n), e com 1mi de entradas isso se torna completamente inaceitável.

Existe uma diferença (colossal) de velocidade entre acessar dados em memória e acessar dados no disco:

| Operação | Tempo aprox |
| --- | --- |
| Acessar 1 byte na RAM | ~100 nanosegundos (0.00000001 segundos) |
| Ler um bloco do SSD | ~100 microsegundos (0.0001 segundos) |
| Ler um bloco do HDD | ~10 milissegundos (0.01 segundos) |

Um HD mecânico é cerca de **100.000x** mais lento que a RAM. Mesmo um SSD, que é muito mais rápido, ainda é cerca de **10.000x** mais lento que a RAM. TODA a arquitetura de um Storage Engine existe por causa dessa tabela.

## Como fazer buscas eficientes?

Um banco de dados nunca lê bytes individuais do disco, ele lê páginas: blocos de tamanho fixo (geralmente 4~8 KB).

> Ah mas eu só quero 10 bytes

Vai receber 4 KB mesmo assim (4096 bytes) ¯\\\_(ツ)\_/¯. E isso não é um desperdício ou um problema, é uma decisão arquitetural, logo a pergunta passa a ser:

- Como organizar os dados no disco, de forma que, NA MAIORIA das buscas, eu precise ler o menor número possível de páginas?

No caso do `GET user:500000` com 1mi de pares KV:

1. **Busca linear**: Até 1mi de páginas lidas no pior caso
2. **B-Tree com altura 3-4**: Cerca de 3-4 páginas lidas no pior caso, independente do tamanho do banco de dados.

[Páginas](./pages.md) ->
