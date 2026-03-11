import * as fs from "fs";
import { PAGE_SIZE } from "./page";

const PAGE_ENTRY = 0x01; // Indicates a page write entry in the WAL file
const COMMIT_ENTRY = 0xFF; // Indicates a commit entry in the WAL file, marking the end of a transaction

class WAL {
  private fileDescriptor: number | null = null;

  // Identical to the one in Pager, but we don't want to import it here
  open(filepath: string): void {
    if (this.fileDescriptor !== null) {
      throw new Error("File already opened");
    }

    // if file doesn't exist, create it with w+ flag, otherwise open it with r+ flag
    if (!fs.existsSync(filepath)) {
      this.fileDescriptor = fs.openSync(filepath, "w+");
    } else {
      this.fileDescriptor = fs.openSync(filepath, "r+");
    }
  }

  // [1 byte: PAGE_ENTRY][4 bytes: pageNumber][PAGE_SIZE bytes: buffer]
  writePage(pageNumber: number, buffer: Buffer): void {
    if (this.fileDescriptor === null) {
      throw new Error("WAL not opened");
    }

    const entry = Buffer.alloc(1 + 4 + PAGE_SIZE);
    entry.writeUInt8(PAGE_ENTRY, 0);
    entry.writeUInt32BE(pageNumber, 1);

    buffer.copy(entry, 5);

    const position = fs.fstatSync(this.fileDescriptor).size;
    fs.writeSync(this.fileDescriptor, entry, 0, entry.length, position);
  }

  writeCommit(): void {
    if (this.fileDescriptor === null) {
      throw new Error("WAL not opened");
    }

    const entry = Buffer.alloc(1);
    entry.writeUInt8(COMMIT_ENTRY, 0);

    const position = fs.fstatSync(this.fileDescriptor).size;
    fs.writeSync(this.fileDescriptor, entry, 0, 1, position);
  }

  // With the callback fn, WAL doesn't needs to know about the Pager directly :D
  recover(applyPage: (pageNumber: number, buffer: Buffer) => void): boolean {
    if (this.fileDescriptor === null) {
      throw new Error("WAL not opened");
    }

    const fileSize = fs.fstatSync(this.fileDescriptor).size;

    const pages: { pageNumber: number; buffer: Buffer }[] = [];
    let offset = 0;
    let hasCommit = false;

    while (offset < fileSize) {
      const entryType = Buffer.alloc(1);
      // Read the entry type (1 byte) at the current offset
      fs.readSync(this.fileDescriptor, entryType, 0, 1, offset);

      // If the entry type indicates a page write, read the page number and buffer
      if (entryType.readUInt8(0) === PAGE_ENTRY) {
        // Read the page number (4 bytes) following the entry type
        const pageNumberBuffer = Buffer.alloc(4);
        fs.readSync(this.fileDescriptor, pageNumberBuffer, 0, 4, offset + 1);

        // Read the page buffer (PAGE_SIZE bytes) following the page number
        const pageNumber = pageNumberBuffer.readUInt32BE(0);
        const pageBuffer = Buffer.alloc(PAGE_SIZE);

        // Read the page buffer (PAGE_SIZE bytes) following the page number
        fs.readSync(this.fileDescriptor, pageBuffer, 0, PAGE_SIZE, offset + 5);
        pages.push({ pageNumber, buffer: pageBuffer });

        offset += 1 + 4 + PAGE_SIZE;
      } else if (entryType.readUInt8(0) === COMMIT_ENTRY) {
        hasCommit = true;
        offset += 1;
      } else {
        throw new Error("Invalid WAL entry type");
      }
    }

    if (hasCommit) {
      for (const { pageNumber, buffer } of pages) {
        applyPage(pageNumber, buffer);
      }
    }

    return hasCommit;
  }

  truncate(): void {
    if (this.fileDescriptor === null) {
      throw new Error("WAL not opened");
    }
    fs.ftruncateSync(this.fileDescriptor, 0);
  }

  close(): void {
    if (this.fileDescriptor === null) {
      throw new Error("File not opened");
    }

    fs.closeSync(this.fileDescriptor);
    this.fileDescriptor = null;
  }
}

export default WAL;
