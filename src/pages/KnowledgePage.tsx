import { BookOpenText, FileCheck2, FilePlus2, FileText, LoaderCircle, MessageSquareText, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Confidentiality, EvidenceKind, ImportedDocument, KnowledgeItem, KnowledgeType } from '../../shared/models';
import { EmptyState } from '../components/EmptyState';
import { Modal } from '../components/Modal';
import { useAppStore } from '../context/AppStore';
import { desktop } from '../lib/bridge';
import { evidenceContext, localEvidenceAnswer, retrieveEvidence, validateEvidenceAnswer, type EvidenceMatch } from '../lib/retrieval';
import { hybridRetrieveEvidence } from '../lib/semantic-retrieval';
import { contentFingerprint } from '../lib/document-import';
import { activity, buildCompanyContext, formatFullDate, randomUUID, truncate } from '../lib/utils';
import { isActive, prependRevision, restoreEntityRevision } from '../lib/entity-history';
import { HistoryPanel } from '../components/HistoryPanel';

const typeNames: Record<KnowledgeType, string> = { document: '文档', term: '术语', process: '流程', meeting: '会议', note: '笔记' };
const evidenceNames: Record<EvidenceKind, string> = { fact: '事实', reference: '参考资料', decision: '决定', question: '待确认', meeting: '会议证据' };

