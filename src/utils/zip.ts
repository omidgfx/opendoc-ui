/**
 * Minimal ZIP file creator (STORE - no compression) - no external deps
 * Supports UTF-8 file names and content.
 */

function crc32Uint8(data: Uint8Array): number {
  // Create table lazily
  let table: Uint32Array | null = (crc32Uint8 as any)._table || null;
  if (!table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    (crc32Uint8 as any)._table = table;
  }
  let crc = 0 ^ -1;
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table![(crc ^ data[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function toDosDateTime(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  return { dosDate, dosTime };
}

function writeU16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}
function writeU32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

export interface ZipFileEntry {
  name: string;
  content: string | Uint8Array;
}

export function createZipBlob(files: ZipFileEntry[]): Blob {
  const encoder = new TextEncoder();
  const now = new Date();
  const { dosDate, dosTime } = toDosDateTime(now);

  // Prepare all file data as Uint8Array
  const prepared = files.map((f) => {
    const nameBytes = encoder.encode(f.name);
    const contentBytes = typeof f.content === 'string' ? encoder.encode(f.content) : f.content;
    const crc = crc32Uint8(contentBytes);
    return { ...f, nameBytes, contentBytes, crc };
  });

  // Calculate total size
  let totalLocalSize = 0;
  let totalCentralSize = 0;
  for (const p of prepared) {
    totalLocalSize += 30 + p.nameBytes.length + p.contentBytes.length; // local header 30 + name + content (no extra)
    totalCentralSize += 46 + p.nameBytes.length; // central header 46 + name
  }
  const eocdSize = 22;
  const totalSize = totalLocalSize + totalCentralSize + eocdSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const uint8 = new Uint8Array(buffer);

  let offset = 0;
  const centralRecords: { offset: number; data: typeof prepared[0] }[] = [];

  // Write local file headers
  for (const p of prepared) {
    const localHeaderOffset = offset;
    centralRecords.push({ offset: localHeaderOffset, data: p });

    // Local file header signature 0x04034b50
    writeU32(view, offset, 0x04034b50);
    offset += 4;
    // version needed
    writeU16(view, offset, 20);
    offset += 2;
    // general purpose bit flag: UTF-8 = 0x0800
    writeU16(view, offset, 0x0800);
    offset += 2;
    // compression method STORE 0
    writeU16(view, offset, 0);
    offset += 2;
    // last mod time
    writeU16(view, offset, dosTime);
    offset += 2;
    // last mod date
    writeU16(view, offset, dosDate);
    offset += 2;
    // crc32
    writeU32(view, offset, p.crc);
    offset += 4;
    // compressed size
    writeU32(view, offset, p.contentBytes.length);
    offset += 4;
    // uncompressed size
    writeU32(view, offset, p.contentBytes.length);
    offset += 4;
    // file name length
    writeU16(view, offset, p.nameBytes.length);
    offset += 2;
    // extra field length 0
    writeU16(view, offset, 0);
    offset += 2;
    // file name
    uint8.set(p.nameBytes, offset);
    offset += p.nameBytes.length;
    // file data
    uint8.set(p.contentBytes, offset);
    offset += p.contentBytes.length;
  }

  const centralDirStart = offset;

  // Write central directory
  for (const rec of centralRecords) {
    const p = rec.data;
    writeU32(view, offset, 0x02014b50); // central sig
    offset += 4;
    writeU16(view, offset, 20); // version made by
    offset += 2;
    writeU16(view, offset, 20); // version needed
    offset += 2;
    writeU16(view, offset, 0x0800); // flag utf8
    offset += 2;
    writeU16(view, offset, 0); // compression
    offset += 2;
    writeU16(view, offset, dosTime);
    offset += 2;
    writeU16(view, offset, dosDate);
    offset += 2;
    writeU32(view, offset, p.crc);
    offset += 4;
    writeU32(view, offset, p.contentBytes.length);
    offset += 4;
    writeU32(view, offset, p.contentBytes.length);
    offset += 4;
    writeU16(view, offset, p.nameBytes.length);
    offset += 2;
    writeU16(view, offset, 0); // extra len
    offset += 2;
    writeU16(view, offset, 0); // comment len
    offset += 2;
    writeU16(view, offset, 0); // disk number start
    offset += 2;
    writeU16(view, offset, 0); // internal attr
    offset += 2;
    writeU32(view, offset, 0); // external attr
    offset += 4;
    writeU32(view, offset, rec.offset); // relative offset
    offset += 4;
    uint8.set(p.nameBytes, offset);
    offset += p.nameBytes.length;
  }

  const centralDirSize = offset - centralDirStart;

  // EOCD
  writeU32(view, offset, 0x06054b50);
  offset += 4;
  writeU16(view, offset, 0); // number of this disk
  offset += 2;
  writeU16(view, offset, 0); // disk where central dir starts
  offset += 2;
  writeU16(view, offset, centralRecords.length); // num records on this disk
  offset += 2;
  writeU16(view, offset, centralRecords.length); // total records
  offset += 2;
  writeU32(view, offset, centralDirSize);
  offset += 4;
  writeU32(view, offset, centralDirStart);
  offset += 4;
  writeU16(view, offset, 0); // comment length
  offset += 2;

  return new Blob([buffer], { type: 'application/zip' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}