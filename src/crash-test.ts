import * as fs from 'fs';
import WAL from './wal';
import Pager from './pager';
import BTree from './b-tree';
import Page, { PageTypeCode } from './page';

// Clear previous test files if they exist
if (fs.existsSync('./orlon.db')) fs.unlinkSync('./orlon.db');
if (fs.existsSync('./orlon.wal')) fs.unlinkSync('./orlon.wal');

// Insert some initial data and commit to .db
const wal1 = new WAL();
wal1.open('./orlon.wal');
const pager1 = new Pager(wal1);
pager1.open('./orlon.db');
const tree1 = new BTree(pager1, 2);
tree1.open();

tree1.insert('name', { type: 'string', value: 'orlon' });
tree1.insert('level', { type: 'integer', value: 99 });

pager1.close();
wal1.close();

// Simulate a crash after writing to WAL but before writing to .db
const wal2 = new WAL();
wal2.open('./orlon.wal');

// Write a new page to WAL that simulates an update which is not yet reflected in .db
const fakePage = new Page({
  pageNumber: 1,
  type: PageTypeCode.leaf,
  numCells: 1,
  freeStart: 9,
  cells: [{ key: 'crashed', value: { type: 'string', value: 'recovered!' } }]
});

wal2.writePage(1, fakePage.toBuffer());
wal2.writeCommit(); // COMMIT written to WAL, but we do NOT write to .db — simulating a crash here
// ...but we do NOT write to .db - crash simulated here
wal2.close();

console.log('Crash simulated. WAL has COMMIT but .db was not updated.');

// Reopen the WAL and Pager to trigger recovery
const wal3 = new WAL();
wal3.open('./orlon.wal');
const pager3 = new Pager(wal3);
pager3.open('./orlon.db'); // Recovery happens here, applying the committed page from WAL to .db

const tree3 = new BTree(pager3, 2);
tree3.open();

console.log(tree3.search('crashed')); // should return { type: 'string', value: 'recovered!' }

pager3.close();
wal3.close();
