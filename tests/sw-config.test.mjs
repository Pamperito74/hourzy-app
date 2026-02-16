import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('service worker includes offline fallback and versioned cache', async () => {
  const source = await fs.readFile(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(source, /CACHE_NAME\s*=\s*'hourzy-runtime-v\d+'/);
  assert.match(source, /offline\.html/);
  assert.match(source, /caches\.keys\(/);
});
