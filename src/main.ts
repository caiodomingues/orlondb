import BTree from "./b-tree";
import Pager from "./pager";

const pager = new Pager();
pager.open('./orlon.db');
const tree = new BTree(pager, 2);
tree.open();
tree.insert('banana', { type: 'integer', value: 1 });
tree.insert('apple', { type: 'integer', value: 2 });
tree.insert('cherry', { type: 'integer', value: 3 });
tree.insert('date', { type: 'integer', value: 4 });
tree.insert('elderberry', { type: 'integer', value: 5 });
tree.insert('fig', { type: 'integer', value: 6 });
tree.insert('grape', { type: 'integer', value: 7 });

console.log(tree.search('apple'));
console.log(tree.search('cherry'));
console.log(tree.search('elderberry'));
console.log(tree.search('grape'));
console.log(tree.search('zzz'));

pager.close();
