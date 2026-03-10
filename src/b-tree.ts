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

    // Preventive split strategy
    const root = pageToNode(this.pager.read(this.rootPageNumber));
    if (root.keys.length > 2 * this.order - 1) {
      this.splitRoot();
    }

    let node = pageToNode(this.pager.read(this.rootPageNumber));

    while (!node.isLeaf) {
      const internal = node as BTreeInternalNode;

      let idx = internal.keys.findIndex(k => key < k);
      if (idx === -1) idx = internal.children.length - 1;

      // 1. If index is -1, it means the key is greater than all existing keys, so we push it to the end.
      // 2. If the key already exists at idx, we update the value.
      // 3. Otherwise, we insert the key and value at the correct position to maintain order.

      // Children full = split before going down
      const child = pageToNode(this.pager.read(internal.children[idx]));
      if (child.keys.length > 2 * this.order - 1) {
        this.splitChild(internal, idx);
        // After the split, the separator has moved up — re-evaluate which child to descend
        if (key >= internal.keys[idx]) idx++;
      }

      node = pageToNode(this.pager.read(internal.children[idx]));
    }

    // Arrived at leaf, insert the key and value
    const leaf = node as BTreeLeaf;
    const idx = leaf.keys.findIndex(k => k >= key);

    if (idx === -1) {
      leaf.keys.push(key);
      leaf.values.push(value);
    } else if (leaf.keys[idx] === key) {
      leaf.values[idx] = value;
    } else {
      leaf.keys.splice(idx, 0, key);
      leaf.values.splice(idx, 0, value);
    }

    this.pager.write(leafToPage(leaf));
  }

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

    rightNode.keys = rootNode.keys.slice(mid);
    rightNode.values = (rootNode as BTreeLeaf).values.slice(mid);

    this.pager.write(leafToPage(leftNode));
    this.pager.write(leafToPage(rightNode));

    const newRoot = createInternalNode(newRootPageNumber);
    newRoot.keys = [separator];
    newRoot.children = [leftPageNumber, rightPageNumber];

    this.pager.write(internalToPage(newRoot)); // <- store the new root page on disk
    this.updateRoot(newRootPageNumber);        // <- updates the metadata
  }

  // Auxiliary fn, helps with a preventive split strategy: since we explore the tree top-down, we can split nodes on the way down if we know they are full,
  // so that when we reach the leaf where we want to insert, we are sure it has space for the new key.
  splitChild(parent: BTreeInternalNode, childIndex: number): void {
    // Read the child
    const childPageNumber = parent.children[childIndex];
    const child = pageToNode(this.pager.read(childPageNumber)) as BTreeLeaf;

    // Separator is the middle key
    const mid = Math.floor(child.keys.length / 2);
    const separator = child.keys[mid];

    // Creates the right node with a new page
    const rightPagerNumber = this.pager.getPageCount();
    const rightNode = createLeaf(rightPagerNumber);

    // Right node gets the keys[mid..] e value[mid..]
    rightNode.keys = child.keys.slice(mid);
    rightNode.values = child.values.slice(mid);

    // Truncates the children to the keys[0..mid-1] and values[0..mid-1]
    child.keys = child.keys.slice(0, mid);
    child.values = child.values.slice(0, mid);

    // Inserts the separator in the parent at the childIndex and childIndex + 1 with the right node page number
    parent.keys.splice(childIndex, 0, separator);
    parent.children.splice(childIndex + 1, 0, rightPagerNumber);

    // Stores the updated child, right node and parent back to disk
    this.pager.write(leafToPage(child));
    this.pager.write(leafToPage(rightNode));
    this.pager.write(internalToPage(parent));
  }

  updateRoot(newRootPageNumber: number): void {
    const metaData = Buffer.alloc(PAGE_SIZE);

    metaData.writeUInt32BE(MAGIC_HEADER, 0);
    metaData.writeUInt32BE(newRootPageNumber, 4);

    this.rootPageNumber = newRootPageNumber;
    this.pager.writeRaw(0, metaData);
  }

  delete(key: string): void {
    if (this.rootPageNumber === null) {
      throw new Error("BTree not opened");
    }

    const path: Array<{ node: BTreeInternalNode, childIndex: number }> = [];
    let node = pageToNode(this.pager.read(this.rootPageNumber));

    // Traverse the tree top-down to find the leaf node with the key
    while (!node.isLeaf) {
      const internal = node as BTreeInternalNode;

      // Find the child index to descend into. If the key is less than all keys, we go to the first child.
      // If it's greater than all keys, we go to the last child. Otherwise, we find the correct child index based on the keys.
      let idx = internal.keys.findIndex(k => key < k);
      if (idx === -1) idx = internal.children.length - 1;

      // Push the current internal node and child index to the path for potential backtracking
      path.push({ node: internal, childIndex: idx });
      node = pageToNode(this.pager.read(internal.children[idx]));
    }

    // We are now at the leaf node. We look for the key in the leaf's keys array. If found, we remove the key and its corresponding value.
    const leaf = node as BTreeLeaf;
    const idx = leaf.keys.indexOf(key);
    if (idx === -1) return; // Key not found

    // Remove the key and value from the leaf node
    leaf.keys.splice(idx, 1);
    leaf.values.splice(idx, 1);
    this.pager.write(leafToPage(leaf));

    // Detect underflow: if the leaf node has less than order - 1 keys, we need to rebalance the tree
    const minKeys = this.order - 1;
    if (leaf.keys.length < minKeys) {
      this.fixLeaf(leaf, path);
    }
  }

  private fixLeaf(leaf: BTreeLeaf, path: Array<{ node: BTreeInternalNode, childIndex: number }>): void {
    // If there's no parent, we are at the root and we can just return
    if (path.length === 0) return;

    const { node: parent, childIndex } = path[path.length - 1];

    // Tries to redistribute with the right sibling
    const rightSiblingIdx = childIndex + 1;
    if (rightSiblingIdx < parent.children.length) {
      const rightSibling = pageToNode(this.pager.read(parent.children[rightSiblingIdx])) as BTreeLeaf;

      if (rightSibling.keys.length > this.order - 1) {
        // Borrow the first key from the right sibling
        leaf.keys.push(rightSibling.keys.shift()!);
        leaf.values.push(rightSibling.values.shift()!);

        // Updates the separator in the parent to be the new first key of the right sibling
        parent.keys[childIndex] = rightSibling.keys[0];

        this.pager.write(leafToPage(leaf));
        this.pager.write(leafToPage(rightSibling));
        this.pager.write(internalToPage(parent));
        return;
      }
    }

    // Tries to redistribute with the left sibling
    const leftSiblingIdx = childIndex - 1;
    if (leftSiblingIdx >= 0) {
      const leftSibling = pageToNode(this.pager.read(parent.children[leftSiblingIdx])) as BTreeLeaf;

      if (leftSibling.keys.length > this.order - 1) {
        // Borrow the last key from the left sibling
        leaf.keys.unshift(leftSibling.keys.pop()!);
        leaf.values.unshift(leftSibling.values.pop()!);

        // Updates the separator in the parent to be the new first key of the current leaf
        parent.keys[leftSiblingIdx] = leaf.keys[0];

        this.pager.write(leafToPage(leaf));
        this.pager.write(leafToPage(leftSibling));
        this.pager.write(internalToPage(parent));
        return;
      }
    }

    // If neither sibling has extra keys to borrow, merge with a sibling
    if (rightSiblingIdx < parent.children.length) {
      const rightSibling = pageToNode(this.pager.read(parent.children[rightSiblingIdx])) as BTreeLeaf;

      // Absorb all keys from the right sibling
      leaf.keys.push(...rightSibling.keys);
      leaf.values.push(...rightSibling.values);

      // Removes the separator from the parent and the pointer to the right sibling
      parent.keys.splice(childIndex, 1);
      parent.children.splice(rightSiblingIdx, 1);

      this.pager.write(leafToPage(leaf));
      this.pager.write(internalToPage(parent));

      // If the parent is now underflowed, we propagate the fix up the tree
      if (parent.keys.length < this.order - 1) {
        this.fixInternal(parent, path.slice(0, -1));
      }

      // If the root node has no keys after the merge, promotes the only child as the new root
      if (parent.pageNumber === this.rootPageNumber && parent.keys.length === 0) {
        this.updateRoot(leaf.pageNumber);
      }

      return;
    }
  }

  // Propagates the underflow up the tree, trying to redistribute or merge internal nodes as needed.
  private fixInternal(node: BTreeInternalNode, path: Array<{ node: BTreeInternalNode, childIndex: number }>): void {
    if (path.length === 0) return; // Reached the root, nothing more to fix

    // Tries to redistribute, otherwise merges, similar to fixLeaf but for internal nodes.
    const { node: parent, childIndex } = path[path.length - 1];

    // Tries to redistribute with the right sibling
    const rightSiblingIdx = childIndex + 1;
    if (rightSiblingIdx < parent.children.length) {
      const rightSibling = pageToNode(this.pager.read(parent.children[rightSiblingIdx])) as BTreeInternalNode;

      if (rightSibling.keys.length > this.order - 1) {
        // Borrow the first key from the right sibling
        node.keys.push(parent.keys[childIndex]);
        parent.keys[childIndex] = rightSibling.keys.shift()!;
        node.children.push(rightSibling.children.shift()!);

        this.pager.write(internalToPage(node));
        this.pager.write(internalToPage(rightSibling));
        this.pager.write(internalToPage(parent));
        return;
      }
    }

    // Tries to redistribute with the left sibling
    const leftSiblingIdx = childIndex - 1;
    if (leftSiblingIdx >= 0) {
      const leftSibling = pageToNode(this.pager.read(parent.children[leftSiblingIdx])) as BTreeInternalNode;

      if (leftSibling.keys.length > this.order - 1) {
        // Borrow the last key from the left sibling
        node.keys.unshift(parent.keys[leftSiblingIdx]);
        parent.keys[leftSiblingIdx] = leftSibling.keys.pop()!;
        node.children.unshift(leftSibling.children.pop()!);

        this.pager.write(internalToPage(node));
        this.pager.write(internalToPage(leftSibling));
        this.pager.write(internalToPage(parent));
        return;
      }
    }

    // If neither sibling has extra keys to borrow, merge with a sibling
    if (rightSiblingIdx < parent.children.length) {
      const rightSibling = pageToNode(this.pager.read(parent.children[rightSiblingIdx])) as BTreeInternalNode;

      // Absorb all keys and children from the right sibling
      node.keys.push(parent.keys[childIndex], ...rightSibling.keys);
      node.children.push(...rightSibling.children);

      // Removes the separator from the parent and the pointer to the right sibling
      parent.keys.splice(childIndex, 1);
      parent.children.splice(rightSiblingIdx, 1);

      this.pager.write(internalToPage(node));
      this.pager.write(internalToPage(parent));

      // If the parent is now underflowed, we propagate the fix up the tree
      if (parent.keys.length < this.order - 1) {
        this.fixInternal(parent, path.slice(0, -1));
      }

      // If the root node has no keys after the merge, promotes the only child as the new root
      if (parent.pageNumber === this.rootPageNumber && parent.keys.length === 0) {
        this.updateRoot(node.pageNumber);
      }
      return;
    }
  }
}

export default BTree;
