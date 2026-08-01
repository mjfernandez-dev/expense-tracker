import type { ReactNode } from 'react';

interface ConfirmModalProps {
  title: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loadingLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}

export default function ConfirmModal({
  title,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  loadingLabel = 'Procesando...',
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900/80 backdrop-blur-2xl border border-slate-700/70 rounded-2xl w-full max-w-sm p-6 space-y-4 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <div className="text-slate-300 text-sm space-y-2">{children}</div>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2 rounded-lg border border-slate-600 text-slate-300 text-sm hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-50 ${
              destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
