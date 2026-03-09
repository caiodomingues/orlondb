import * as fs from "fs";

import Page, { PAGE_SIZE } from "./page";

class Pager {
  private fileDescriptor: number | null = null;

  constructor() { }

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

  read(pageNumber: number): Page {
    if (this.fileDescriptor === null) {
      throw new Error("File not opened");
    }

    // If page exists in the file: read the bytes and return Page.fromBuffer(buffer)
    // If page doesn't exist in the file: return a Page.fromBuffer(Buffer.alloc(PAGE_SIZE)) - an empty page with zeroed values
    if (fs.fstatSync(this.fileDescriptor).size >= (pageNumber + 1) * PAGE_SIZE) {
      const buffer = Buffer.alloc(PAGE_SIZE);

      // fd, buffer, offset, length, position
      fs.readSync(this.fileDescriptor, buffer, 0, PAGE_SIZE, pageNumber * PAGE_SIZE);

      return Page.fromBuffer(buffer);
    } else {
      return Page.fromBuffer(Buffer.alloc(PAGE_SIZE));
    }
  }

  // Sometimes we might want the Buffer instead of the page
  readRaw(pageNumber: number): Buffer {
    if (this.fileDescriptor === null) {
      throw new Error("File not opened");
    }

    if (fs.fstatSync(this.fileDescriptor).size >= (pageNumber + 1) * PAGE_SIZE) {
      const buffer = Buffer.alloc(PAGE_SIZE);

      // fd, buffer, offset, length, position
      fs.readSync(this.fileDescriptor, buffer, 0, PAGE_SIZE, pageNumber * PAGE_SIZE);
      return buffer;
    } else {
      return Buffer.alloc(PAGE_SIZE);
    }
  }

  write(page: Page): void {
    if (this.fileDescriptor === null) {
      throw new Error("File not opened");
    }

    const bytes = page.toBuffer();
    const offset = page.getPageNumber() * PAGE_SIZE;

    // fd, buffer, offset, length, position
    fs.writeSync(this.fileDescriptor, bytes, 0, PAGE_SIZE, offset);
  }

  writeRaw(pageNumber: number, buffer: Buffer): void {
    if (this.fileDescriptor === null) {
      throw new Error("File not opened");
    }

    const offset = pageNumber * PAGE_SIZE;

    // fd, buffer, offset, length, position
    fs.writeSync(this.fileDescriptor, buffer, 0, PAGE_SIZE, offset);
  }

  close(): void {
    if (this.fileDescriptor === null) {
      throw new Error("File not opened");
    }

    fs.closeSync(this.fileDescriptor);
    this.fileDescriptor = null;
  }

  getPageCount(): number {
    if (this.fileDescriptor === null) {
      throw new Error("File not opened");
    }
    return Math.floor(fs.fstatSync(this.fileDescriptor).size / PAGE_SIZE);
  }
}

export default Pager;
