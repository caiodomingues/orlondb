import Page, { Cell, OrlonValue, PageTypeCode } from "./page";

export interface BTreeNode {
  pageNumber: number;     // Where this node is stored on disk
  isLeaf: boolean;        // Whether this node is a leaf or internal node
}

export interface BTreeLeaf extends BTreeNode {
  keys: string[];         // Ordered keys
  values: OrlonValue[];   // Corresponding values
}

export interface BTreeInternalNode extends BTreeNode {
  keys: string[];         // Separators
  children: number[];     // Page numbers of child nodes
}

export function createLeaf(pageNumber: number): BTreeLeaf {
  return {
    pageNumber,
    isLeaf: true,
    keys: [],
    values: []
  };
}

export function createInternalNode(pageNumber: number): BTreeInternalNode {
  return {
    pageNumber,
    isLeaf: false,
    keys: [],
    children: []
  };
}

export function leafToPage(node: BTreeLeaf): Page {
  return new Page({
    pageNumber: node.pageNumber,
    type: PageTypeCode.leaf,
    numCells: node.keys.length,
    freeStart: 9,
    cells: node.keys.map((key, i) => ({
      key,
      value: node.values[i]
    }))
  });
}

export function internalToPage(node: BTreeInternalNode): Page {
  const cells: Cell[] = [];

  // First the keys as strings with null values (since internal nodes don't store actual values)
  for (const key of node.keys) {
    cells.push({ key, value: { type: 'null', value: null } });
  }

  // Then the child pointers as integer values with empty keys (since they don't have associated keys)
  for (const child of node.children) {
    cells.push({ key: '', value: { type: 'integer', value: child } });
  }

  return new Page({
    pageNumber: node.pageNumber,
    type: PageTypeCode.internal,
    numCells: cells.length,
    freeStart: 9,
    cells
  });
}

export function pageToNode(page: Page): BTreeLeaf | BTreeInternalNode {
  // if type = leaf, rebuild the leaf node from cells, if type = internal, rebuild internal node
  if (page.getType() === PageTypeCode.leaf) {
    const node = createLeaf(page.getPageNumber());
    for (const cell of page.getCells()) {
      node.keys.push(cell.key);
      node.values.push(cell.value);
    }
    return node;
  } else if (page.getType() === PageTypeCode.internal) {
    const node = createInternalNode(page.getPageNumber());
    for (const cell of page.getCells()) {
      if (cell.value.type === 'integer') {
        node.children.push(cell.value.value); // child pointer
      } else {
        node.keys.push(cell.key); // separator key
      }
    }
    return node;
  }

  throw new Error(`Unknown page type: ${page.getType()}`);
}
