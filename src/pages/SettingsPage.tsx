import { Bot, CheckCircle2, CircleGauge, ClipboardCheck, DatabaseBackup, Download, FileClock, HardDrive, KeyRound, LoaderCircle, RotateCcw, Save, ShieldCheck, Upload, UserRound, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AppDatabase, ThemeMode } from '../../shared/models';
import { useAppStore } from '../context/AppStore';
import { Modal } from '../components/Modal';
import { desktop } from '../lib/bridge';
import { buildAuditExport } from '../lib/audit';
import { clearSemanticIndex, semanticIndexCount } from '../lib/semantic-retrieval';
import { activity, today } from '../lib/utils';
import { inspectWorkspace, repairWorkspace } from '../lib/workspace-health';

export function SettingsPage() {
  const { database, mutate, replaceDatabase, notify, storagePersistent, requestPersistentStorage, isReadOnly, lastSavedAt } = useAppStore();
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [diagnostic, setDiagnostic] = useState('尚未测试');
  const [semanticCount, setSemanticCount] = useState(0);
  const [appInfo, setAppInfo] = useState({ version: '', platform: '', dataPath: '' });
  const [backupMode, setBackupMode] = useState<'export' | 'import' | null>(null);
  const [backupPayload, setBackupPayload] = useState<unknown>(null);
  const [backupPassword, setBackupPassword] = useState('');
  const [backupConfirmation, setBackupConfirmation] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  useEffect(() => { void desktop.app.getInfo().then(setAppInfo); }, []);
  useEffect(() => { void semanticIndexCount().then(setSemanticCount).catch(() => undefined); }, []);
  useEffect(() => {
    void fetch('/api/status').then((response) => response.json()).then((status: { hasApiKey?: boolean }) => {
      mutate((current) => ({ ...current, settings: { ...current.settings, hasApiKey: Boolean(status.hasApiKey) } }));
    }).catch(() => undefined);
  }, [mutate]);
  if (!database) return null;
  const healthIssues = inspectWorkspace(database);
  const lastBackupAt = database.settings.lastBackupAt ? new Date(database.settings.lastBackupAt) : null;
  const backupAgeDays = lastBackupAt ? Math.floor((Date.now() - lastBackupAt.getTime()) / 86_400_000) : null;
  const backupNeedsAttention = backupAgeDays === null || backupAgeDays >= 14;
  const backupSummary = lastBackupAt
    ? `最近备份 ${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(lastBackupAt)}`
    : '尚未记录成功备份';

  const updateProfile = (patch: Partial<AppDatabase['profile']>) => mutate((current) => ({ ...current, profile: { ...current.profile, ...patch } }));
  const updateSettings = (patch: Partial<AppDatabase['settings']>) => mutate((current) => ({
    ...current,
    settings: { ...current.settings, ...patch },
    activities: patch.policyConfirmedAt && patch.policyConfirmedAt !== current.settings.policyConfirmedAt
      ? [activity('system', '确认资料与外部AI边界', `规则：${current.settings.externalAiPolicy}；证据范围：${current.settings.externalEvidenceScope}；核对日期：${patch.policyConfirmedAt}`, null), ...current.activities]
      : current.activities,
  }));

  const saveApiKey = async () => {
    const result = await desktop.credentials.setApiKey(apiKey);
    if (result.ok) { updateSettings({ hasApiKey: true }); setApiKey(''); notify(result.message); }
    else notify(result.message, 'error');
  };

  const clearApiKey = async () => {
    await desktop.credentials.clearApiKey(); updateSettings({ hasApiKey: false, aiMode: 'local' }); notify('本次会话密钥已从网关清除', 'info');
  };

  const test = async () => {
    setTesting(true);
    const result = await desktop.ai.testConnection();
    setDiagnostic(result.message);
    notify(result.message, result.ok ? 'success' : 'error');
    setTesting(false);
  };

  const exportAudit = async () => {
    const name = `enableos-audit-${today()}.json`;
    await desktop.files.exportMarkdown(name, await buildAuditExport(database));
    notify(`审计记录已导出：${name}`);
  };

  const verifyAudit = async () => {
    const result = await desktop.files.verifyAuditFile();
    if (!result.canceled) notify(result.message, result.valid ? 'success' : 'error');
  };

  const resetSemanticIndex = async () => {
    await clearSemanticIndex(); setSemanticCount(0); notify('本地语义索引已清除，下次检索会按需重建', 'info');
  };

  const repairHealthIssues = () => {
    const result = repairWorkspace(database);
    if (!result.repaired) { notify('没有可自动修复的数据问题', 'info'); return; }
    mutate(() => ({ ...result.database, activities: [activity('system', '修复工作区数据', `安全修复 ${result.repaired} 项数据一致性问题`, null), ...result.database.activities] }));
    notify(`已安全修复 ${result.repaired} 项问题`);
  };

  const closeBackupDialog = () => { setBackupMode(null); setBackupPayload(null); setBackupPassword(''); setBackupConfirmation(''); setBackupBusy(false); };

  const exportBackup = () => { setBackupMode('export'); setBackupPassword(''); setBackupConfirmation(''); };

  const importBackup = async () => {
    if (!window.confirm('导入会替换当前工作台数据，建议先导出备份。继续吗？')) return;
    try {
      const selected = await desktop.files.selectBackup();
      if (selected.canceled) return;
      if (selected.encrypted) { setBackupPayload(selected.payload); setBackupMode('import'); return; }
      replaceDatabase(await desktop.files.decodeBackup(selected.payload));
      notify('备份已导入');
    } catch (error) { notify(error instanceof Error ? error.message : '导入失败', 'error'); }
  };

  const submitBackupDialog = async () => {
    if (!backupMode) return;
    if (backupPassword.length < 8) { notify('备份密码至少需要8个字符', 'error'); return; }
    if (backupMode === 'export' && backupPassword !== backupConfirmation) { notify('两次输入的备份密码不一致', 'error'); return; }
    setBackupBusy(true);
    try {
      if (backupMode === 'export') {
        const exportedAt = new Date().toISOString();
        const exportedDatabase = { ...database, settings: { ...database.settings, lastBackupAt: exportedAt } };
        const result = await desktop.files.exportBackup(exportedDatabase, backupPassword);
        if (!result.canceled) {
          updateSettings({ lastBackupAt: exportedAt });
          notify(`加密备份已保存到 ${result.path}`);
        }
      } else {
        replaceDatabase(await desktop.files.decodeBackup(backupPayload, backupPassword));
        notify('加密备份已导入');
      }
      closeBackupDialog();
    } catch (error) {
      setBackupBusy(false);
      notify(error instanceof Error ? error.message : '备份操作失败', 'error');
    }
  };

  const resetDemo = async () => {
    if (!window.confirm('恢复示例会替换当前全部数据。确定继续吗？')) return;
    const restored = await desktop.data.resetDemo(); replaceDatabase(restored); notify('已恢复示例工作空间', 'info');
  };

  return <div className="page settings-page">
    <header className="page-header"><div><p className="eyebrow">Workspace controls</p><h1>设置</h1><p>管理可选工作背景、数据边界、模型能力和浏览器本地数据。</p></div></header>
    <div className="settings-sections">
      <section className="panel settings-section"><div className="settings-section-head"><div className="settings-icon blue"><UserRound size={19} /></div><div><h2>工作背景（可选）</h2><p>留空也可以使用；填写后只用于让任务整理更贴合当前场景。</p></div></div><div className="form-grid"><label className="field"><span>称呼</span><input value={database.profile.name} onChange={(event) => updateProfile({ name: event.target.value })} placeholder="怎么称呼你" /></label><label className="field"><span>组织 / 使用场景</span><input value={database.profile.company} onChange={(event) => updateProfile({ company: event.target.value })} placeholder="例如：个人、学校、工作室或某个组织" /></label><label className="field"><span>角色 / 身份</span><input value={database.profile.role} onChange={(event) => updateProfile({ role: event.target.value })} placeholder="例如：学生、设计师、开发者" /></label><label className="field"><span>团队 / 领域</span><input value={database.profile.department} onChange={(event) => updateProfile({ department: event.target.value })} placeholder="不知道可以留空" /></label><label className="field"><span>开始日期（可选）</span><input type="date" value={database.profile.onboardingDate} onChange={(event) => updateProfile({ onboardingDate: event.target.value })} /></label></div></section>

      <section className="panel settings-section"><div className="settings-section-head"><div className="settings-icon amber"><ClipboardCheck size={19} /></div><div><h2>数据与 AI 使用边界</h2><p>你决定什么可以离开浏览器；未明确允许前，系统不会把资料发送给外部模型。</p></div><div className={`readiness-badge ${database.settings.policyConfirmedAt ? 'ready' : ''}`}>{database.settings.policyConfirmedAt ? '已设置' : '待设置'}</div></div><div className="form-grid"><label className="field"><span>外部 AI 使用规则</span><select value={database.settings.externalAiPolicy} onChange={(event) => updateSettings({ externalAiPolicy: event.target.value as AppDatabase['settings']['externalAiPolicy'] })}><option value="unknown">尚未决定</option><option value="forbidden">仅使用本地能力</option><option value="approved-with-rules">按自定义规则允许</option></select></label><label className="field"><span>允许进入外部模型的资料</span><select value={database.settings.externalEvidenceScope} onChange={(event) => updateSettings({ externalEvidenceScope: event.target.value as AppDatabase['settings']['externalEvidenceScope'] })}><option value="public-only">仅公开资料（默认）</option><option value="public-and-internal">公开和非公开资料</option></select></label><label className="field"><span>设置日期</span><input type="date" value={database.settings.policyConfirmedAt} onChange={(event) => updateSettings({ policyConfirmedAt: event.target.value })} /></label><label className="field"><span>允许使用的平台 / 工具</span><input value={database.settings.approvedTools} onChange={(event) => updateSettings({ approvedTools: event.target.value })} placeholder="例如：本机模型或已获准的在线服务" /></label><label className="field span-2"><span>资料处理规则</span><textarea rows={3} value={database.settings.dataHandlingNotes} onChange={(event) => updateSettings({ dataHandlingNotes: event.target.value })} placeholder="哪些资料可使用、是否需要脱敏、结果保存在哪里、谁可以查看" /></label><label className="field"><span>当前阶段的结果期待</span><textarea rows={3} value={database.settings.mentorExpectation} onChange={(event) => updateSettings({ mentorExpectation: event.target.value })} placeholder="记录真实目标，不替别人或未来的自己猜测" /></label><label className="field"><span>复盘 / 同步节奏</span><textarea rows={3} value={database.settings.reportCadence} onChange={(event) => updateSettings({ reportCadence: event.target.value })} placeholder="例如：每周五复盘一次" /></label></div></section>

      <section className="panel settings-section"><div className="settings-section-head"><div className="settings-icon purple"><KeyRound size={19} /></div><div><h2>AI 模型网关</h2><p>支持 Responses API 与 Chat Completions；密钥只保存在本机网关内存。</p></div><div className={`mode-status ${database.settings.aiMode}`}><span />{database.settings.aiMode === 'api' ? '模型增强' : '本地模式'}</div></div><div className="mode-selector"><button className={database.settings.aiMode === 'local' ? 'selected' : ''} onClick={() => updateSettings({ aiMode: 'local' })}><HardDrive size={18} /><div><strong>本地方法</strong><span>离线可用，不上传资料</span></div></button><button className={database.settings.aiMode === 'api' ? 'selected' : ''} onClick={() => updateSettings({ aiMode: 'api' })}><Bot size={18} /><div><strong>模型增强</strong><span>经本机网关连接兼容服务</span></div></button></div>{database.settings.aiMode === 'api' ? <div className="api-settings"><div className="form-grid"><label className="field span-2"><span>API 地址</span><input value={database.settings.apiEndpoint} onChange={(event) => updateSettings({ apiEndpoint: event.target.value })} placeholder="https://.../v1" /></label><label className="field"><span>接口协议</span><select value={database.settings.apiProtocol} onChange={(event) => updateSettings({ apiProtocol: event.target.value as AppDatabase['settings']['apiProtocol'] })}><option value="responses">Responses API（推荐）</option><option value="chat-completions">Chat Completions（兼容）</option></select></label><label className="field"><span>生成模型</span><input value={database.settings.apiModel} onChange={(event) => updateSettings({ apiModel: event.target.value })} placeholder="填写服务支持的模型名" /></label><label className="field"><span>检索方式</span><select value={database.settings.retrievalMode} onChange={(event) => updateSettings({ retrievalMode: event.target.value as AppDatabase['settings']['retrievalMode'] })}><option value="lexical">本地关键词检索</option><option value="hybrid">关键词 + 语义混合</option></select></label><label className="field"><span>向量模型</span><input value={database.settings.embeddingModel} onChange={(event) => updateSettings({ embeddingModel: event.target.value })} placeholder="例如 text-embedding-3-small" disabled={database.settings.retrievalMode !== 'hybrid'} /></label><label className="field span-2"><span>本次会话密钥</span><div className="inline-input"><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={database.settings.hasApiKey ? '网关已持有密钥，输入可替换' : '关闭本机网关后自动清除'} /><button aria-label="保存会话密钥" disabled={!apiKey.trim()} onClick={() => void saveApiKey()}><Save size={16} /></button></div></label></div><div className="gateway-diagnostic"><span>最近诊断</span><strong>{diagnostic}</strong><small>本地语义缓存 {semanticCount} 个片段</small></div><div className="api-actions"><div className="secure-note"><ShieldCheck size={16} />发送前检查证据范围及误粘贴的密钥、密码和个人号码；敏感资料始终排除。</div><div>{semanticCount ? <button className="danger-text-button" onClick={() => void resetSemanticIndex()}>清除语义缓存</button> : null}{database.settings.hasApiKey ? <button className="danger-text-button" onClick={() => void clearApiKey()}>清除会话密钥</button> : null}<button className="secondary-button" disabled={testing} onClick={() => void test()}>{testing ? <LoaderCircle className="spin" size={16} /> : <CheckCircle2 size={16} />}运行诊断</button></div></div></div> : null}</section>

      <section className="panel settings-section"><div className="settings-section-head"><div className="settings-icon green"><DatabaseBackup size={19} /></div><div><h2>数据、备份与审计</h2><p>任务、资料、实验和汇报默认只保存在当前浏览器；审计导出带逐事件 SHA-256 校验链。</p></div><div className={`readiness-badge ${storagePersistent ? 'ready' : ''}`}>{storagePersistent ? '长期保留' : storagePersistent === false ? '可被清理' : '检测中'}</div></div><div className="data-path"><HardDrive size={17} /><div><span>本地数据位置</span><code>{appInfo.dataPath || '正在读取…'}</code><small>{lastSavedAt ? `最近保存 ${new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(lastSavedAt))}` : '等待首次修改'} · {isReadOnly ? '当前标签页只读' : '当前标签页可编辑'} · {backupSummary}</small></div></div>{storagePersistent === false ? <div className="secure-note warning"><ShieldCheck size={16} /><span>浏览器仍可能在空间紧张时清理本站数据。<button className="text-button" onClick={() => void requestPersistentStorage()}>申请长期保留</button></span></div> : null}{backupNeedsAttention ? <div className="secure-note warning"><DatabaseBackup size={16} /><span>{backupAgeDays === null ? 'Git 只迁移代码，不迁移浏览器数据。首次正式使用前请导出一份加密备份。' : `距离上次备份已 ${backupAgeDays} 天，建议在重要节点或换电脑前重新导出。`}</span></div> : null}<div className="secure-note"><ShieldCheck size={16} />备份使用 PBKDF2 + AES-GCM 在浏览器内加密；密码通过遮罩输入框处理，不再使用浏览器原始提示框。</div><div className="data-actions"><button className="secondary-button" onClick={exportBackup}><Download size={16} />导出加密备份</button><button className="secondary-button" onClick={() => void importBackup()}><Upload size={16} />导入备份</button><button className="secondary-button" onClick={() => void exportAudit()}><FileClock size={16} />导出审计记录</button><button className="secondary-button" onClick={() => void verifyAudit()}><ShieldCheck size={16} />验证审计文件</button><button className="danger-text-button" onClick={() => void resetDemo()}><RotateCcw size={16} />恢复示例数据</button></div></section>

      <section className="panel settings-section"><div className="settings-section-head"><div className="settings-icon blue"><CircleGauge size={19} /></div><div><h2>工作区健康检查</h2><p>检查失效关联、重复标识、异常评分、日期范围和配置缺口；只自动修复不会丢数据的问题。</p></div><div className={`readiness-badge ${healthIssues.length === 0 ? 'ready' : ''}`}>{healthIssues.length ? `${healthIssues.length} 项` : '健康'}</div></div>{healthIssues.length ? <div className="health-list">{healthIssues.map((issue) => <article className={issue.severity} key={issue.code}><div><strong>{issue.title}</strong><span>{issue.count} 项 · {issue.repairable ? '可安全修复' : '需人工确认'}</span></div><p>{issue.detail}</p></article>)}</div> : <div className="health-empty"><ShieldCheck size={18} /><span>未发现数据一致性或关键配置问题。</span></div>}{healthIssues.some((issue) => issue.repairable) ? <div className="data-actions"><button className="secondary-button" onClick={repairHealthIssues}><Wrench size={16} />修复安全项</button></div> : null}</section>

      <section className="panel settings-section compact-settings"><div className="settings-section-head"><div className="settings-icon coral"><Save size={19} /></div><div><h2>外观与体验</h2><p>设置会自动保存。</p></div></div><div className="preference-row"><span>主题</span><div className="segmented-control">{([['light', '浅色'], ['dark', '深色'], ['system', '跟随系统']] as const).map(([key, label]) => <button className={database.settings.theme === key ? 'active' : ''} key={key} onClick={() => updateSettings({ theme: key as ThemeMode })}>{label}</button>)}</div></div><div className="preference-row"><span>紧凑显示</span><button className={`toggle ${database.settings.compactMode ? 'on' : ''}`} onClick={() => updateSettings({ compactMode: !database.settings.compactMode })}><i /></button></div><div className="version-note">EnableOS {appInfo.version || '3.4.0'} · {appInfo.platform || 'Web'}</div></section>
    </div>
    <Modal open={Boolean(backupMode)} onClose={closeBackupDialog} title={backupMode === 'export' ? '导出加密备份' : '解锁加密备份'} description={backupMode === 'export' ? '密码只在当前操作中使用；忘记密码将无法恢复。' : '请输入创建此备份时使用的密码。'}>
      <div className="backup-password-dialog">
        <label className="field"><span>备份密码</span><input autoFocus type="password" autoComplete="new-password" value={backupPassword} onChange={(event) => setBackupPassword(event.target.value)} placeholder="至少8个字符" /></label>
        {backupMode === 'export' ? <label className="field"><span>再次输入</span><input type="password" autoComplete="new-password" value={backupConfirmation} onChange={(event) => setBackupConfirmation(event.target.value)} placeholder="确认密码" /></label> : null}
        <div className="password-strength" data-valid={backupPassword.length >= 8}><i style={{ width: `${Math.min(100, backupPassword.length * 8)}%` }} /><span>{backupPassword.length < 8 ? `还需 ${8 - backupPassword.length} 个字符` : '长度符合要求'}</span></div>
        <footer className="modal-actions"><button className="secondary-button" onClick={closeBackupDialog}>取消</button><button className="primary-button" disabled={backupBusy || backupPassword.length < 8} onClick={() => void submitBackupDialog()}>{backupBusy ? <LoaderCircle className="spin" size={16} /> : backupMode === 'export' ? <Download size={16} /> : <Upload size={16} />}{backupMode === 'export' ? '生成备份' : '解锁并导入'}</button></footer>
      </div>
    </Modal>
  </div>;
}
