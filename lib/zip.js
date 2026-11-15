// A zip without compression: photos and video are compressed already. Enough
// to hand over a carousel as one file instead of ten loose downloads.
const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Everything in one zip has to stay under the 4 GB of the plain format.
export const ZIP_MAX = 3.5 * 1024 ** 3;

// Two files with the same name: the second becomes "naam-2.jpg".
function uniqueNames(entries) {
  const seen = new Map();
  return entries.map((e) => {
    const name = String(e.name || 'bestand').replace(/^\/+/, '').replace(/\\/g, '/');
    const n = (seen.get(name) || 0) + 1;
    seen.set(name, n);
    return n === 1 ? name : name.replace(/(\.[^./]+)?$/, `-${n}$1`);
  });
}

// entries: [{ name, bytes: Uint8Array }]. Returns the parts of the file, ready
// for `new Blob(parts)`, or null when it would be too large.
export function zip(entries, date = new Date()) {
  const total = entries.reduce((t, e) => t + e.bytes.length, 0);
  if (!entries.length || total > ZIP_MAX) return null;
  const enc = new TextEncoder();
  const time = ((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xffff;
  const day = (((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xffff;
  const names = uniqueNames(entries);
  const parts = [];
  const central = [];
  let offset = 0;
  entries.forEach((e, n) => {
    const name = enc.encode(names[n]);
    const crc = crc32(e.bytes);
    const size = e.bytes.length;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // names are UTF-8
    local.setUint16(8, 0, true); // stored, not compressed
    local.setUint16(10, time, true);
    local.setUint16(12, day, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, size, true);
    local.setUint32(22, size, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    parts.push(new Uint8Array(local.buffer), name, e.bytes);
    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0x0800, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, time, true);
    dir.setUint16(14, day, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, size, true);
    dir.setUint32(24, size, true);
    dir.setUint16(28, name.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), name);
    offset += 30 + name.length + size;
  });
  const dirSize = central.reduce((t, p) => t + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, dirSize, true);
  end.setUint32(16, offset, true);
  return [...parts, ...central, new Uint8Array(end.buffer)];
}

// "instagram-ABC-1.jpg" -> "instagram-ABC.zip"
export const zipName = (first) => `${String(first || 'download').replace(/\.[a-z0-9]+$/i, '').replace(/-\d{1,2}$/, '') || 'download'}.zip`;
