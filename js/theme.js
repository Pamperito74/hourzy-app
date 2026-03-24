const STORAGE_KEY = 'hourzy:theme';

export const THEMES = [
  {
    id: 'hourzy',
    name: 'Hourzy',
    description: 'Default teal',
    preview: ['#0c7a6a', '#f2f5f7', '#dce4ea'],
  },
  {
    id: 'dawn',
    name: 'Dawn',
    description: 'Warm purple light',
    preview: ['#6d3ef7', '#faf9f7', '#e8e2f0'],
  },
  {
    id: 'midnight',
    name: 'Midnight',
    description: 'Deep dark violet',
    preview: ['#8b5cf6', '#0d0d12', '#26263a'],
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Dark blue & cyan',
    preview: ['#06b6d4', '#0a1628', '#1a2e4a'],
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Natural green',
    preview: ['#16a34a', '#f0f5f1', '#ccddd2'],
  },
];

export function getSavedTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.some((t) => t.id === stored)) return stored;
  } catch { /* ignore */ }
  return 'hourzy';
}

export function applyTheme(id) {
  const valid = THEMES.some((t) => t.id === id) ? id : 'hourzy';
  document.documentElement.setAttribute('data-theme', valid);
  try { localStorage.setItem(STORAGE_KEY, valid); } catch { /* ignore */ }
}

export function initTheme() {
  applyTheme(getSavedTheme());
}
