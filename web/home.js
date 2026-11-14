import { api, esc, toast, ICON } from '/shared/common.js';

const app = document.getElementById('app');
const S = { me: null, step: 'address', address: '', ticket: null, hint: null };

function shell({ back, title, lead, body, button, above }) {
  return `<div class="ios">
    <div class="ios-top">${back ? `<button class="back linkbtn" type="button" id="back">${ICON.back}戻る</button>` : ''}</div>
    <div class="ios-head">
      <div class="logo">${ICON.mail(40, '#fff')}</div>
      <h1>${title}</h1>
      <p>${lead}</p>
    </div>
    <form novalidate>
      ${body}
      <p class="error" role="alert" hidden></p>
      ${button ? `<div class="ios-bottom">${above || ''}<button class="ios-btn" type="submit" disabled>${button}</button></div>` : ''}
    </form>
  </div>`;
}

function wire({ onBack, onSubmit }) {
  const form = app.querySelector('form');
  const err = app.querySelector('.error');
  const btn = form.querySelector('.ios-btn');
  const input = form.querySelector('input');
  if (onBack) app.querySelector('#back').addEventListener('click', onBack);
  if (input && btn) {
    const sync = () => { btn.disabled = !input.value.trim(); };
    input.addEventListener('input', sync);
    sync();
    input.focus();
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!onSubmit) return;
    err.hidden = true;
    btn.disabled = true;
    try {
      await onSubmit(input?.value.trim() ?? '');
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
    }
  });
}

const to = (step) => { S.step = step; render(); };

function address() {
  app.innerHTML = shell({
    title: 'Muscat Account',
    lead: 'メールやその他のサービスを使うには、<br>メールアドレスでサインインしてください。',
    body: `<input class="ios-input" name="address" aria-label="メールアドレス" placeholder="メールアドレス" autocomplete="username" autocapitalize="none" spellcheck="false" value="${esc(S.address)}">`,
    above: '<a class="ios-btn outline" href="/settings/#/create/1">新規作成</a>',
    button: '続ける',
  });
  wire({ onSubmit: (v) => { S.address = v; to('password'); } });
}

function password() {
  app.innerHTML = shell({
    back: true,
    title: 'パスワードを入力',
    lead: `${esc(S.address)}<br>のパスワードを入力してください。`,
    body: `<input class="ios-input" name="password" type="password" aria-label="パスワード" placeholder="パスワード" autocomplete="current-password">
      <a class="textlink center" href="/settings/#/forgot">パスワードをお忘れの場合</a>`,
    button: '続ける',
  });
  wire({
    onBack: () => to('address'),
    onSubmit: async (pw) => {
      const r = await api('/signin', { address: S.address, password: pw });
      if (r.needCode) {
        Object.assign(S, { ticket: r.ticket, hint: r.hint });
        return to('code');
      }
      return done();
    },
  });
}

function code() {
  app.innerHTML = shell({
    back: true,
    title: '確認コードを入力',
    lead: `登録した連絡先（${esc(S.hint)}）に<br>6桁のコードを送りました。`,
    body: `<input class="ios-input code" name="code" inputmode="numeric" maxlength="6" aria-label="6桁のコード" placeholder="000000" autocomplete="one-time-code">
      <button class="textlink center" type="button" id="resend">コードを再送する</button>`,
    button: '続ける',
  });
  app.querySelector('#resend').addEventListener('click', async () => {
    try {
      await api('/resend', { ticket: S.ticket });
      toast('コードを再送しました。');
    } catch (ex) {
      toast(ex.message);
    }
  });
  wire({
    onBack: () => to('password'),
    onSubmit: async (v) => {
      await api('/verify', { ticket: S.ticket, code: v });
      return done();
    },
  });
}

async function done() {
  S.me = await api('/me');
  to('home');
}

function home() {
  const a = S.me.accounts.find((x) => x.id === S.me.active);
  app.innerHTML = `<div class="home">
    <div>
      <h1>こんにちは、${esc(a.name)}さん</h1>
      <p>${esc(a.address)}<br>設定アプリとメールアプリは別のアプリです。</p>
    </div>
    <div class="icons">
      <a class="appicon" href="/settings/"><span class="tile c-gray"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"></path></svg></span>設定</a>
      <a class="appicon" href="/mail/"><span class="tile c-teal">${ICON.mail(40, '#fff')}</span>メール</a>
    </div>
    <div class="spacer"></div>
    <button class="btn danger" type="button" id="signout">サインアウト</button>
  </div>`;
  app.querySelector('#signout').addEventListener('click', async () => {
    await api('/signout', {});
    S.address = '';
    S.me = await api('/me');
    to(S.me.active ? 'home' : 'address');
  });
}

function render() {
  ({ address, password, code, home })[S.step]();
  window.scrollTo(0, 0);
}

try {
  S.me = await api('/me');
  S.step = S.me.active ? 'home' : 'address';
  render();
} catch (ex) {
  app.innerHTML = `<div class="screen"><p class="error">${esc(ex.message)}</p></div>`;
}
