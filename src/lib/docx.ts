import { unzipSync } from 'fflate';

const maxDocxTextBytes = 40 * 1024 * 1024;

function preflightDocxArchive(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let offset = bytes.byteLength - 22; offset >= Math.max(0, bytes.byteLength - 65_557); offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0) throw new Error('DOCX ZIP 目录损坏或不完整');
  const entries = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (entries === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) throw new Error('暂不支持 ZIP64 格式的 DOCX，请另存为普通 DOCX 后导入');
  if (directoryOffset + directorySize > bytes.byteLength) throw new Error('DOCX ZIP 目录越界');
  const decoder = new TextDecoder();
  let offset = directoryOffset;
  let selectedBytes = 0;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== 0x02014b50) throw new Error('DOCX ZIP 条目损坏');
    const uncompressed = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if (uncompressed === 0xffffffff) throw new Error('DOCX 包含无法安全预检的 ZIP64 条目');
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > bytes.byteLength) throw new Error('DOCX ZIP 文件名越界');
    const name = decoder.decode(bytes.subarray(nameStart, nameEnd));
    if (/^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(name)) {
      if (uncompressed > maxDocxTextBytes) throw new Error('DOCX 中的单个文本条目过大，请拆分文档后导入');
      selectedBytes += uncompressed;
      if (selectedBytes > maxDocxTextBytes) throw new Error('DOCX 解压后的文本内容过大，请拆分文档后导入');
    }
    offset = nameEnd + extraLength + commentLength;
  }
}

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const hex = entity[1]?.toLowerCase() === 'x';
      const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : match;
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[entity.toLowerCase()] ?? match;
  });
}

function xmlText(xml: string): string {
  const paragraphs = xml.match(/<w:p\b[\s\S]*?<\/w:p>/g) ?? [];
  return paragraphs.map((paragraph) => {
    const marked = paragraph.replace(/<w:tab\b[^>]*\/?\s*>/g, '\uE000').replace(/<w:(?:br|cr)\b[^>]*\/?\s*>/g, '\uE001');
    return decodeXml(marked.replace(/<[^>]+>/g, '')).replace(/\uE000/g, '\t').replace(/\uE001/g, '\n');
  }).filter((value) => value.trim()).join('\n');
}

export function parseDocxBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  preflightDocxArchive(bytes);
  const archive = unzipSync(bytes, {
    filter: (file) => /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(file.name),
  });
  const decoder = new TextDecoder();
  const names = Object.keys(archive).sort((a, b) => {
    if (a === 'word/document.xml') return -1;
    if (b === 'word/document.xml') return 1;
    return a.localeCompare(b);
  });
  if (!archive['word/document.xml']) throw new Error('DOCX 文件缺少主文档内容');
  const total = names.reduce((sum, name) => sum + archive[name].byteLength, 0);
  if (total > maxDocxTextBytes) throw new Error('DOCX 解压后的文本内容过大，请拆分文档后导入');
  return names.map((name) => xmlText(decoder.decode(archive[name]))).filter(Boolean).join('\n\n').trim();
}
