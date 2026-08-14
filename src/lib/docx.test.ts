import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { parseDocxBuffer } from './docx';

describe('DOCX text parser', () => {
  it('extracts paragraphs, tabs, line breaks and entities', () => {
    const bytes = zipSync({
      'word/document.xml': strToU8('<?xml version="1.0"?><w:document xmlns:w="x"><w:body><w:p><w:r><w:t>第一段 &amp; 证据</w:t></w:r></w:p><w:p><w:r><w:t>字段</w:t><w:tab/><w:t>值</w:t><w:br/><w:t>下一行</w:t></w:r></w:p></w:body></w:document>'),
      'word/header1.xml': strToU8('<w:hdr xmlns:w="x"><w:p><w:r><w:t>页眉</w:t></w:r></w:p></w:hdr>'),
    });
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    expect(parseDocxBuffer(buffer)).toBe('第一段 & 证据\n字段\t值\n下一行\n\n页眉');
  });

  it('rejects archives without the main document', () => {
    const bytes = zipSync({ 'word/header1.xml': strToU8('<w:hdr/>') });
    expect(() => parseDocxBuffer(bytes.buffer as ArrayBuffer)).toThrow('缺少主文档');
  });

  it('rejects an archive that claims an unsafe uncompressed document size before inflating', () => {
    const bytes = zipSync({ 'word/document.xml': strToU8('<w:document/>') });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let offset = 0; offset < bytes.byteLength - 28; offset += 1) {
      if (view.getUint32(offset, true) === 0x02014b50) { view.setUint32(offset + 24, 50 * 1024 * 1024, true); break; }
    }
    expect(() => parseDocxBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)).toThrow('过大');
  });
});
