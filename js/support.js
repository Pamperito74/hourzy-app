export async function getBrowserSupportReport() {
  const report = {
    indexedDb: false,
    webCrypto: Boolean(globalThis.crypto?.subtle),
    broadcastChannel: typeof BroadcastChannel !== 'undefined',
    serviceWorker: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    fileProtocol: typeof location !== 'undefined' && location.protocol === 'file:',
    issues: []
  };

  if (!('indexedDB' in globalThis)) {
    report.indexedDb = false;
    report.issues.push('IndexedDB API is unavailable.');
    return report;
  }

  report.indexedDb = await new Promise((resolve) => {
    const name = `hourzy-support-${Date.now()}`;
    const req = indexedDB.open(name, 1);
    req.onerror = () => resolve(false);
    req.onsuccess = () => {
      req.result.close();
      indexedDB.deleteDatabase(name);
      resolve(true);
    };
  });

  if (!report.indexedDb) {
    report.issues.push('IndexedDB open failed (private mode/storage policy may block local storage).');
  }
  if (!report.webCrypto) {
    report.issues.push('Web Crypto API unavailable. Encryption features disabled.');
  }
  if (!report.broadcastChannel) {
    report.issues.push('BroadcastChannel unavailable. Multi-tab coordination is degraded.');
  }
  if (report.fileProtocol) {
    report.issues.push('Running from file:// disables service worker and some security features.');
  }

  return report;
}
