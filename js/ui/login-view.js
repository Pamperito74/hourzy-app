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
  const passInput = document.createElement('input');
  passInput.id = 'loginPassword';
  passInput.type = 'password';
  passInput.required = true;
  passInput.autocomplete = 'current-password';
  passField.append(passLabel, passInput);

  const loginBtn = document.createElement('button');
  loginBtn.className = 'primary';
  loginBtn.type = 'submit';
  loginBtn.textContent = 'Login';

  const seedHint = document.createElement('p');
  seedHint.className = 'muted';
  seedHint.textContent = 'Initial seed: superadmin / SuperAdmin1234!!!!';

  form.append(userField, passField, loginBtn, seedHint);
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
