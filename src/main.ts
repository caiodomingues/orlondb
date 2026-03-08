import Page, { PageTypeCode } from "./page";
import Pager from "./pager";

const pager = new Pager();
pager.open('./orlon.db');

const page = new Page({
  pageNumber: 0,
  type: PageTypeCode.leaf,
  numCells: 2,
  freeStart: 9,
  cells: [
    { key: 'name', value: { type: 'string', value: 'orlon' } },
    { key: 'level', value: { type: 'integer', value: 99 } },
  ]
});

pager.write(page);
pager.close();

// Kinda simulating a restart of the DB, so we can see if data is persisted correctly;
const pager2 = new Pager();
pager2.open('./orlon.db');
const recovered = pager2.read(0);
console.log(JSON.stringify(recovered, null, 2));
pager2.close();
