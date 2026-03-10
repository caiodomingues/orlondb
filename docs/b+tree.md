# B+Tree

Depois de implementar a B-Tree e fazer um teste:

```typescript
import BTree from "./b-tree";
import Pager from "./pager";

const pager = new Pager();
pager.open('./orlon.db');

const tree = new BTree(pager, 2);
tree.open();

console.log(tree.search('banana'));  // { type: 'integer', value: 1 }
console.log(tree.search('cherry'));  // { type: 'integer', value: 3 }
console.log(tree.search('date'));    // { type: 'integer', value: 4 }
console.log(tree.search('zzz'));     // null

pager.close();
```

`cherry` e `zzz` estão retornando `null`. O que está acontecendo? O split está fazendo o seguinte:

```plaintext
mid = 2, separator = "cherry"

leftNode: keys[0..1] = ["apple", "banana"]
rightNode: keys[3..] = ["date"]
```

`cherry` sumiu: ela subiu como separador para o nó interno mas não ficou em nenhuma folha, o valor associado a ela se perdeu.

Depois de pesquisar um pouco: Outros bancos usam B+Tree.

> ... tá, eu devia ter pesquisado direito antes de implementar, mas tudo bem, serviu de estudos.

## B-Tree vs B+Tree

Numa B-Tree pura, os valores ficam em todos os nós (inclusive nos internos). O separador que sobe carrega seu valor junto. É mais complexo de implementar e raramente usado em bancos reais.

Já numa B+Tree, os nós internos guardam **apenas separadores** (sem valores), e **todas as chaves com seus valores ficam nas folhas**. Quando uma chave sobe como separador, ela é copiada para o nó interno, mas permanece na folha.

Apesar dos pesares, a mudança é simples:

```typescript
// B-Tree (errado pra KV store):
rightNode.keys = rootNode.keys.slice(mid + 1);                      // perde o separador

// B+Tree (correto):
rightNode.keys = rootNode.keys.slice(mid);                          // mantém o separador
rightNode.values = (rootNode as BTreeLeaf).values.slice(mid);   // mantém os valores
```
