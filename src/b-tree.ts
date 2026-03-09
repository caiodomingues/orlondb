import { BTreeInternalNode, BTreeLeaf, createInternalNode, createLeaf, internalToPage, leafToPage, pageToNode } from "./btree-node";
import Page, { OrlonValue, PAGE_SIZE, PageTypeCode } from "./page";
import Pager from "./pager";

const MAGIC_HEADER = 0x4F524C4E; // "ORLN" in hex

class BTree {
  private rootPageNumber: number | null = null;

  constructor(private pager: Pager, private order: number) { }

  open(): void {
    const metaData = this.pager.readRaw(0);

    // When a BTree is initialized, it does not have a root node. We verify for a magic value (like SQLite does with its header with "SQLite Version 3" at the beginning of the file)
    // So we read the first 4 bytes as UInt32. If the magic value is present, we read the root page number from the next 4 bytes and load the root node into memory
    if (metaData.readUInt32BE(0) === MAGIC_HEADER) {
      this.rootPageNumber = metaData.readUInt32BE(4);
    } else {
      // New DB: write the magic header, initialize rootPageNumber as 1, store page 0 and write the first page at pageNumber 1
      const newMetaData = Buffer.alloc(PAGE_SIZE);
      newMetaData.writeUInt32BE(MAGIC_HEADER, 0);   // Write magic header from 0 to 3
      newMetaData.writeUInt32BE(1, 4);              // Write root page number (1) from 4 to 7
      this.rootPageNumber = 1;

      this.pager.writeRaw(0, newMetaData);

      // Create the root node as a leaf node and write it to page number 1
      const rootNode = createLeaf(this.rootPageNumber);
      const rootPage = leafToPage(rootNode);
      this.pager.write(rootPage);
    }
  }

  // Start on root -> if it's a leaf, linear search for the keys (return value or null) OR if it's internal -> find the right children and go down
  search(key: string): OrlonValue | null {
    if (this.rootPageNumber === null) throw new Error("BTree not opened");

    let node = pageToNode(this.pager.read(this.rootPageNumber));

    while (!node.isLeaf) {
      const internal = node as BTreeInternalNode;
      const idx = internal.keys.findIndex(k => key < k);
      const childPageNumber = idx === -1
        ? internal.children[internal.children.length - 1]  // Bigger than all keys
        : internal.children[idx];
      node = pageToNode(this.pager.read(childPageNumber));
    }

    const leaf = node as BTreeLeaf;
    const idx = leaf.keys.indexOf(key);
    return idx !== -1 ? leaf.values[idx] : null;
  }

  // Load the root node, find the correct position to insert (keeping the keys ordered), insert the KV and save the page back to disk
  insert(key: string, value: OrlonValue): void {
    if (this.rootPageNumber === null) {
      throw new Error("BTree not opened");
    }

    const node = pageToNode(this.pager.read(this.rootPageNumber));
    if (node.isLeaf) {
      const leaf = node as BTreeLeaf;
      const idx = leaf.keys.findIndex(k => k >= key);

      // 1. If index is -1, it means the key is greater than all existing keys, so we push it to the end.
      // 2. If the key already exists at idx, we update the value.
      // 3. Otherwise, we insert the key and value at the correct position to maintain order.
      if (idx === -1) {
        leaf.keys.push(key);
        leaf.values.push(value);
      } else if (leaf.keys[idx] === key) {
        leaf.values[idx] = value; // Update existing key
      } else {
        leaf.keys.splice(idx, 0, key);
        leaf.values.splice(idx, 0, value);
      }

      this.pager.write(leafToPage(leaf));

      if (leaf.keys.length > 2 * this.order - 1) {
        this.splitRoot();
      }
      return;
    } else if (!node.isLeaf) {
      throw new Error("Internal node insert not implemented yet");
    }

    throw new Error(`Unknown node type: ${node}`);
  }

  splitLeaf(node: BTreeLeaf): void { }

  splitRoot(): void {
    if (this.rootPageNumber === null) {
      throw new Error("BTree not opened");
    }

    const rootNode = pageToNode(this.pager.read(this.rootPageNumber));
    const mid = Math.floor(rootNode.keys.length / 2);

    const separator = rootNode.keys[mid];

    const leftPageNumber = this.rootPageNumber;
    const rightPageNumber = this.pager.getPageCount();
    const newRootPageNumber = this.pager.getPageCount() + 1;

    const leftNode = createLeaf(leftPageNumber);
    const rightNode = createLeaf(rightPageNumber);

    leftNode.keys = rootNode.keys.slice(0, mid);
    leftNode.values = (rootNode as BTreeLeaf).values.slice(0, mid);
    rightNode.keys = rootNode.keys.slice(mid + 1);
    rightNode.values = (rootNode as BTreeLeaf).values.slice(mid + 1);

    this.pager.write(leafToPage(leftNode));
    this.pager.write(leafToPage(rightNode));

    const newRoot = createInternalNode(newRootPageNumber);
    newRoot.keys = [separator];
    newRoot.children = [leftPageNumber, rightPageNumber];

    this.pager.write(internalToPage(newRoot)); // <- store the new root page on disk
    this.updateRoot(newRootPageNumber);        // <- updates the metadata
  }

  updateRoot(newRootPageNumber: number): void {
    const metaData = Buffer.alloc(PAGE_SIZE);

    metaData.writeUInt32BE(MAGIC_HEADER, 0);
    metaData.writeUInt32BE(newRootPageNumber, 4);

    this.rootPageNumber = newRootPageNumber;
    this.pager.writeRaw(0, metaData);
  }
}

export default BTree;
