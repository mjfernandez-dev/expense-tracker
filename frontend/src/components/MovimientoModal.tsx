import { useEffect } from 'react';
import type { Movimiento } from '../types';
import MovimientoForm from './MovimientoForm';

interface MovimientoModalProps {
  isOpen: boolean;
  onClose: () => void;
  movimientoToEdit?: Movimiento | null;
  onMovimientoCreated: () => void;
  onMovimientoUpdated: () => void;
  categoriesVersion?: number;
}

function MovimientoModal({
  isOpen,
  onClose,
  movimientoToEdit,
  onMovimientoCreated,
  onMovimientoUpdated,
  categoriesVersion,
}: MovimientoModalProps) {

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg p-1.5 transition-colors leading-none"
          aria-label="Cerrar"
        >
          ✕
        </button>

        <MovimientoForm
          categoriesVersion={categoriesVersion}
          onMovimientoCreated={onMovimientoCreated}
          onMovimientoUpdated={onMovimientoUpdated}
          movimientoToEdit={movimientoToEdit}
          onCancelEdit={onClose}
        />
      </div>
    </div>
  );
}

export default MovimientoModal;
