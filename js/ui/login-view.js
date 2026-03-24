import { loginWithPassword } from '../auth.js';
import { notify } from '../notify.js';

export function renderLoginView(root, { onLoginSuccess }) {
  const card = document.createElement('section');
  card.className = 'card';

  const title = document.createElement('h2');
  title.textContent = 'Sign In';
  const hint = document.createElement('p');
  hint.className = 'muted';
  hint.textContent = 'Use your local Hourzy credentials to continue.';

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
  loginBtn.textContent = 'Login';

  form.append(userField, passField, loginBtn);
  card.append(title, hint, form);
  root.append(card);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await loginWithPassword(userInput.value, passInput.value);
      passInput.value = '';
      notify('Login successful.', 'success');
      await onLoginSuccess();
    } catch (error) {
      passInput.value = '';
      notify(error.message || 'Login failed.', 'error');
    }
  });
}
