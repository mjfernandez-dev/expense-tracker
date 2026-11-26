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

  // Mover el foco al importe al abrir el modal: en el celular eso abre el
  // teclado numerico. El foco se pide de forma sincrona (sin rAF ni timeout):
  // iOS Safari solo muestra el teclado si el focus ocurre dentro del gesto
  // del usuario, y un frame despues ya lo considera programatico.
  useEffect(() => {
    if (!isOpen) return;
    const target = modalRef.current?.querySelector<HTMLElement>('input[type="number"]');
    target?.focus();
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-2 backdrop-blur-sm sm:p-4"
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={movimientoToEdit ? 'Editar movimiento' : 'Nuevo movimiento'}
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto supports-[height:100dvh]:max-h-[calc(100dvh-0.5rem)]"
        onClick={(e) => e.stopPropagation()}
        aria-hidden={undefined}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 rounded-lg bg-slate-700 p-1.5 leading-none text-slate-400 transition-colors hover:bg-slate-600 hover:text-white"
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
