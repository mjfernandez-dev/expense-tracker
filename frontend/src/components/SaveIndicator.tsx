type SaveState = 'idle' | 'saving' | 'saved' | 'error';

interface SaveIndicatorProps { state: SaveState; }

function SaveIndicator({ state }: SaveIndicatorProps) {
  if (state === 'idle') return null;
  if (state === 'saving') return <span className="text-slate-400 text-xs animate-pulse">Guardando...</span>;
  if (state === 'saved') return <span className="text-green-400 text-xs">✓ Guardado</span>;
  if (state === 'error') return <span className="text-red-400 text-xs">Error</span>;
  return null;
}

export default SaveIndicator;
export type { SaveState };
