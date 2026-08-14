import type { KnowledgeItem } from '../../shared/models';

export interface EvidencePassage {
  id: string;
  item: KnowledgeItem;
  text: string;
  start: number;
  end: number;
}

export interface EvidenceMatch {
  item: KnowledgeItem;
  score: number;
  lexicalScore: number;
  semanticScore: number;
  excerpt: string;
  passageId: string;
  location: string;
  matchedTerms: string[];
}

const stopWords = new Set(['什么', '怎么', '如何', '是否', '可以', '需要', '应该', '进行', '一个', '这个', '那个', '以及', '或者', '因为', '所以', '然后', '我们', '他们', 'the', 'and', 'for', 'with', 'from', 'how', 'what']);

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFKC').replace(/[\p{P}\p{S}\s]+/gu, ' ').trim();
}

export function tokenizeEvidence(text: string): string[] {
  const value = normalize(text);
  const latin = value.match(/[a-z0-9][a-z0-9._/-]*/g) ?? [];
  const chinese = value.match(/[\u3400-\u9fff]+/g)?.flatMap((part) => {
    if (part.length <= 2) return [part];
    const grams: string[] = [];
    for (let index = 0; index < part.length - 1; index += 1) grams.push(part.slice(index, index + 2));
    return grams;
  }) ?? [];
  return [...new Set([...latin, ...chinese].filter((token) => token.length > 1 && !stopWords.has(token)))];
}

function windows(text: string, startOffset: number, target = 720, overlap = 100): EvidencePassage[] {
  const passages: EvidencePassage[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    let end = Math.min(text.length, cursor + target);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('。', end), text.lastIndexOf('；', end), text.lastIndexOf('\n', end));
      if (boundary > cursor + target * .55) end = boundary + 1;
    }
    const value = text.slice(cursor, end).trim();
    if (value) passages.push({ id: '', item: null as unknown as KnowledgeItem, text: value, start: startOffset + cursor, end: startOffset + end });
    if (end >= text.length) break;
    cursor = Math.max(cursor + 1, end - overlap);
  }
  return passages;
}

export function buildEvidencePassages(items: KnowledgeItem[]): EvidencePassage[] {
  const passages: EvidencePassage[] = [];
  for (const item of items) {
    const content = item.content.replace(/\r\n?/g, '\n');
    const parts = content.split(/\n{2,}/).filter((part) => part.trim());
    let searchOffset = 0;
    let buffer = '';
    let bufferStart = 0;
    const flush = () => {
      if (!buffer.trim()) return;
      for (const passage of windows(buffer, bufferStart)) {
        const index = passages.length;
        passages.push({ ...passage, id: `${item.id}:${passage.start}:${index}`, item });
      }
      buffer = '';
    };
    for (const part of parts.length ? parts : [content]) {
      const offset = content.indexOf(part, searchOffset);
      searchOffset = Math.max(searchOffset, offset + part.length);
      if (!buffer) bufferStart = Math.max(0, offset);
      if (buffer && buffer.length + part.length > 850) flush();
      if (!buffer) bufferStart = Math.max(0, offset);
      buffer += `${buffer ? '\n' : ''}${part}`;
      if (buffer.length >= 650) flush();
    }
    flush();
    if (!passages.some((passage) => passage.item.id === item.id)) passages.push({ id: `${item.id}:0:0`, item, text: item.summary || item.title, start: 0, end: 0 });
  }
  return passages;
}

function termFrequency(tokens: string[]): Map<string, number> {
  const frequencies = new Map<string, number>();
  for (const token of tokens) frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
  return frequencies;
}

function preciseExcerpt(passage: EvidencePassage, queryTerms: string[], maxLength = 300): { excerpt: string; start: number; end: number } {
  const lower = passage.text.toLowerCase();
  const positions = queryTerms.map((token) => lower.indexOf(token)).filter((position) => position >= 0);
  const hit = positions.length ? Math.min(...positions) : 0;
  let start = Math.max(0, hit - 90);
  let end = Math.min(passage.text.length, start + maxLength);
  const leftSentence = Math.max(passage.text.lastIndexOf('。', hit - 1), passage.text.lastIndexOf('\n', hit - 1));
  if (leftSentence >= 0 && hit - leftSentence < 120) start = leftSentence + 1;
  const rightSentence = passage.text.indexOf('。', Math.max(hit, start + 80));
  if (rightSentence >= 0 && rightSentence - start <= maxLength + 60) end = rightSentence + 1;
  const excerpt = passage.text.slice(start, end).replace(/\s+/g, ' ').trim();
  return { excerpt: `${start > 0 ? '…' : ''}${excerpt}${end < passage.text.length ? '…' : ''}`, start: passage.start + start, end: passage.start + end };
}

