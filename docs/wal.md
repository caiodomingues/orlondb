# Write-Ahead Log (WAL)

Imagina que você executa `SET name orlon`. Por baixo dos panos, isso pode envolver várias operações no disco (umas 3 páginas +-), a folha com o valor, talvez um nó interno após um split, e a metadata com um no `rootPageNumber`.

O que acontece se a luz acabar depois de escrever a primeira página e antes das outras duas?

O arquivo ficou **parcialmente** atualizado. Na próxima abertura, o banco lê uma estrutura incosistente: a árvore está quebrada e você não tem como saber o que estava sendo feito, resultando em dados irrecuperáveis.

Esse é o problema, e a solução é o WAL.

## A ideia central do WAL

> Antes de modificar qualquer página no arquivo principal, escreve o que você vai fazer num de arquivo de log separado.

O log é append-only: você só adiciona entradas no final, nunca modifica o que já está lá. Cada entrada descreve uma operação:

```plaintext
[operação 1: escrever página 2 com bytes XYZ]
[operação 2: escrever página 3 com bytes ABC]
[operação 3: COMMIT]
```

O `COMMIT` é a linha que separa "em progresso" de "concluído". Só após o COMMIT você escreve as páginas no arquivo principal.

Se o processo morrer antes do COMMIT, na reabertura do banco, você vê um log sem COMMIT: ignora tudo e o arquivo principal está intacto.

Se morrer depois do COMMIT mas antes de terminar de escrever as páginas, na reabertura o banco vê um COMMIT no log: **re-aplica** as operações; os dados são recuperados.

## O formato do log

Cada entrada no `orlon.wal` vai ter:

```plaintext
┌──────────────┬───────────────┬───────────────────────┐
│    type      │  pageNumber   │         data          │
│   (1 byte)   │   (4 bytes)   │   (PAGE_SIZE bytes)   │
└──────────────┴───────────────┴───────────────────────┘
```

Onde `type` pode ser:

- `0x01` -> PAGE: uma página a ser escrita
- `0xFF` -> COMMIT: fim da transação

Uma transação ficaria assim no log:

```plaintext
PAGE página 2 [bytes da folha esquerda]
PAGE página 3 [bytes da folha direita]
PAGE página 4 [bytes da nova raiz]
PAGE página 0 [bytes da metadata atualizada]
COMMIT
```

## O fluxo completo com WAL

```plaintext
INSERT "name" "orlon"
  │
  ├─ 1. Escreve PAGE entries no .wal para cada página modificada
  ├─ 2. Escreve COMMIT no .wal
  ├─ 3. Escreve as páginas no .db
  └─ 4. Trunca o .wal (transação concluída)

OPEN (após crash)
  │
  ├─ Tem COMMIT no .wal? -> re-aplica as PAGEs no .db -> trunca o .wal
  ├─ sem COMMIT no .wal? -> ignora o .wal, o .db está intacto/consistente
```
