import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  description?: string;
  size?: 'small' | 'medium' | 'large';
  role?: 'dialog' | 'alertdialog';
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, title, description, size = 'medium', role = 'dialog', onClose, children }: ModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = window.requestAnimationFrame(() => {
      if (dialogRef.current?.contains(document.activeElement)) return;
      const first = dialogRef.current?.querySelector<HTMLElement>('[autofocus], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])');
      (first ?? dialogRef.current)?.focus();
    });
    const listener = (event: KeyboardEvent) => {
      const dialogs = [...document.querySelectorAll<HTMLElement>('[data-modal-root]')];
      if (dialogs.at(-1) !== dialogRef.current) return;
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) { event.preventDefault(); dialogRef.current.focus(); return; }
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', listener);
    return () => { window.cancelAnimationFrame(frame); window.removeEventListener('keydown', listener); previous?.focus(); };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} className={`modal modal-${size}`} role={role} aria-modal="true" aria-label={title} data-modal-root>
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
