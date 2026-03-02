// COMPONENTE: Banner de estado offline + badge de pendientes de sync
import { useOnline } from '../hooks/useOnline';

export function OfflineIndicator() {
  const { isOnline, pendingCount } = useOnline();

  // No mostrar nada si está online y no hay pendientes
  if (isOnline && pendingCount === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium ${
        isOnline
          ? 'bg-amber-500/90 text-amber-950'
          : 'bg-slate-800/95 border-b border-slate-700 text-slate-200'
      }`}
    >
      {!isOnline && (
        <>
          <span className="inline-block w-2 h-2 rounded-full bg-red-400 animate-pulse" aria-hidden="true" />
          Sin conexión. Mostrando datos guardados.
        </>
      )}
      {pendingCount > 0 && (
        <span className={isOnline ? '' : 'ml-3'}>
          {isOnline && (
            <span className="inline-block w-2 h-2 rounded-full bg-amber-700 animate-pulse mr-1" aria-hidden="true" />
          )}
          {pendingCount} {pendingCount === 1 ? 'movimiento pendiente' : 'movimientos pendientes'} de sincronizar
        </span>
      )}
    </div>
  );
}
