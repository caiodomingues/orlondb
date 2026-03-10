# B-Tree

Depois de implementar as páginas e o paginador, efetivamente conseguimos ler e escrever páginas arbitrárias no disco, mas precisamos de uma estrutura que organize **quais páginas** contêm quais dados, permitindo também que encontremos qualquer chave em O(log n) leituras de página.

## O que é um B-tree?

Citamos o problema que a B-tree resolve lá no começo: acessar um arquivo com milhão de partes de valores chave-valor e fazer uma busca linear é O(n): inaceitável.

A solução óbvia seria manter as chaves ordenadas, se estiverem ordenadas, podemos fazer uma busca binária (que é O(log n)). Mas nós temos outro problema: como manter os dados no disco, onde inserir no meio é custoso? Se inserirmos uma chave nova entre duas existentes, precisamos mover **TODAS** as chaves que vem depois. Em um arquivo de 1GB isso já é catastrófico.

A B-tree também resolve esse problema: mantém as chaves ordenadas, permite busca em O(log n) e faz inserções e deleções de forma eficiente sem mover tudo.

### Estrutura

Uma B-tree é uma árvore de busca com algumas regrinhas especiais: o conceito parte de uma binary search tree (BST) padrão, mas caso você não se lembre:

Numa BST simples, cada nó tem uma chave e 2 filhos:

```plaintext
        [50]
       /    \
    [25]    [75]
    /  \    /  \
  [10][30][60][90]
```

Regra básica: tudo à esquerda é menor, tudo à direita é maior. Para encontrar `60`: compara com `50` (vai pra direita), compara com `75` (vai pra esquerda), encontra `60` em 3 comparações (ou seja, O(log n) para uma árvore balanceada).

O problema da BST em um disco é que cada nó é minúsculo (guarda uma chave só). Para uma árvore com 1mi de chaves, a altura é +- 20 (ou mais níveis). Isso significa **20 leituras de página** para encontra um registro, e cada leitura de página lê 4KB, mas nós só precisamos de 8 bytes para a chave e 8 bytes para o valor, ou seja, estamos lendo 4KB para obter 16 bytes de informação útil. Isso é um desperdício enorme.

## A ideia central da B-tree

E se cada nó pudesse guardar várias chaves em vez de uma só? Assim cada página lida traria muito mais informação útil, e a altura da árvore seria muito (muito) menor.

É exatamente isso que a B-tree faz:

```plaintext
            [30 | 70]
           /    |    \
    [10|20]  [40|50]  [80|90]
```

Esse nó raiz tem 2 chaves e 3 filhos. Para encontrar `50`, compara com `30` -> maior, compara com `70` -> menor, vai para o filho do meio, encontra `50`. Apenas 2 leituras de página.

## Os três tipos de nós

Uma B-tree tem 3 tipos de nós:

- **Root**: A raiz da árvore, é o ponto de entrada de toda busca, existe apenas uma.
- **Internal**: Nós internos (intermediários), Guardam chaves que funcionam como separadores, indicando em qual filho continuar a busca. Eles não guardam os valores, apenas as chaves (servindo apenas como direcionamento).
- **Leaf**: Folhas, guardam as chaves e os valores de fato. Toda busca termina numa folha.

Usando a árvore acima:

```plaintext
            [30 | 70]   <-- Internal (separadores)
           /    |    \
    [10|20]  [40|50]  [80|90]  <-- Leaves (dados reais :D)
```

Para `50`: lê raiz -> filho do meio -> lê folha -> encontra `50`. 2 páginas lidas.

## As regras da B-tree

Uma B-tree de ordem `t` (onde `t` é o grau mínimo) segue as seguintes regras (invariantes):

1. Todo nó tem no máximo `2t - 1` chaves.
2. Todo nó (exceto a raiz) tem no mínimo `t - 1` chaves.
3. Um nó com `k` chaves tem exatamente `k + 1` filhos.
4. Todas as folhas estão no mesmo nível (a árvore é balanceada).
5. As chaves dentro de cada nó estão **sempre** ordenadas.

A regra 4 é importante: garante que a árvore seja sempre balanceada, e portanto a busca seja O(log n).

### Rebalanceamento

O que acontece quando inserimos uma chave em uma folha que já está cheia? (`2t - 1` chaves)?

A folha **viola uma invariante**, ela passa a ter `2t` chaves, passando assim a estar em um estado inválido. Quando uma folha fica cheia, a B-tree faz um split (divisão) do nó em dois:

```plaintext

Antes do split (folha cheia, t=2, maxímo 3 chaves):
[10 | 20 | 30 | 40] <- 4 chaves, inválido

Depois do split:
[10 | 20]   [30 | 40]

E a chave do meio (20) sobe para o nó pai, que agora opera como um separador:
        [20]
       /    \
   [10]      [30 | 40]
```

Com a subida da chave do meio para o nó pai, todas as invariantes foram satisfeitas novamente. Mas agora surge uma outra questão: e se o nó pai também estiver cheio?

A resposta é a mesma: split: a chave do meio do pai sobe para o avô, esse processo pode se propagar até a raiz. E se a raiz ficar cheia? A raiz também é dividida, mas nesse caso a chave do meio sobe e se torna a nova raiz, aumentando a altura da árvore. Esse é o único caso onde a altura da árvore aumenta.

## B-tree no OrlonDB

Uma BTreeNode é essencialmente uma página com semântica específica, onde um nó interno guarda:

```plaintext
[chave1 | chave2 | ... | chaveN]
[filho0, filho1, ... , filhoN] <- números de página
```

E um nó folha guarda:

```plaintext
[chave1 | chave2 | ... | chaveN]
[valor1, valor2, ... , valorN] <- os valores associados às chaves
```

Os filhos de um nó interno são números de página, essa é a ponte entre o Pager e a B-tree, pois o Pager já sabe como carregar a página pelo n°.
