import BTree from "./b-tree";
import Pager from "./pager";

const pager = new Pager();
pager.open('./orlon.db');
const tree = new BTree(pager, 2);
tree.open();

// Write tests below ======================================

tree.insert('apple', { type: 'integer', value: 1 });
tree.insert('banana', { type: 'integer', value: 2 });
tree.insert('cherry', { type: 'integer', value: 3 });
tree.insert('date', { type: 'integer', value: 4 });

tree.delete('apple');
tree.delete('banana'); // força merge

console.log(tree.search('cherry')); // 3
console.log(tree.search('date'));   // 4
console.log(tree.search('apple')); // null
console.log(tree.search('banana')); // null

// Write test above ======================================

pager.close();