export function rankEvidencePassages(query: string, items: KnowledgeItem[], limit = 40): EvidenceMatch[] {
  const queryText = normalize(query);
  const queryTerms = tokenizeEvidence(query);
  if (!queryText || !queryTerms.length) return [];
  const passages = buildEvidencePassages(items);
  const passageTokens = passages.map((passage) => tokenizeEvidence(passage.text));
  const averageLength = passageTokens.reduce((sum, value) => sum + value.length, 0) / Math.max(1, passageTokens.length);
  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) documentFrequency.set(term, passageTokens.filter((values) => values.includes(term)).length);

  const matches = passages.map((passage, index) => {
    const values = passageTokens[index];
    const frequencies = termFrequency(values);
    let score = 0;
    const matchedTerms: string[] = [];
    for (const term of queryTerms) {
      const frequency = frequencies.get(term) ?? 0;
      if (!frequency) continue;
      matchedTerms.push(term);
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log(1 + (passages.length - df + .5) / (df + .5));
      const denominator = frequency + 1.2 * (1 - .75 + .75 * values.length / Math.max(1, averageLength));
      score += idf * frequency * 2.2 / denominator;
    }
    const title = normalize(passage.item.title);
    const summary = normalize(passage.item.summary);
    const metadata = normalize(`${passage.item.category} ${passage.item.tags.join(' ')} ${passage.item.sourceName}`);
    if (title.includes(queryText)) score += 12;
    if (summary.includes(queryText)) score += 7;
    if (normalize(passage.text).includes(queryText)) score += 6;
    for (const term of queryTerms) {
      if (title.includes(term)) score += 2.6;
      if (summary.includes(term)) score += 1.4;
      if (metadata.includes(term)) score += 1.1;
    }
    if (passage.item.verificationStatus === 'confirmed') score += .15;
    const precise = preciseExcerpt(passage, queryTerms);
    return {
      item: passage.item,
      score,
      lexicalScore: score,
      semanticScore: 0,
      excerpt: precise.excerpt,
      passageId: passage.id,
      location: precise.end > precise.start ? `原文第 ${precise.start + 1}–${precise.end} 字` : '摘要',
      matchedTerms,
    };
  }).filter((match) => match.score > .2 && match.matchedTerms.length > 0)
    .sort((a, b) => b.score - a.score || b.item.updatedAt.localeCompare(a.item.updatedAt));
  return matches.slice(0, limit);
}

export function diversifyEvidence(matches: EvidenceMatch[], limit = 8): EvidenceMatch[] {
  const selected: EvidenceMatch[] = [];
  const seenItems = new Set<string>();
  for (const match of matches) {
    if (seenItems.has(match.item.id)) continue;
    selected.push(match);
    seenItems.add(match.item.id);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function retrieveEvidence(query: string, items: KnowledgeItem[], limit = 8): EvidenceMatch[] {
  return diversifyEvidence(rankEvidencePassages(query, items), limit);
}

export function evidenceContext(matches: EvidenceMatch[]): string {
  return matches.map(({ item, excerpt, location, matchedTerms }, index) => [
    `[E${index + 1}] ${item.title}`,
    `来源：${item.sourceName || '手动记录'}；位置：${location}；证据角色：${item.evidenceKind}；核实：${item.verificationStatus === 'confirmed' ? '已确认' : '待核实'}；权限：${item.confidentiality}`,
    `命中：${matchedTerms.join('、') || '语义相关'}`,
    excerpt,
  ].join('\n')).join('\n\n');
}

export function localEvidenceAnswer(question: string, matches: EvidenceMatch[]): string {
  if (!matches.length) return `没有找到与“${question}”直接相关的本地证据。建议换用更具体的产品名、术语、流程节点或文件名；这不是“没有答案”，而是当前证据不足。`;
  return [
    '以下是本地检索到的相关证据片段，尚未由模型综合推断：', '',
    ...matches.slice(0, 5).map(({ item, excerpt, location }, index) => `[E${index + 1}] 【${item.title}｜${location}】${excerpt}`), '',
    '请根据 [E1] 等引用打开下方来源核对原文后再形成结论。',
  ].join('\n');
}

export interface CitationValidation {
  valid: boolean;
  cited: number[];
  invalid: number[];
  message: string;
}

export function validateEvidenceAnswer(answer: string, matches: EvidenceMatch[]): CitationValidation {
  const cited = [...new Set([...answer.matchAll(/\[E(\d+)\]/gi)].map((match) => Number(match[1])).filter(Number.isFinite))].sort((a, b) => a - b);
  const invalid = cited.filter((index) => index < 1 || index > matches.length);
  if (!matches.length) return { valid: cited.length === 0, cited, invalid, message: cited.length ? '回答引用了不存在的证据。' : '' };
  if (invalid.length) return { valid: false, cited, invalid, message: `回答包含无效引用：${invalid.map((index) => `[E${index}]`).join('、')}。请以命中来源为准。` };
  if (!cited.length) return { valid: false, cited, invalid, message: '模型回答没有提供证据编号，暂不能视为可追溯结论。' };
  return { valid: true, cited, invalid, message: `已校验 ${cited.length} 个引用，均指向本次命中来源。` };
}
