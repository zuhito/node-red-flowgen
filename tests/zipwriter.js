'use strict';

const zlib = require('zlib');

function crc32(buf) {
    let table = crc32.table;
    if (!table) {
        table = crc32.table = [];
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
            table[i] = c >>> 0;
        }
    }
    let crc = 0xFFFFFFFF;
    for (const byte of buf) crc = table[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function build(entries, options) {
    const deflate = !!(options && options.deflate);
    const chunks = [];
    const central = [];
    let offset = 0;

    for (const entry of entries) {
        const name = Buffer.from(entry.path, 'utf8');
        const raw = Buffer.isBuffer(entry.text) ? entry.text : Buffer.from(entry.text, 'utf8');
        const data = deflate ? zlib.deflateRawSync(raw) : raw;
        const method = deflate ? 8 : 0;
        const sum = crc32(raw);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0, 6);
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(0, 10);
        local.writeUInt16LE(0, 12);
        local.writeUInt32LE(sum, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(raw.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        chunks.push(local, name, data);

        const header = Buffer.alloc(46);
        header.writeUInt32LE(0x02014b50, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(20, 6);
        header.writeUInt16LE(0, 8);
        header.writeUInt16LE(method, 10);
        header.writeUInt16LE(0, 12);
        header.writeUInt16LE(0, 14);
        header.writeUInt32LE(sum, 16);
        header.writeUInt32LE(data.length, 20);
        header.writeUInt32LE(raw.length, 24);
        header.writeUInt16LE(name.length, 28);
        header.writeUInt32LE(0, 42);
        header.writeUInt32LE(offset, 42);
        central.push(Buffer.concat([header, name]));
        offset += local.length + name.length + data.length;
    }

    const dir = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(dir.length, 12);
    end.writeUInt32LE(offset, 16);

    return Buffer.concat([Buffer.concat(chunks), dir, end]);
}

module.exports = { build };

// A deflated archive, which the stored-only builder above cannot produce.
// Needed to exercise the expansion limits: a zip bomb is small on the wire
// precisely because it compresses well.
function buildDeflated(entries) {
    const zlib = require('zlib');
    const table = [];
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) { c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; }
        table[n] = c;
    }
    const crc32 = buf => {
        let r = -1;
        for (const byte of buf) { r = (r >>> 8) ^ table[(r ^ byte) & 0xFF]; }
        return (r ^ -1) >>> 0;
    };

    const locals = [];
    const central = [];
    let offset = 0;
    for (const entry of entries) {
        const name = Buffer.from(entry.path);
        const raw = Buffer.from(entry.text);
        const compressed = zlib.deflateRawSync(raw, { level: 9 });
        const crc = crc32(raw);
        const declared = entry.declaredSize === undefined ? raw.length : entry.declaredSize;

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(8, 8);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(compressed.length, 18);
        local.writeUInt32LE(declared, 22);
        local.writeUInt16LE(name.length, 26);
        locals.push(local, name, compressed);

        const dir = Buffer.alloc(46);
        dir.writeUInt32LE(0x02014b50, 0);
        dir.writeUInt16LE(20, 4);
        dir.writeUInt16LE(20, 6);
        dir.writeUInt16LE(8, 10);
        dir.writeUInt32LE(crc, 16);
        dir.writeUInt32LE(compressed.length, 20);
        dir.writeUInt32LE(declared, 24);
        dir.writeUInt16LE(name.length, 28);
        dir.writeUInt32LE(offset, 42);
        central.push(dir, name);

        offset += local.length + name.length + compressed.length;
    }

    const directory = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);

    return Buffer.concat([...locals, directory, end]);
}

module.exports.buildDeflated = buildDeflated;
