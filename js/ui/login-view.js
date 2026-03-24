import { loginWithPassword } from '../auth.js';
import { notify } from '../notify.js';

export function renderLoginView(root, { onLoginSuccess }) {
  const wrap = document.createElement('div');
  wrap.className = 'login-wrap';

  const card = document.createElement('section');
  card.className = 'login-card';

  const title = document.createElement('h2');
  title.textContent = 'Welcome back';

  const sub = document.createElement('p');
  sub.className = 'login-sub';
  sub.textContent = 'Sign in with your local Hourzy credentials.';

  const form = document.createElement('form');
  form.className = 'grid';

  const userField = document.createElement('div');
  userField.className = 'field';
  const userLabel = document.createElement('label');
  userLabel.htmlFor = 'loginUsername';
  userLabel.textContent = 'Username';
  const userInput = document.createElement('input');
  userInput.id = 'loginUsername';
  userInput.required = true;
  userInput.autocomplete = 'username';
  userInput.placeholder = 'Enter username';
  userField.append(userLabel, userInput);

  const passField = document.createElement('div');
  passField.className = 'field';
  const passLabel = document.createElement('label');
  passLabel.htmlFor = 'loginPassword';
  passLabel.textContent = 'Password';
  const passWrap = document.createElement('div');
  passWrap.className = 'input-reveal';
  const passInput = document.createElement('input');
  passInput.id = 'loginPassword';
  passInput.type = 'password';
  passInput.required = true;
  passInput.autocomplete = 'current-password';
  passInput.placeholder = '••••••••';
  const revealBtn = document.createElement('button');
  revealBtn.type = 'button';
  revealBtn.className = 'reveal-btn';
  revealBtn.setAttribute('aria-label', 'Show password');
  revealBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`;
  revealBtn.addEventListener('click', () => {
    const showing = passInput.type === 'text';
    passInput.type = showing ? 'password' : 'text';
    revealBtn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    revealBtn.innerHTML = showing
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-10-8-10-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;
  });
  passWrap.append(passInput, revealBtn);
  passField.append(passLabel, passWrap);

  const loginBtn = document.createElement('button');
  loginBtn.className = 'primary';
  loginBtn.type = 'submit';
  loginBtn.style.cssText = 'width:100%;padding:12px;font-size:0.95rem;margin-top:4px;';
  loginBtn.textContent = 'Sign in';

  form.append(userField, passField, loginBtn);
  card.append(title, sub, form);
  wrap.append(card);
  root.append(wrap);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginBtn.disabled = true;
    loginBtn.textContent = 'Signing in…';
    try {
      await loginWithPassword(userInput.value, passInput.value);
      passInput.value = '';
      notify('Welcome back.', 'success');
      await onLoginSuccess();
    } catch (error) {
      passInput.value = '';
      loginBtn.disabled = false;
      loginBtn.textContent = 'Sign in';
      notify(error.message || 'Login failed.', 'error');
    }
  });
}
