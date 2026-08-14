import Dexie, { type EntityTable } from 'dexie';
import type { KnowledgeItem } from '../../shared/models';
import { buildEvidencePassages, diversifyEvidence, rankEvidencePassages, type EvidenceMatch, type EvidencePassage } from './retrieval';

interface EmbeddingRecord {
  id: string;
  knowledgeId: string;
  model: string;
  revision: string;
  kind: 'document' | 'passage';
  vector: number[];
}

type SemanticDexie = Dexie & { embeddings: EntityTable<EmbeddingRecord, 'id'> };
const semanticDb = new Dexie('enableos-semantic-index') as SemanticDexie;
semanticDb.version(1).stores({ embeddings: 'id, knowledgeId, model, revision' });

function cacheId(namespace: string, knowledgeId: string, revision: string, kind: EmbeddingRecord['kind'], suffix = ''): string {
  return `${namespace}\u0000${knowledgeId}\u0000${revision}\u0000${kind}\u0000${suffix}`;
}

function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0; let left = 0; let right = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index]; left += a[index] ** 2; right += b[index] ** 2;
  }
  return left && right ? dot / Math.sqrt(left * right) : 0;
}

function balancedPassages(passages: EvidencePassage[], limit: number): EvidencePassage[] {
  const groups = new Map<string, EvidencePassage[]>();
  for (const passage of passages) groups.set(passage.item.id, [...(groups.get(passage.item.id) || []), passage]);
  const selected: EvidencePassage[] = [];
  let round = 0;
  while (selected.length < limit) {
    let added = false;
    for (const group of groups.values()) {
      if (group[round]) { selected.push(group[round]); added = true; }
      if (selected.length >= limit) break;
    }
    if (!added) break;
    round += 1;
  }
  return selected;
}

async function cachedEmbeddings(
  inputs: Array<{ id: string; text: string; item: KnowledgeItem; kind: EmbeddingRecord['kind'] }>,
  namespace: string,
  embed: (values: string[]) => Promise<{ vectors: number[][]; model: string }>,
): Promise<Map<string, number[]>> {
  const ids = inputs.map((entry) => entry.id);
  const cached = await semanticDb.embeddings.bulkGet(ids);
  const vectors = new Map<string, number[]>();
  const missing = inputs.filter((entry, index) => {
    const record = cached[index];
    if (record?.vector?.length) { vectors.set(entry.id, record.vector); return false; }
    return true;
  });
  for (let offset = 0; offset < missing.length; offset += 32) {
    const batch = missing.slice(offset, offset + 32);
    const result = await embed(batch.map((entry) => entry.text));
    if (result.vectors.length !== batch.length) throw new Error('向量结果数量与资料片段不一致');
    const records = batch.map((entry, index): EmbeddingRecord => ({
      id: entry.id, knowledgeId: entry.item.id, model: namespace, revision: entry.item.updatedAt, kind: entry.kind, vector: result.vectors[index],
    }));
    await semanticDb.embeddings.bulkPut(records);
    records.forEach((record) => vectors.set(record.id, record.vector));
  }
  return vectors;
}

export async function clearSemanticIndex(): Promise<void> {
  await semanticDb.embeddings.clear();
}

export async function semanticIndexCount(namespace?: string): Promise<number> {
  return namespace ? semanticDb.embeddings.where('model').equals(namespace).count() : semanticDb.embeddings.count();
}

export async function hybridRetrieveEvidence(
  query: string,
  items: KnowledgeItem[],
  embed: (inputs: string[]) => Promise<{ vectors: number[][]; model: string }>,
  model: string,
  limit = 8,
  namespace = model,
): Promise<EvidenceMatch[]> {
  if (!items.length) return [];
  const lexical = rankEvidencePassages(query, items, 100);
  const lexicalItemIds = [...new Set(lexical.slice(0, 30).map((match) => match.item.id))];

  // Stage 1 embeds compact document cards so semantic-only matches do not require sending every full passage.
  const documentItems = items.slice(0, 600);
  const documentInputs = documentItems.map((item) => ({
    id: cacheId(namespace, item.id, item.updatedAt, 'document'), item, kind: 'document' as const,
    text: `${item.title}\n${item.summary || item.content.slice(0, 260)}\n${item.category} ${item.tags.join(' ')}`,
  }));
  const documentVectors = await cachedEmbeddings(documentInputs, namespace, embed);
  const queryResult = await embed([query]);
  const queryVector = queryResult.vectors[0];
  if (!queryVector) throw new Error('向量服务没有返回问题向量');
  const documentScores = documentInputs.map((entry) => ({
    item: entry.item,
    score: Math.max(0, cosine(queryVector, documentVectors.get(entry.id) || [])),
  })).sort((a, b) => b.score - a.score);
  const candidateIds = new Set([...lexicalItemIds, ...documentScores.slice(0, 16).map((entry) => entry.item.id)]);

  // Stage 2 embeds only passages from likely documents, balanced so one long file cannot crowd out the others.
  const candidatePassages = balancedPassages(buildEvidencePassages(items.filter((item) => candidateIds.has(item.id))), 240);
  const passageInputs = candidatePassages.map((passage) => ({
    id: cacheId(namespace, passage.item.id, passage.item.updatedAt, 'passage', passage.id), passage, item: passage.item, kind: 'passage' as const,
    text: `${passage.item.title}\n${passage.text}`,
  }));
  const passageVectors = await cachedEmbeddings(passageInputs, namespace, embed);
  const lexicalByPassage = new Map(lexical.map((match) => [match.passageId, match]));
  const documentScoreById = new Map(documentScores.map((entry) => [entry.item.id, entry.score]));
  const maxLexical = Math.max(1, ...lexical.map((match) => match.lexicalScore));

  const ranked = passageInputs.map(({ id, passage }): EvidenceMatch => {
    const lexicalMatch = lexicalByPassage.get(passage.id);
    const semanticScore = Math.max(0, cosine(queryVector, passageVectors.get(id) || []));
    const normalizedLexical = (lexicalMatch?.lexicalScore || 0) / maxLexical;
    const documentScore = documentScoreById.get(passage.item.id) || 0;
    const score = semanticScore * .60 + normalizedLexical * .32 + documentScore * .08;
    return lexicalMatch ? { ...lexicalMatch, semanticScore, score } : {
      item: passage.item, score, lexicalScore: 0, semanticScore,
      excerpt: passage.text.slice(0, 300).replace(/\s+/g, ' ').trim() + (passage.text.length > 300 ? '…' : ''),
      passageId: passage.id,
      location: passage.end > passage.start ? `原文第 ${passage.start + 1}–${passage.end} 字` : '摘要',
      matchedTerms: [],
    };
  }).filter((match) => match.semanticScore >= .2 || match.lexicalScore > 0)
    .sort((a, b) => b.score - a.score);

  const revisions = new Map(items.map((item) => [item.id, item.updatedAt]));
  const existing = await semanticDb.embeddings.where('model').equals(namespace).toArray();
  const stale = existing.filter((record) => revisions.get(record.knowledgeId) !== record.revision).map((record) => record.id);
  if (stale.length) await semanticDb.embeddings.bulkDelete(stale);
  return diversifyEvidence(ranked, limit);
}
