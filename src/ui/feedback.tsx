import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { Modal } from './Modal';
import { ValidationError } from '../domain/validation';

/* ───────────── Toasts ───────────── */

type ToastKind = 'success' | 'error' | 'info';
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface FeedbackApi {
  toast: (message: string, kind?: ToastKind) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** Ejecuta una acción de negocio mostrando errores comprensibles. */
  run: <T>(fn: () => T, success?: string) => T | undefined;
  runAsync: <T>(fn: () => Promise<T>, success?: string) => Promise<T | undefined>;
}

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

const ICONS = { success: CheckCircle2, error: XCircle, info: Info };

export function friendlyError(err: unknown): string {
  if (err instanceof ValidationError) return err.message;
  console.error('[Alignment & Unblock]', err);
  return 'Ocurrió un error inesperado. Intenta de nuevo; si persiste, genera un respaldo y recarga la página.';
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const seq = useRef(0);

  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = ++seq.current;
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3200);
  }, []);

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...opts, resolve })),
    [],
  );

  const run = useCallback(
    <T,>(fn: () => T, success?: string): T | undefined => {
      try {
        const r = fn();
        if (success) toast(success);
        return r;
      } catch (err) {
        toast(friendlyError(err), 'error');
        return undefined;
      }
    },
    [toast],
  );

  const runAsync = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      try {
        const r = await fn();
        if (success) toast(success);
        return r;
      } catch (err) {
        toast(friendlyError(err), 'error');
        return undefined;
      }
    },
    [toast],
  );

  const api = useMemo(() => ({ toast, confirm, run, runAsync }), [toast, confirm, run, runAsync]);
  const close = (v: boolean) => {
    pending?.resolve(v);
    setPending(null);
  };

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <div key={t.id} className={`toast toast-${t.kind}`}>
              <Icon size={18} aria-hidden />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
      {pending && (
        <Modal
          title={pending.title}
          size="sm"
          onClose={() => close(false)}
          footer={
            <>
              <button type="button" className="btn btn-ghost" onClick={() => close(false)}>
                {pending.cancelLabel ?? 'Cancelar'}
              </button>
              <button type="button" data-autofocus className={`btn ${pending.danger ? 'btn-danger' : 'btn-primary'}`} onClick={() => close(true)}>
                {pending.confirmLabel ?? 'Confirmar'}
              </button>
            </>
          }
        >
          <div className="confirm-body">
            {pending.danger && <AlertTriangle className="confirm-icon" size={22} aria-hidden />}
            <div>{pending.message}</div>
          </div>
        </Modal>
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback fuera de FeedbackProvider');
  return ctx;
}
