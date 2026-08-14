import { ArrowRight, Bot, LoaderCircle, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Task } from '../../shared/models';
import { useAppStore } from '../context/AppStore';
import { desktop } from '../lib/bridge';
import { activity, buildCompanyContext, randomUUID } from '../lib/utils';
import { Modal } from './Modal';

export function QuickCapture({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (taskId: string) => void }) {
  const { database, mutate, notify } = useAppStore();
  const [rawInput, setRawInput] = useState('');
  const [source, setSource] = useState('领导/导师');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  const analyze = async () => {
    if (!database || !rawInput.trim() || busy) return;
    setBusy(true);
    try {
      const response = await desktop.ai.analyzeTask(rawInput, buildCompanyContext(database, rawInput));
      const now = new Date().toISOString();
      const result = response.data;
      const task: Task = {
        id: randomUUID(), projectId: null, title: result.title, rawInput: rawInput.trim(), summary: result.summary,
        status: 'inbox', priority: result.priority, source, dueDate: result.suggestedDueDate,
        clarificationQuestions: result.clarificationQuestions,
        clarificationAnswers: result.clarificationQuestions.map(() => ''),
        steps: result.steps,
        stepCompletion: result.steps.map(() => false),
        deliverables: result.deliverables,
        acceptanceCriteria: [],
        createdAt: now, updatedAt: now, completedAt: '', deletedAt: '',
      };
      mutate((current) => ({
        ...current,
        tasks: [task, ...current.tasks],
        activities: [activity('task', '收到新任务', task.title, task.id), ...current.activities],
      }));
      notify(`已整理到任务收件箱 · ${response.mode === 'api' ? '模型分析' : '本地分析'}`);
      setRawInput('');
      onClose();
      onCreated(task.id);
    } catch (error) {
      notify(error instanceof Error ? error.message : '任务分析失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="快速收任务" description="保留对方原话，再把模糊要求整理成可以执行的任务。" size="large">
      <div className="capture-modal">
        <div className="capture-source-row">
          <label>来源</label>
          {['领导/导师', '业务同事', '会议记录', '个人想法'].map((item) => (
            <button key={item} className={source === item ? 'selected' : ''} onClick={() => setSource(item)}>{item}</button>
          ))}
        </div>
        <div className="capture-editor">
          <textarea ref={inputRef} value={rawInput} onChange={(event) => setRawInput(event.target.value)} placeholder="粘贴对方的原话、会议记录或你还没想清楚的任务……" />
          <div className="capture-hint"><Sparkles size={15} />系统会提取目标、待确认问题、执行步骤和建议交付物</div>
        </div>
        <div className="capture-footer">
          <div className="privacy-hint"><Bot size={17} /><span>{database?.settings.aiMode === 'api' ? '将使用你配置的模型；请遵守公司资料权限。' : '当前使用本地方法，不会上传内容。'}</span></div>
          <button className="primary-button" disabled={!rawInput.trim() || busy} onClick={() => void analyze()}>
            {busy ? <LoaderCircle className="spin" size={17} /> : <ArrowRight size={17} />}{busy ? '正在梳理' : '分析并创建任务'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
