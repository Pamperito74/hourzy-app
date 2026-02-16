import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const APP_ROOT = resolve(process.cwd(), 'app');

export default defineConfig({
  root: APP_ROOT,
  build: {
    outDir: resolve(APP_ROOT, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(APP_ROOT, 'index.html'),
        vaultMigration: resolve(APP_ROOT, 'integration/vault-migration.html')
      }
    }
  }
});
