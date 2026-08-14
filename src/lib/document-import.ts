import type { ImportedDocument } from '../../shared/models';
import { parseDocxBuffer } from './docx';

function chooseFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.addEventListener('cancel', () => resolve([]), { once: true });
    input.click();
  });
}

async function parsePdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl.default;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  const pages: string[] = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const text = await page.getTextContent();
    pages.push(`[第 ${index} 页]\n${text.items.map((item) => ('str' in item ? item.str : '')).join(' ')}`);
  }
  return pages.join('\n\n');
}

async function parseFile(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'pdf') return parsePdf(await file.arrayBuffer());
  if (extension === 'docx') {
    return parseDocxBuffer(await file.arrayBuffer());
  }
  if (extension === 'xlsx') {
    const { default: readExcelFile } = await import('read-excel-file/browser');
    const sheets = await readExcelFile(file);
    const cellText = (cell: unknown) => cell instanceof Date ? cell.toISOString() : cell === null || cell === undefined ? '' : String(cell);
    const csvCell = (cell: unknown) => {
      const value = cellText(cell);
      return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
    };
    return sheets.map(({ sheet, data }) => `# ${sheet}\n${data.map((row) => row.map(csvCell).join(',')).join('\n')}`).join('\n\n');
  }
  return file.text();
}

export async function importDocuments(): Promise<ImportedDocument[]> {
  const files = await chooseFiles('.pdf,.docx,.xlsx,.csv,.txt,.md,.json,.log', true);
  const maxFileBytes = 25 * 1024 * 1024;
  if (files.some((file) => file.size > maxFileBytes)) throw new Error('单个文件不能超过25MB，请先拆分后导入');
  if (files.reduce((sum, file) => sum + file.size, 0) > 80 * 1024 * 1024) throw new Error('本次所选文件总计不能超过80MB');
  const documents: ImportedDocument[] = [];
  for (const file of files) {
    const content = (await parseFile(file)).trim();
    if (!content) continue;
    const extension = file.name.split('.').pop()?.toLowerCase();
    const storedContent = content.slice(0, 1_500_000);
    documents.push({
      title: file.name.replace(/\.[^.]+$/, ''),
      content: storedContent,
      sourceName: file.name,
      sourcePath: '浏览器本地导入',
      type: extension === 'md' || extension === 'txt' ? 'note' : 'document',
      fingerprint: await contentFingerprint(storedContent),
      sourceFingerprint: await fileFingerprint(file),
      sourceSize: file.size,
      sourceModifiedAt: file.lastModified ? new Date(file.lastModified).toISOString() : '',
      sourceMime: file.type || 'application/octet-stream',
    });
  }
  return documents;
}

export async function fileFingerprint(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifySourceFile(expectedFingerprint: string): Promise<{ canceled: boolean; valid: boolean; fileName: string; fingerprint: string }> {
  const file = (await chooseFiles('*/*'))[0];
  if (!file) return { canceled: true, valid: false, fileName: '', fingerprint: '' };
  if (file.size > 100 * 1024 * 1024) throw new Error('核验文件不能超过100MB');
  const fingerprint = await fileFingerprint(file);
  return { canceled: false, valid: Boolean(expectedFingerprint) && fingerprint === expectedFingerprint, fileName: file.name, fingerprint };
}

export async function contentFingerprint(content: string): Promise<string> {
  const normalized = content.normalize('NFKC').replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function chooseBackup(): Promise<File | null> {
  const file = (await chooseFiles('.enableos,.json'))[0] ?? null;
  if (file && file.size > 100 * 1024 * 1024) throw new Error('备份文件不能超过100MB');
  return file;
}

export async function chooseAuditFile(): Promise<File | null> {
  const file = (await chooseFiles('.json'))[0] ?? null;
  if (file && file.size > 50 * 1024 * 1024) throw new Error('审计文件不能超过50MB');
  return file;
}

export function downloadText(name: string, content: string, type = 'text/plain;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
