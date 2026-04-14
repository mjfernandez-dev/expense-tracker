declare module 'virtual:pwa-register' {
  import type { RegisterSWOptions } from 'vite-plugin-pwa/types';

  export function registerSW(options?: RegisterSWOptions): () => Promise<void>;
}
