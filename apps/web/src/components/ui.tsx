import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router';

type Variant = 'gold' | 'teal' | 'ghost' | 'danger';
const v = (variant: Variant) => `btn btn-${variant}`;

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }>(
  ({ variant = 'gold', loading, className = '', children, disabled, ...p }, ref) => (
    <button ref={ref} type="button" {...p} disabled={disabled || loading} aria-busy={loading || undefined} className={`${v(variant)} ${className}`}>
      {loading && <Spinner />}{children}
    </button>
  ),
);
Button.displayName = 'Button';

export function LinkButton({ variant = 'gold', className = '', ...p }: LinkProps & { variant?: Variant }) {
  return <Link {...p} className={`${v(variant)} ${className}`} />;
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span role={label ? 'status' : undefined} className="inline-flex items-center gap-2">
      <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
      {label && <span>{label}</span>}
    </span>
  );
}

export function PageLoading({ label = 'Loading…' }: { label?: string }) {
  return <div className="flex min-h-[40vh] items-center justify-center text-ivory/80"><Spinner label={label} /></div>;
}

export function Alert({ tone = 'info', title, children, action }: { tone?: 'info' | 'error' | 'success' | 'warn'; title?: string; children?: ReactNode; action?: ReactNode }) {
  const tones = { info: 'border-teal-bright/50 bg-teal/25', error: 'border-danger/60 bg-danger/15', success: 'border-success/60 bg-success/15', warn: 'border-amber/60 bg-amber/10' };
  const icon = { info: 'ℹ', error: '⚠', success: '✓', warn: '!' };
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-3 rounded-xl border p-3.5 text-sm ${tones[tone]}`}>
      <span aria-hidden className="mt-0.5 font-bold">{icon[tone]}</span>
      <div className="min-w-0 flex-1">{title && <p className="font-semibold">{title}</p>}<div className="text-ivory/90">{children}</div></div>
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof Error ? error.message : 'Something went wrong';
  return <div className="mx-auto max-w-xl py-10"><Alert tone="error" title="We couldn’t load that" action={onRetry && <Button variant="ghost" onClick={onRetry}>Try again</Button>}>{msg}</Alert></div>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="card text-center"><h2 className="font-display text-xl">{title}</h2>{children && <p className="mx-auto mt-1 max-w-md text-ivory/75">{children}</p>}{action && <div className="mt-4 flex justify-center">{action}</div>}</div>;
}

interface FieldShell { label: string; hint?: ReactNode; error?: string | null }
function Shell({ id, label, hint, error, children }: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ivory/90">{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="text-xs text-ivory/70">{hint}</p>}
      {error && <p id={`${id}-err`} role="alert" className="text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
const aria = (id: string, p: FieldShell) => ({ 'aria-invalid': p.error ? true : undefined, 'aria-describedby': [p.hint ? `${id}-hint` : '', p.error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined });

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldShell>(({ label, hint, error, className = '', ...p }, ref) => {
  const id = useId();
  return <Shell id={id} label={label} hint={hint} error={error}><input ref={ref} id={id} className={`field ${className}`} {...aria(id, { label, hint, error })} {...p} /></Shell>;
});
Input.displayName = 'Input';

export function Select({ label, hint, error, className = '', children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & FieldShell) {
  const id = useId();
  return <Shell id={id} label={label} hint={hint} error={error}><select id={id} className={`field ${className}`} {...aria(id, { label, hint, error })} {...p}>{children}</select></Shell>;
}

export function Textarea({ label, hint, error, className = '', ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldShell) {
  const id = useId();
  return <Shell id={id} label={label} hint={hint} error={error}><textarea id={id} className={`field min-h-24 ${className}`} {...aria(id, { label, hint, error })} {...p} /></Shell>;
}

/** Accessible confirmation built on the native <dialog> (focus trap + Esc for free). */
export function ConfirmDialog({ open, title, children, confirmLabel = 'Confirm', danger, onConfirm, onCancel }: { open: boolean; title: string; children: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onCancel} onCancel={onCancel} className="m-auto w-[min(92vw,28rem)] rounded-2xl border border-line bg-ink-soft p-0 text-ivory backdrop:bg-black/70" aria-labelledby="dlg-title">
      <div className="grid gap-3 p-5">
        <h2 id="dlg-title" className="text-xl">{title}</h2>
        <div className="text-ivory/85">{children}</div>
        <div className="mt-2 flex flex-wrap justify-end gap-2"><Button variant="ghost" onClick={onCancel}>Cancel</Button><Button variant={danger ? 'danger' : 'gold'} onClick={onConfirm}>{confirmLabel}</Button></div>
      </div>
    </dialog>
  );
}

/** Polite screen-reader announcements for meaningful changes (not timer ticks). */
export function LiveRegion({ message }: { message: string }) {
  return <div className="sr-only-live" role="status" aria-live="polite" aria-atomic="true">{message}</div>;
}

export function SectionTitle({ eyebrow, children, sub }: { eyebrow?: string; children: ReactNode; sub?: ReactNode }) {
  return <div className="mb-6 text-center">{eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}<h2 className="text-balance text-2xl sm:text-3xl">{children}</h2>{sub && <p className="mx-auto mt-2 max-w-2xl text-ivory/75">{sub}</p>}</div>;
}

export function Divider() {
  return <div className="mx-auto my-2 flex max-w-xs items-center gap-3 text-amber/70" aria-hidden><span className="h-px flex-1 bg-current/40" /><span>◆</span><span className="h-px flex-1 bg-current/40" /></div>;
}
