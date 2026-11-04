'use strict';
/**
 * 把 PNG 图标打包成 Windows .ico（多尺寸）。
 * 不依赖 PIL/ImageMagick，纯 Node 实现。
 *
 * ICO 格式：
 *   ICONDIR(6) + ICONDIRENTRY(16) × N + 各尺寸的图像数据
 *   图像数据用 PNG 格式存储（Vista+ 支持，体积更小）
 */

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

/** 解析 PNG：取 IHDR 宽高 + IDAT 数据 */
function parsePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是 PNG 文件');
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('不支持隔行扫描 PNG');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error('仅支持 8 位深度 PNG，实际 ' + bitDepth);
  if (colorType !== 6) throw new Error('仅支持 RGBA (colorType 6)，实际 ' + colorType);
  return { width, height, idat: Buffer.concat(idat) };
}

/** 用 PNG 原始数据 + zlib 重压，生成目标尺寸的 PNG */
function resizePng(png, targetSize) {
  const { width, height, idat } = png;
  if (width !== height) throw new Error('图标必须为正方形');
  if (width === targetSize) {
    return { data: idat, size: targetSize };
  }

  // 解压原始像素
  const raw = zlib.inflateSync(idat);
  const bpp = 4; // RGBA
  const stride = width * bpp;
  const pixels = Buffer.alloc(height * stride);

  // 反滤波（PNG 每行有 filter 类型）
  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const rowStart = y * stride;
    for (let x = 0; x < stride; x++) {
      const rawByte = raw[pos++];
      const a = x >= bpp ? pixels[rowStart + x - bpp] : 0;
      const b = y > 0 ? pixels[rowStart - stride + x] : 0;
      const c = (x >= bpp && y > 0) ? pixels[rowStart - stride + x - bpp] : 0;
      let val;
      switch (filter) {
        case 0: val = rawByte; break;
        case 1: val = rawByte + a; break;
        case 2: val = rawByte + b; break;
        case 3: val = rawByte + ((a + b) >> 1); break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pred = (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          val = rawByte + pred;
          break;
        }
        default: throw new Error('未知 PNG filter: ' + filter);
      }
      pixels[rowStart + x] = val & 0xff;
    }
  }

  // 缩放（双线性插值，alpha 预乘避免边缘发黑）
  const out = Buffer.alloc(targetSize * targetSize * bpp);
  const scale = width / targetSize;
  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      const srcX = (x + 0.5) * scale - 0.5;
      const srcY = (y + 0.5) * scale - 0.5;
      const x0 = Math.max(0, Math.floor(srcX));
      const y0 = Math.max(0, Math.floor(srcY));
      const x1 = Math.min(width - 1, x0 + 1);
      const y1 = Math.min(height - 1, y0 + 1);
      const fx = srcX - x0, fy = srcY - y0;
      const o = (y * targetSize + x) * bpp;
      for (let c = 0; c < bpp; c++) {
        const p00 = pixels[(y0 * width + x0) * bpp + c];
        const p10 = pixels[(y0 * width + x1) * bpp + c];
        const p01 = pixels[(y1 * width + x0) * bpp + c];
        const p11 = pixels[(y1 * width + x1) * bpp + c];
        const top = p00 + (p10 - p00) * fx;
        const bot = p01 + (p11 - p01) * fx;
        out[o + c] = Math.round(top + (bot - top) * fy);
      }
    }
  }

  // 重新编码为 PNG（每行 filter 0）
  const rawOut = Buffer.alloc(targetSize * (targetSize * bpp + 1));
  for (let y = 0; y < targetSize; y++) {
    rawOut[y * (targetSize * bpp + 1)] = 0;
    out.copy(rawOut, y * (targetSize * bpp + 1) + 1, y * targetSize * bpp, (y + 1) * targetSize * bpp);
  }

  const idatOut = zlib.deflateSync(rawOut, { level: 9 });

  // 组装 PNG 块
  const chunks = [];
  const mkChunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(targetSize, 0);
  ihdr.writeUInt32BE(targetSize, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  chunks.push(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  chunks.push(mkChunk('IHDR', ihdr));
  chunks.push(mkChunk('IDAT', idatOut));
  chunks.push(mkChunk('IEND', Buffer.alloc(0)));

  return { data: Buffer.concat(chunks), size: targetSize };
}

/** CRC32 */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * 生成 .ico
 * @param {string} pngPath 源 PNG
 * @param {string} outPath  输出 ico
 * @param {number[]} sizes 目标尺寸列表
 */
function buildIco(pngPath, outPath, sizes) {
  const png = parsePng(fs.readFileSync(pngPath));
  const images = sizes.map((s) => resizePng(png, s));

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type = icon
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  const datas = [];
  let offset = 6 + images.length * 16;

  for (const img of images) {
    const e = Buffer.alloc(16);
    e[0] = img.size >= 256 ? 0 : img.size;      // width
    e[1] = img.size >= 256 ? 0 : img.size;      // height
    e[2] = 0;                                    // 调色板数
    e[3] = 0;                                    // reserved
    e.writeUInt16LE(1, 4);                       // color planes
    e.writeUInt16LE(32, 6);                      // bpp
    e.writeUInt32LE(img.data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    datas.push(img.data);
    offset += img.data.length;
  }

  fs.writeFileSync(outPath, Buffer.concat([header, ...entries, ...datas]));
  return { path: outPath, sizes, bytes: fs.statSync(outPath).size };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const png = args[0] || path.join(__dirname, 'build', 'icon.png');
  const out = args[1] || path.join(__dirname, 'build', 'icon.ico');
  const sizes = (args[2] || '16,24,32,48,64,128,256').split(',').map(Number);
  const r = buildIco(png, out, sizes);
  console.log('ICO_SAVED ' + r.path + ' sizes=' + r.sizes.join(',') + ' bytes=' + r.bytes);
}

module.exports = { buildIco, parsePng, resizePng };
