import { useEffect, useRef } from 'react';
import type { Movimiento } from '../types';
import MovimientoForm from './MovimientoForm';

interface MovimientoModalProps {
  isOpen: boolean;
  onClose: () => void;
  movimientoToEdit?: Movimiento | null;
  onMovimientoCreated: (movimiento?: Movimiento) => void;
  onMovimientoUpdated: () => void;
  categoriesVersion?: number;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function MovimientoModal({
  isOpen,
  onClose,
  movimientoToEdit,
  onMovimientoCreated,
  onMovimientoUpdated,
  categoriesVersion,
}: MovimientoModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Guardar el elemento enfocado antes de abrir y restaurarlo al cerrar
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus();
      previousFocusRef.current = null;
    }
  }, [isOpen]);

  // Mover foco al primer elemento del modal al abrir
  useEffect(() => {
    if (!isOpen) return;
    const frame = requestAnimationFrame(() => {
      const first = modalRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)[0];
      first?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  // Escape y focus trap
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        modalRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/75 backdrop-blur-sm"
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={movimientoToEdit ? 'Editar movimiento' : 'Nuevo movimiento'}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        aria-hidden={undefined}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 text-slate-400 hover:text-white bg-slate-700 hover:bg-slate-600 rounded-lg p-1.5 transition-colors leading-none"
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
