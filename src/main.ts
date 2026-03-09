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
