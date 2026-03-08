export type OrlonValue =
  | { type: 'string'; value: string; }
  | { type: 'integer'; value: number; }
  | { type: 'float'; value: number }
  | { type: 'boolean'; value: boolean; }
  | { type: 'null'; value: null; }

export enum PageTypeCode {
  internal = 0,
  leaf = 1,
  overflow = 2
}

export interface Cell {
  key: string;
  value: OrlonValue;
}

export interface PageData {
  type: PageTypeCode;
  numCells: number;
  freeStart: number;
  cells: Cell[];

  // We store the pageNumber for integrity, because we can surely know the page with the pageSize.
  // That's a sanity check to make sure we are not reading the wrong page or it is not corrupted.
  pageNumber: number;
}

export const PAGE_SIZE = 4096;

class Page {
  private type: PageTypeCode;
  private numCells: number;
  private freeStart: number;
  private cells: Cell[];
  private pageNumber: number;

  constructor(data: PageData) {
    this.type = data.type;
    this.numCells = data.numCells;
    this.freeStart = data.freeStart;
    this.cells = data.cells;
    this.pageNumber = data.pageNumber;
  }

  static fromBuffer(buffer: Buffer): Page {
    const pageNumber = buffer.readUint32BE(0);  // Read pageNumber from offset 0
    const type = buffer.readUInt8(4);           // Read type from offset 4
    const numCells = buffer.readUint16BE(5);    // Read numCells from offset 5
    const freeStart = buffer.readUint16BE(7);   // Read freeStart from offset 7

    const cells: Cell[] = [];
    let offset = 9;
    for (let i = 0; i < numCells; i++) {
      const { cell, newOffset } = Page.deserializeCell(buffer, offset);
      cells.push(cell);
      offset = newOffset;
    }

    const page = new Page({
      type,
      numCells,
      freeStart,
      cells,
      pageNumber
    });

    return page;
  }

  // This method needs to retrieve the header and write each one in a specific position in the buffer (4kb)
  toBuffer(): Buffer {
    const buf = Buffer.alloc(PAGE_SIZE);        // Allocate a buffer of 4KB - zeroed values by default

    // Write the header
    buf.writeUint32BE(this.pageNumber, 0);      // Write pageNumber at offset 0
    buf.writeUInt8(this.type, 4);               // Write type at offset 4
    buf.writeUint16BE(this.numCells, 5);        // Write numCells at offset 5
    buf.writeUint16BE(this.freeStart, 7);       // Write freeStart at offset 7

    // What we essentially did: write the header of the page starting from the beginning of the buffer. So:
    // byte 0-3 -> pageNumber (4 bytes, uint32be)
    // byte 4   -> type (1 byte, uint8)
    // byte 5-6 -> numCells (2 bytes, uint16be)
    // byte 7-8 -> freeStart (2 bytes, uint16be)

    // Write the cells, starting from 9
    let offset = 9;
    for (const cell of this.cells) {
      offset = Page.serializeCell(cell, buf, offset);
    }

    return buf;
  }

  static serializeCell(cell: Cell, buf: Buffer, offset: number): number {
    // Before writing the key, we need to write the length of the key as a UTF-8 string, so we can know how many bytes to read when deserializing, like:
    // [2 bytes: keyLen][keyLen bytes: key][...]
    buf.writeUInt16BE(Buffer.byteLength(cell.key, 'utf-8'), offset);
    offset += 2;

    buf.write(cell.key, offset, 'utf-8'); // Write the key as a UTF-8 string
    offset += Buffer.byteLength(cell.key, 'utf-8'); // Move the offset by the length of the key

    // Before writing the value, we need to write the type tag, so we can know how to deserialize the value later, like:
    // [1 byte: valueType][value bytes...]
    buf.writeUInt8(Page.getValueTypeTag(cell.value), offset); // Write the value type tag as a single byte
    offset += 1;

    switch (cell.value.type) {
      case 'string': {
        // Like the key, we need to write the length of the string value before writing the actual string value to deserialize it later
        buf.writeUInt16BE(Buffer.byteLength(cell.value.value, 'utf-8'), offset);
        offset += 2;
        buf.write(cell.value.value, offset, 'utf-8');
        offset += Buffer.byteLength(cell.value.value, 'utf-8');
        break;
      }

      case 'integer': {
        buf.writeBigInt64BE(BigInt(cell.value.value), offset);
        offset += 8; // Move the offset by 8 bytes
        break;
      }

      case 'float': {
        buf.writeDoubleBE(cell.value.value, offset);
        offset += 8;
        break;
      }

      case 'boolean': {
        buf.writeUInt8(cell.value.value ? 1 : 0, offset);
        offset += 1;
        break;
      }

      case 'null': {
        // For null values, just do nothing :D
        break;
      }

      default:
        throw new Error(`Unsupported value type: ${cell.value}`);
    }

    return offset; // Return the new offset after writing the cell
  }

  // We need to return the reconstructed cell and the new offset, so the caller knows where to read the next cell from the buffer
  // Same logic from serialize applies: read keyLen, read keyLen bytes as string, read typeTag, read value based on type. A full cell structure is:
  // [2: keyLen][keyLen: key][1: valueType][value]
  static deserializeCell(buf: Buffer, offset: number): { cell: Cell; newOffset: number } {
    const keyLen = buf.readUInt16BE(offset);
    offset += 2;

    const key = buf.toString('utf-8', offset, offset + keyLen);
    offset += keyLen;

    const valueTypeTag = buf.readUInt8(offset);
    offset += 1;

    let value: OrlonValue = { type: 'null', value: null }; // Default value, will be overwritten based on the valueTypeTag
    switch (valueTypeTag) {
      case 0: { // string
        const valueLen = buf.readUInt16BE(offset);
        offset += 2;
        const strValue = buf.toString('utf-8', offset, offset + valueLen);
        offset += valueLen;
        value = { type: 'string', value: strValue };
        break;
      }

      case 1: { // integer
        const intValue = buf.readBigInt64BE(offset);
        offset += 8;
        value = { type: 'integer', value: Number(intValue) };
        break;
      }

      case 2: { // float
        const floatValue = buf.readDoubleBE(offset);
        offset += 8;
        value = { type: 'float', value: floatValue };
        break;
      }

      case 3: { // boolean
        const boolValue = buf.readUInt8(offset) === 1;
        offset += 1;
        value = { type: 'boolean', value: boolValue };
        break;
      }

      case 4: { // null
        value = { type: 'null', value: null };
        break;
      }
    }

    return {
      cell: {
        key,
        value
      },
      newOffset: offset
    }
  }

  static getValueTypeTag(value: OrlonValue): number {
    switch (value.type) {
      case 'string':
        return 0;
      case 'integer':
        return 1;
      case 'float':
        return 2;
      case 'boolean':
        return 3;
      case 'null':
        return 4;
      default:
        throw new Error(`Unsupported value type: ${value}`);
    }
  }

  getPageNumber(): number {
    return this.pageNumber;
  }
}

export default Page;
