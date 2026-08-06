// HOOK: Detecta conectividad y expone estado + contador de pendientes
import { useState, useEffect } from 'react';
import { getPendingCount } from '../services/offlineDB';

export function useOnline() {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [pendingCount, setPendingCount] = useState<number>(0);

  const refreshPendingCount = async () => setPendingCount(await getPendingCount());

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    // Contador inicial: se setea en el callback de la promesa, no de forma
    // síncrona en el effect (evita render en cascada).
    getPendingCount().then(setPendingCount).catch(() => setPendingCount(0));
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOnline, pendingCount, refreshPendingCount };
}
