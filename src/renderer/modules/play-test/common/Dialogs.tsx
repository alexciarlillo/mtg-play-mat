import {
  type FormEvent,
  type ReactNode,
  useLayoutEffect,
  useState,
} from 'react';

interface ModalProps {
  title: string;
  onClose(): void;
  children: ReactNode;
  wide?: boolean;
}

export const Modal = ({ title, onClose, children, wide }: ModalProps) => {
  // Listen before the first paint, so an Escape pressed the moment the
  // dialog appears still closes it.
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label={title}
        className={`max-h-[calc(100vh-2rem)] overflow-auto rounded-lg bg-stone-100 p-4 text-slate-900 shadow-2xl ${
          wide ? 'w-[min(1100px,calc(100vw-2rem))]' : 'w-80'
        }`}
      >
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            className="rounded px-2 text-xl leading-none hover:bg-stone-300"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

const buttonClass =
  'rounded px-3 py-1 text-sm font-medium disabled:opacity-40 ring-1 ring-slate-400';

interface NumberPromptProps {
  title: string;
  label: string;
  initial: number;
  min?: number;
  max?: number;
  onSubmit(value: number): void;
  onClose(): void;
}

export const NumberPrompt = ({
  title,
  label,
  initial,
  min,
  max,
  onSubmit,
  onClose,
}: NumberPromptProps) => {
  const [text, setText] = useState(String(initial));
  const value = Number(text);
  const valid =
    text.trim() !== '' &&
    Number.isInteger(value) &&
    (min === undefined || value >= min) &&
    (max === undefined || value <= max);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSubmit(value);
    onClose();
  };

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          {label}
          <input
            type="number"
            autoFocus
            className="rounded px-2 py-1 text-lg ring-1 ring-slate-400"
            value={text}
            min={min}
            max={max}
            onChange={(e) => setText(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className={`${buttonClass} bg-slate-800 text-white`}
            disabled={!valid}
          >
            OK
          </button>
        </div>
      </form>
    </Modal>
  );
};

interface ConfirmProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm(): void;
  onClose(): void;
}

export const ConfirmDialog = ({
  title,
  message,
  confirmLabel,
  onConfirm,
  onClose,
}: ConfirmProps) => (
  <Modal title={title} onClose={onClose}>
    <p className="mb-4 text-sm">{message}</p>
    <div className="flex justify-end gap-2">
      <button type="button" className={buttonClass} onClick={onClose}>
        Cancel
      </button>
      <button
        type="button"
        autoFocus
        className={`${buttonClass} bg-red-700 text-white`}
        onClick={() => {
          onConfirm();
          onClose();
        }}
      >
        {confirmLabel}
      </button>
    </div>
  </Modal>
);
