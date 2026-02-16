let host;

function ensureHost() {
  if (host) return host;
  host = document.createElement('div');
  host.className = 'toasts';
  host.setAttribute('aria-live', 'polite');
  host.setAttribute('aria-atomic', 'true');
  host.setAttribute('role', 'status');
  document.body.append(host);
  return host;
}

export function notify(message, type = 'info', timeoutMs = 2600) {
  const root = ensureHost();
  const node = document.createElement('div');
  node.className = `toast toast-${type}`;
  node.textContent = message;
  root.append(node);

  setTimeout(() => {
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 220);
  }, timeoutMs);
}
