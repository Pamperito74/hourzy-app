import { loginWithPassword } from '../auth.js';
import { nukeAllLocalData } from '../db.js';
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
  revealBtn.textContent = '👁';
  revealBtn.addEventListener('click', () => {
    const showing = passInput.type === 'text';
    passInput.type = showing ? 'password' : 'text';
    revealBtn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    revealBtn.textContent = showing ? '👁' : '🙈';
  });
  passWrap.append(passInput, revealBtn);
  passField.append(passLabel, passWrap);

  const loginBtn = document.createElement('button');
  loginBtn.className = 'primary';
  loginBtn.type = 'submit';
  loginBtn.style.cssText = 'width:100%;padding:12px;font-size:0.95rem;margin-top:4px;';
  loginBtn.textContent = 'Sign in';

  const resetWrap = document.createElement('p');
  resetWrap.className = 'reset-hint';
  const resetLink = document.createElement('button');
  resetLink.type = 'button';
  resetLink.className = 'link-btn';
  resetLink.textContent = 'Reset all local data';
  resetLink.addEventListener('click', async () => {
    const confirmed = window.confirm('This will permanently delete all local Hourzy data and reload. Continue?');
    if (!confirmed) return;
    await nukeAllLocalData();
    location.reload();
  });
  resetWrap.append(resetLink);

  form.append(userField, passField, loginBtn);
  card.append(title, sub, form, resetWrap);
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
