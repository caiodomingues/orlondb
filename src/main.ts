import Page, { PageTypeCode } from "./page";

const original = new Page({
  pageNumber: 1,
  type: PageTypeCode.leaf,
  numCells: 2,
  freeStart: 9,
  cells: [
    { key: 'name', value: { type: 'string', value: 'orlon' } },
    { key: 'level', value: { type: 'integer', value: 99 } },
  ]
});

const recovered = Page.fromBuffer(original.toBuffer());

console.log('Original:', JSON.stringify(original, null, 2));
console.log('Recovered:', JSON.stringify(recovered, null, 2));
