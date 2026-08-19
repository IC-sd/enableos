import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from '../components/Modal';

export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'default' | 'danger';
}

type Confirm = (options: ConfirmationOptions) => Promise<boolean>;

const ConfirmationContext = createContext<Confirm | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmationOptions | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    resolver.current?.(confirmed);
    resolver.current = null;
    setRequest(null);
  }, []);

  const confirm = useCallback<Confirm>((options) => new Promise((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    setRequest(options);
  }), []);

  useEffect(() => () => resolver.current?.(false), []);

  return (
    <ConfirmationContext.Provider value={confirm}>
      {children}
      <Modal open={Boolean(request)} onClose={() => settle(false)} title={request?.title || ''} description={request?.message} size="small" role="alertdialog">
        <div className={`confirmation-dialog confirmation-${request?.tone || 'default'}`}>
          <div className="confirmation-note">
            {request?.tone === 'danger' ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}
            <span>{request?.tone === 'danger' ? '请确认目标和影响范围；危险操作不会自动执行。' : '确认后立即执行，并保留相应活动记录。'}</span>
          </div>
          <footer className="modal-actions">
            <button autoFocus className="secondary-button" onClick={() => settle(false)}>{request?.cancelLabel || '取消'}</button>
            <button className={request?.tone === 'danger' ? 'danger-button' : 'primary-button'} onClick={() => settle(true)}>{request?.confirmLabel || '确认'}</button>
          </footer>
        </div>
      </Modal>
    </ConfirmationContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const value = useContext(ConfirmationContext);
  if (!value) throw new Error('useConfirm must be used inside ConfirmationProvider');
  return value;
}