export function KnowledgePage({ initialSelectedId }: { initialSelectedId?: string }) {
  const { database, mutate, notify } = useAppStore();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<KnowledgeType | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId || null);
  const [createOpen, setCreateOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [answerSources, setAnswerSources] = useState<EvidenceMatch[]>([]);
  const [citationStatus, setCitationStatus] = useState<{ valid: boolean; message: string } | null>(null);
  const [draft, setDraft] = useState({ title: '', projectId: '', taskId: '', type: 'note' as KnowledgeType, evidenceKind: 'reference' as EvidenceKind, verificationStatus: 'unverified' as 'confirmed' | 'unverified', category: '', content: '', confidentiality: 'internal' as Confidentiality, version: '', tags: '' });
  const [editDraft, setEditDraft] = useState<typeof draft | null>(null);
  const [pendingImports, setPendingImports] = useState<ImportedDocument[]>([]);
  const [importBatch, setImportBatch] = useState({ projectId: '', taskId: '', category: '待整理', confidentiality: 'internal' as Confidentiality, tags: '' });
  useEffect(() => {
    if (!database || !initialSelectedId) return;
    const item = database.knowledge.find((entry) => entry.id === initialSelectedId && isActive(entry));
    if (!item) return;
    setSelectedId(item.id);
    setEditDraft({ title: item.title, projectId: item.projectId || '', taskId: item.taskId || '', type: item.type, evidenceKind: item.evidenceKind, verificationStatus: item.verificationStatus, category: item.category, content: item.content, confidentiality: item.confidentiality, version: item.version, tags: item.tags.join(', ') });
  }, [database, initialSelectedId]);
  if (!database) return null;
  const selected = database.knowledge.find((item) => item.id === selectedId && isActive(item)) ?? null;
  const items = useMemo(() => database.knowledge.filter((item) => {
    if (!isActive(item)) return false;
    const haystack = `${item.title} ${item.summary} ${item.content} ${item.tags.join(' ')}`.toLowerCase();
    return (type === 'all' || item.type === type) && (!query.trim() || haystack.includes(query.trim().toLowerCase()));
  }), [database.knowledge, query, type]);

  const importDocuments = async () => {
    setImporting(true);
    try {
      const documents = await desktop.files.importDocuments();
      if (!documents.length) return;
      const existingFingerprints = new Set(await Promise.all(database.knowledge.map((item) => item.fingerprint || contentFingerprint(item.content))));
      const accepted = documents.filter((document) => {
        if (existingFingerprints.has(document.fingerprint)) return false;
        existingFingerprints.add(document.fingerprint);
        return true;
      });
      const skipped = documents.length - accepted.length;
      if (!accepted.length) { notify(`未导入：所选 ${documents.length} 份资料均与证据库内容重复`, 'info'); return; }
      setPendingImports(accepted);
      notify(`已读取 ${accepted.length} 份资料${skipped ? `，跳过 ${skipped} 份重复内容` : ''}；请确认归类`, 'info');
    } catch (error) { notify(error instanceof Error ? error.message : '导入失败', 'error'); }
    finally { setImporting(false); }
  };

  const commitImports = () => {
    if (!pendingImports.length) return;
    const now = new Date().toISOString();
    const tags = importBatch.tags.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
    const created: KnowledgeItem[] = pendingImports.map((document) => ({
      id: randomUUID(), projectId: importBatch.projectId || null, taskId: importBatch.taskId || null, title: document.title, type: document.type, evidenceKind: 'reference', verificationStatus: 'unverified', category: importBatch.category.trim() || '待整理', content: document.content,
      summary: truncate(document.content, 160), sourceName: document.sourceName, sourcePath: document.sourcePath, tags, confidentiality: importBatch.confidentiality, version: '', createdAt: now, updatedAt: now, fingerprint: document.fingerprint,
      sourceFingerprint: document.sourceFingerprint, sourceSize: document.sourceSize, sourceModifiedAt: document.sourceModifiedAt, sourceMime: document.sourceMime, deletedAt: '',
    }));
    mutate((current) => ({ ...current, knowledge: [...created, ...current.knowledge], activities: [activity('knowledge', '导入并归类工作资料', `${created.length}份文档`, created[0]?.id || null), ...current.activities] }));
    setPendingImports([]); setImportBatch({ projectId: '', taskId: '', category: '待整理', confidentiality: 'internal', tags: '' }); notify(`已导入并归类 ${created.length} 份资料`);
  };

  const createItem = async () => {
    if (!draft.title.trim() || !draft.content.trim()) return;
    const now = new Date().toISOString();
    const content = draft.content.trim();
    const item: KnowledgeItem = { id: randomUUID(), ...draft, projectId: draft.projectId || null, taskId: draft.taskId || null, title: draft.title.trim(), content, summary: truncate(content, 150), sourceName: '手动记录', sourcePath: '', tags: draft.tags.split(/[,，]/).map((item) => item.trim()).filter(Boolean), createdAt: now, updatedAt: now, fingerprint: await contentFingerprint(content), sourceFingerprint: '', sourceSize: 0, sourceModifiedAt: '', sourceMime: '', deletedAt: '' };
    mutate((current) => ({ ...current, knowledge: [item, ...current.knowledge], activities: [activity('knowledge', '新增知识', item.title, item.id), ...current.activities] }));
    setDraft({ title: '', projectId: '', taskId: '', type: 'note', evidenceKind: 'reference', verificationStatus: 'unverified', category: '', content: '', confidentiality: 'internal', version: '', tags: '' }); setCreateOpen(false); notify('证据已保存');
  };

  const askKnowledge = async () => {
    if (!question.trim()) return;
    setAsking(true); setAnswer(''); setAnswerSources([]); setCitationStatus(null);
    try {
      const externalAllowed = database.settings.externalAiPolicy === 'approved-with-rules';
      const sourceItems = database.settings.aiMode === 'api' && externalAllowed
        ? database.knowledge.filter((item) => isActive(item) && (item.confidentiality === 'public' || (database.settings.externalEvidenceScope === 'public-and-internal' && item.confidentiality === 'internal')))
        : database.knowledge.filter(isActive);
      let matches: EvidenceMatch[];
      if (database.settings.aiMode === 'api' && externalAllowed && database.settings.retrievalMode === 'hybrid' && database.settings.embeddingModel.trim()) {
        try {
          const model = database.settings.embeddingModel.trim();
          matches = await hybridRetrieveEvidence(question, sourceItems, desktop.ai.embed, model, 8, `${database.settings.apiEndpoint.trim()}|${model}`);
        } catch (error) {
          matches = retrieveEvidence(question, sourceItems, 8);
          notify(`语义检索不可用，已安全回退关键词检索：${error instanceof Error ? error.message : '未知错误'}`, 'info');
        }
      } else matches = retrieveEvidence(question, sourceItems, 8);
      setAnswerSources(matches);
      if (database.settings.aiMode === 'api' && !externalAllowed) {
        const localAnswer = localEvidenceAnswer(question, matches);
        setAnswer(localAnswer); setCitationStatus(validateEvidenceAnswer(localAnswer, matches));
        notify('公司外部 AI 使用边界尚未确认，本次未上传资料。请先在设置中完成入职核对。', 'info');
      } else {
        const response = await desktop.ai.ask({ instruction: question, context: `${buildCompanyContext(database, question)}\n\n检索证据：\n${evidenceContext(matches)}` });
        const nextAnswer = response.mode === 'local' ? localEvidenceAnswer(question, matches) : response.data;
        setAnswer(nextAnswer); setCitationStatus(validateEvidenceAnswer(nextAnswer, matches)); notify(response.notice, 'info');
      }
    } catch (error) { notify(error instanceof Error ? error.message : '提问失败', 'error'); }
    finally { setAsking(false); }
  };

  const removeItem = (item: KnowledgeItem) => {
    if (!window.confirm(`将资料“${item.title}”移入回收站吗？`)) return;
    const deletedAt = new Date().toISOString();
    mutate((current) => ({ ...current, knowledge: current.knowledge.map((entry) => entry.id === item.id ? { ...entry, deletedAt, updatedAt: deletedAt } : entry), revisions: prependRevision(current, 'knowledge', item, 'delete'), activities: [activity('knowledge', '资料移入回收站', item.title, item.id), ...current.activities] }));
    setSelectedId(null); notify('资料已移入回收站', 'info');
  };

  const openItem = (item: KnowledgeItem) => {
    setSelectedId(item.id);
    setEditDraft({
      title: item.title,
      projectId: item.projectId || '',
      taskId: item.taskId || '',
      type: item.type,
      evidenceKind: item.evidenceKind,
      verificationStatus: item.verificationStatus,
      category: item.category,
      content: item.content,
      confidentiality: item.confidentiality,
      version: item.version,
      tags: item.tags.join(', '),
    });
  };

  const saveSelected = async () => {
    if (!selected || !editDraft?.title.trim() || !editDraft.content.trim()) return;
    const content = editDraft.content.trim();
    const updated: KnowledgeItem = {
      ...selected,
      ...editDraft,
      title: editDraft.title.trim(),
      content,
      summary: truncate(content, 150),
      projectId: editDraft.projectId || null,
      taskId: editDraft.taskId || null,
      updatedAt: new Date().toISOString(),
      fingerprint: await contentFingerprint(content),
      tags: editDraft.tags.split(/[,，]/).map((item) => item.trim()).filter(Boolean),
    };
    mutate((current) => ({ ...current, knowledge: current.knowledge.map((item) => item.id === updated.id ? updated : item), revisions: prependRevision(current, 'knowledge', selected, 'update'), activities: [activity('knowledge', '更新证据', updated.title, updated.id), ...current.activities] }));
    notify('证据信息已更新');
    setSelectedId(null);
    setEditDraft(null);
  };

  return <div className="page knowledge-page">
    <header className="page-header"><div><p className="eyebrow">Evidence library</p><h1>证据库</h1><p>把资料、事实、术语、流程和会议结论组织成可追溯的工作依据。</p></div><div className="header-actions"><button className="secondary-button" disabled={importing} onClick={() => void importDocuments()}>{importing ? <LoaderCircle className="spin" size={16} /> : <FilePlus2 size={16} />}导入资料</button><button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={16} />新增证据</button></div></header>
    <div className="knowledge-layout">
      <section className="knowledge-main">
        <div className="toolbar knowledge-toolbar"><div className="search-box"><Search size={17} /><input aria-label="搜索证据库" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索产品、术语、流程或内容" /></div><select aria-label="按证据类型筛选" value={type} onChange={(event) => setType(event.target.value as KnowledgeType | 'all')}><option value="all">全部类型</option>{Object.entries(typeNames).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></div>
        {items.length ? <div className="knowledge-list">{items.map((item) => <button className="knowledge-row" key={item.id} onClick={() => openItem(item)}><div className="document-icon"><FileText size={18} /></div><div><div className="knowledge-title"><h3>{item.title}</h3>{item.version ? <span>v{item.version}</span> : null}</div><p>{item.summary || truncate(item.content, 130)}</p><small>{typeNames[item.type]} · {item.category || '未分类'} · {item.confidentiality === 'public' ? '公开' : item.confidentiality === 'internal' ? '内部' : '敏感'}</small></div></button>)}</div> : <EmptyState icon={BookOpenText} title="没有找到相关知识" description={query ? '换一个关键词，或清除筛选条件。' : '导入PDF、Word、Excel或手动记录公司术语。'} />}
      </section>
        <aside className="panel knowledge-ask-panel"><div className="panel-header"><div><p className="eyebrow">基于证据</p><h2>问工作上下文</h2></div><MessageSquareText size={19} /></div><p>系统会检索到原文片段并生成 [E1] 引用；语义服务不可用时自动回退关键词检索。</p><textarea rows={5} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="例如：设备报警后应该先确认什么？" /><button className="primary-button full" disabled={!question.trim() || asking} onClick={() => void askKnowledge()}>{asking ? <LoaderCircle className="spin" size={16} /> : <MessageSquareText size={16} />}{asking ? '正在检索' : '检索并回答'}</button>{answer ? <div className="knowledge-answer"><label>回答</label><p>{answer}</p>{citationStatus ? <div className={`citation-status ${citationStatus.valid ? 'valid' : 'invalid'}`}><ShieldCheck size={14} /><span>{citationStatus.message}</span></div> : null}{answerSources.length ? <div className="answer-sources"><label>命中来源</label>{answerSources.slice(0, 5).map(({ item, location, semanticScore }, index) => <button key={item.id} onClick={() => openItem(item)}><span>E{index + 1}</span><b>{item.title}</b><small>{location}{semanticScore ? ` · 语义 ${Math.round(semanticScore * 100)}%` : ''}</small></button>)}</div> : null}</div> : <div className="privacy-card"><ShieldCheck size={18} /><span>{database.settings.aiMode === 'local' ? '本地检索不会上传资料。' : database.settings.externalAiPolicy === 'approved-with-rules' ? database.settings.externalEvidenceScope === 'public-and-internal' ? '可使用公开和内部资料；敏感资料始终排除。' : '只使用公开资料；内部和敏感资料不会发送。' : '边界未确认：即使开启模型，也不会上传资料。'}</span></div>}</aside>
    </div>
    <Modal open={Boolean(selected)} onClose={() => { setSelectedId(null); setEditDraft(null); }} title={selected?.title || ''} description={selected ? `${selected.sourceName || '手动记录'} · 更新于 ${formatFullDate(selected.updatedAt)}` : ''} size="large">
      {selected && editDraft ? <div className="knowledge-detail">
        <div className="form-grid">
          <label className="field span-2"><span>标题</span><input value={editDraft.title} onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })} /></label>
          <label className="field"><span>关联项目</span><select value={editDraft.projectId} onChange={(event) => setEditDraft({ ...editDraft, projectId: event.target.value, taskId: '' })}><option value="">暂不关联</option>{database.projects.filter(isActive).map((project) => <option value={project.id} key={project.id}>{project.title}</option>)}</select></label>
          <label className="field"><span>关联工作线</span><select value={editDraft.taskId} onChange={(event) => { const task = database.tasks.find((item) => item.id === event.target.value); setEditDraft({ ...editDraft, taskId: event.target.value, projectId: task?.projectId || editDraft.projectId }); }}><option value="">项目级证据</option>{database.tasks.filter((task) => isActive(task) && (!editDraft.projectId || task.projectId === editDraft.projectId)).map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></label>
          <label className="field"><span>证据角色</span><select value={editDraft.evidenceKind} onChange={(event) => setEditDraft({ ...editDraft, evidenceKind: event.target.value as EvidenceKind })}>{Object.entries(evidenceNames).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
          <label className="field"><span>核实状态</span><select value={editDraft.verificationStatus} onChange={(event) => setEditDraft({ ...editDraft, verificationStatus: event.target.value as 'confirmed' | 'unverified' })}><option value="unverified">待核实</option><option value="confirmed">已确认</option></select></label>
          <label className="field"><span>类型</span><select value={editDraft.type} onChange={(event) => setEditDraft({ ...editDraft, type: event.target.value as KnowledgeType })}>{Object.entries(typeNames).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
          <label className="field"><span>分类</span><input value={editDraft.category} onChange={(event) => setEditDraft({ ...editDraft, category: event.target.value })} /></label>
          <label className="field"><span>权限</span><select value={editDraft.confidentiality} onChange={(event) => setEditDraft({ ...editDraft, confidentiality: event.target.value as Confidentiality })}><option value="public">公开</option><option value="internal">内部</option><option value="sensitive">敏感</option></select></label>
          <label className="field"><span>版本</span><input value={editDraft.version} onChange={(event) => setEditDraft({ ...editDraft, version: event.target.value })} /></label>
          <label className="field span-2"><span>标签（逗号分隔）</span><input value={editDraft.tags} onChange={(event) => setEditDraft({ ...editDraft, tags: event.target.value })} placeholder="例如：售后, 报警, SOP" /></label>
          <label className="field span-2"><span>内容</span><textarea rows={12} value={editDraft.content} onChange={(event) => setEditDraft({ ...editDraft, content: event.target.value })} /></label>
        </div>
        {selected.sourceFingerprint ? <div className="source-provenance"><FileCheck2 size={18} /><div><strong>原始文件可核验</strong><span>{selected.sourceName} · {selected.sourceSize ? `${(selected.sourceSize / 1024).toFixed(1)} KB` : '大小未知'}{selected.sourceModifiedAt ? ` · 文件日期 ${formatFullDate(selected.sourceModifiedAt)}` : ''}</span><code>SHA-256 {selected.sourceFingerprint.slice(0, 16)}…</code></div><button className="secondary-button" onClick={async () => { const result = await desktop.files.verifySourceFile(selected.sourceFingerprint); if (!result.canceled) notify(result.valid ? `原始文件一致：${result.fileName}` : `文件不一致：${result.fileName}`, result.valid ? 'success' : 'error'); }}><ShieldCheck size={14} />重新选择并核验</button></div> : null}
        <HistoryPanel database={database} entityType="knowledge" entityId={selected.id} onRestore={(revisionId) => { mutate((current) => restoreEntityRevision(current, revisionId)); setSelectedId(null); setEditDraft(null); notify('已恢复所选资料版本'); }} />
        <div className="modal-actions split"><button className="danger-text-button" onClick={() => removeItem(selected)}><Trash2 size={16} />移入回收站</button><div><button className="secondary-button" onClick={() => { setSelectedId(null); setEditDraft(null); }}>取消</button><button className="primary-button" disabled={!editDraft.title.trim() || !editDraft.content.trim()} onClick={() => void saveSelected()}>保存修改</button></div></div>
      </div> : null}
    </Modal>
    <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="新增公司知识" description="记录术语、流程、会议结论或重要背景。">
      <div className="form-grid"><label className="field span-2"><span>标题</span><input autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="例如：EAP设备自动化处理系统" /></label><label className="field"><span>关联项目</span><select value={draft.projectId} onChange={(event) => setDraft({ ...draft, projectId: event.target.value, taskId: '' })}><option value="">暂不关联</option>{database.projects.filter(isActive).map((project) => <option value={project.id} key={project.id}>{project.title}</option>)}</select></label><label className="field"><span>关联工作线</span><select value={draft.taskId} onChange={(event) => { const task = database.tasks.find((item) => item.id === event.target.value); setDraft({ ...draft, taskId: event.target.value, projectId: task?.projectId || draft.projectId }); }}><option value="">项目级证据</option>{database.tasks.filter((task) => isActive(task) && (!draft.projectId || task.projectId === draft.projectId)).map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></label><label className="field"><span>证据角色</span><select value={draft.evidenceKind} onChange={(event) => setDraft({ ...draft, evidenceKind: event.target.value as EvidenceKind })}>{Object.entries(evidenceNames).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label className="field"><span>核实状态</span><select value={draft.verificationStatus} onChange={(event) => setDraft({ ...draft, verificationStatus: event.target.value as 'confirmed' | 'unverified' })}><option value="unverified">待核实</option><option value="confirmed">已确认</option></select></label><label className="field"><span>类型</span><select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as KnowledgeType })}>{Object.entries(typeNames).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label><label className="field"><span>分类</span><input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="产品 / 部门 / 方法" /></label><label className="field"><span>权限</span><select value={draft.confidentiality} onChange={(event) => setDraft({ ...draft, confidentiality: event.target.value as Confidentiality })}><option value="public">公开</option><option value="internal">内部</option><option value="sensitive">敏感</option></select></label><label className="field"><span>版本</span><input value={draft.version} onChange={(event) => setDraft({ ...draft, version: event.target.value })} placeholder="可选" /></label><label className="field span-2"><span>标签（逗号分隔）</span><input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="例如：售后, 报警, SOP" /></label><label className="field span-2"><span>内容</span><textarea rows={9} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder="记录事实、来源、适用范围和待确认事项……" /></label></div><div className="modal-actions"><button className="secondary-button" onClick={() => setCreateOpen(false)}>取消</button><button className="primary-button" disabled={!draft.title.trim() || !draft.content.trim()} onClick={() => void createItem()}>保存证据</button></div>
    </Modal>
    <Modal open={pendingImports.length > 0} onClose={() => setPendingImports([])} title={`归类 ${pendingImports.length} 份导入资料`} description="确认一次，整批资料会使用相同归属；导入后仍可逐份修改。" size="large"><div className="import-review"><div className="import-file-list">{pendingImports.map((document) => <article key={document.sourceFingerprint}><FileText size={16} /><div><strong>{document.sourceName}</strong><span>{(document.sourceSize / 1024).toFixed(1)} KB · {document.type === 'document' ? '文档' : '笔记'}</span></div></article>)}</div><div className="form-grid"><label className="field"><span>关联项目</span><select value={importBatch.projectId} onChange={(event) => setImportBatch({ ...importBatch, projectId: event.target.value, taskId: '' })}><option value="">暂不关联</option>{database.projects.filter(isActive).map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label><label className="field"><span>关联工作线</span><select value={importBatch.taskId} onChange={(event) => { const task = database.tasks.find((item) => item.id === event.target.value); setImportBatch({ ...importBatch, taskId: event.target.value, projectId: task?.projectId || importBatch.projectId }); }}><option value="">项目级资料</option>{database.tasks.filter((task) => isActive(task) && (!importBatch.projectId || task.projectId === importBatch.projectId)).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label><label className="field"><span>分类</span><input value={importBatch.category} onChange={(event) => setImportBatch({ ...importBatch, category: event.target.value })} /></label><label className="field"><span>权限</span><select value={importBatch.confidentiality} onChange={(event) => setImportBatch({ ...importBatch, confidentiality: event.target.value as Confidentiality })}><option value="public">公开</option><option value="internal">内部</option><option value="sensitive">敏感</option></select></label><label className="field span-2"><span>标签（逗号分隔）</span><input value={importBatch.tags} onChange={(event) => setImportBatch({ ...importBatch, tags: event.target.value })} /></label></div><footer className="modal-actions"><button className="secondary-button" onClick={() => setPendingImports([])}>取消</button><button className="primary-button" onClick={commitImports}><FilePlus2 size={15} />确认导入</button></footer></div></Modal>
  </div>;
}
