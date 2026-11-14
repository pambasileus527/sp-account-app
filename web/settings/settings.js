import { api, esc, toast, avatarClass, ICON } from '/shared/common.js';

const app = document.getElementById('app');
const state = {
  me: null,
  signup: { sei: '', mei: '', y: '', m: '', d: '', local: '', pw: '', pw2: '', contact: '' },
  ticket: null,
  purpose: null,
  hint: null,
  resetToken: null,
};

const domain = () => state.me?.domain || 'muscat.example';
const active = () => state.me?.accounts.find((a) => a.id === state.me.active);

async function loadMe() {
  state.me = await api('/me');
}

async function go(path) {
  await loadMe();
  if (location.hash === `#${path}`) render();
  else location.hash = `#${path}`;
}

function currentPath() {
  return (location.hash.replace(/^#/, '') || '/').split('?')[0];
}

const back = (to) => `<a class="back" href="#${to}">${ICON.back}戻る</a>`;

function show(html) {
  app.innerHTML = html;
  window.scrollTo(0, 0);
}

// フォームを送信中は二重に押せないようにして、エラーは画面の上に出す
function bindForm(handler) {
  const form = app.querySelector('form');
  const err = app.querySelector('.error');
  const btn = form.querySelector('button[type=submit]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    btn.disabled = true;
    try {
      await handler(new FormData(form));
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });
}

const errorLine = '<p class="error" role="alert" hidden></p>';

/* ---------- 設定（サインイン前・後） ---------- */
function start() {
  const a = active();
  const row = a
    ? `<a class="signin-row" href="#/account">
         <span class="av pfp me">${esc(a.initial)}</span>
         <span class="who"><b>${esc(a.name)}</b><span>${esc(a.address)}</span></span>
       </a>`
    : `<a class="signin-row" href="#/signin">
         <span class="av pfp"><svg width="40" height="40" viewBox="0 0 24 24" fill="#7fa9ad" aria-hidden="true"><circle cx="12" cy="9" r="4"></circle><path d="M4 22c0-5 3.6-8 8-8s8 3 8 8z"></path></svg></span>
         <span class="who"><b>サインイン</b><span>Muscat Accountで<br>サインイン</span></span>
       </a>`;
  const item = (cls, icon, label) => `<a class="item" href="#/"><span class="ico ${cls}">${icon}</span>${label}</a>`;
  const w = (body) => ICON.tile(body, '#fff').replace('width="40" height="40"', 'width="18" height="18"');
  show(`<div class="side">
    <div class="dots" aria-hidden="true"><i class="r"></i><i class="y"></i><i class="g"></i></div>
    <div class="search">${ICON.search}検索</div>
    ${row}
    <div class="items">
      ${item('c-blue', w('<rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="M4 7.5l8 6 8-6"></path>'), 'メールアドレス')}
      ${item('c-green', w('<path d="M3 12h4l3-7 4 14 3-7h4"></path>'), '接続状況')}
      ${item('c-gray', w('<ellipse cx="12" cy="6" rx="8" ry="3"></ellipse><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6"></path><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"></path>'), 'ストレージ')}
    </div>
    <div class="items">
      ${item('c-gray', w('<circle cx="12" cy="12" r="3"></circle><path d="M12 3v3M12 18v3M3 12h3M18 12h3"></path>'), '一般')}
      ${item('c-teal', w('<circle cx="12" cy="12" r="4"></circle><path d="M12 3v2M12 19v2M3 12h2M19 12h2"></path>'), '外観')}
      ${item('c-red', w('<path d="M6 8a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7z"></path><path d="M10 19a2 2 0 0 0 4 0"></path>'), '通知')}
      ${item('c-purple', w('<rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>'), 'プライバシーとセキュリティ')}
    </div>
  </div>`);
}

/* ---------- サインイン ---------- */
function signin() {
  show(`<div class="screen">
    ${back('/')}
    <div class="hero">
      <div class="logo">${ICON.mail(40, '#fff')}</div>
      <h1 class="title center">Muscat Account<br>にサインイン</h1>
      <p class="lead center">自分だけのアドレスを作って、<br>メールの送受信と設定をひとつの場所で。</p>
    </div>
    <form novalidate>
      <div class="field"><label for="address">メールアドレス</label>
        <input class="input" id="address" name="address" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="name@${esc(domain())}"></div>
      <div class="field"><label for="password">パスワード</label>
        <input class="input" id="password" name="password" type="password" autocomplete="current-password"></div>
      ${errorLine}
      <button class="btn" type="submit">続ける</button>
    </form>
    <div class="divider">または</div>
    <button class="btn ghost" id="passkey" type="button">${ICON.person}パスキーでサインイン</button>
    <div class="spacer"></div>
    <div class="links"><a href="#/forgot">パスワードをお忘れの場合</a><a href="#/create/1">アドレスを新しく作る</a></div>
  </div>`);
  app.querySelector('#passkey').addEventListener('click', () => toast('パスキーは準備中です。'));
  bindForm(async (f) => {
    const r = await api('/signin', { address: f.get('address'), password: f.get('password') });
    if (r.needCode) {
      Object.assign(state, { ticket: r.ticket, purpose: 'signin', hint: r.hint });
      return go('/verify');
    }
    return go('/account');
  });
}

/* ---------- アドレスを新しく作る（4ステップ） ---------- */
const stepHead = (n, title, lead, backTo) => `
  <div class="top">${back(backTo)}<span class="step">${n} / 4</span></div>
  <div class="head"><h1 class="title">${title}</h1><p class="lead">${lead}</p></div>`;

function create1() {
  const s = state.signup;
  show(`<div class="screen">
    ${stepHead(1, '名前を入力', 'アカウントに表示する名前です。あとから変えられます。', '/signin')}
    <form novalidate>
      <div class="row">
        <div class="field"><label for="sei">姓</label><input class="input" id="sei" name="sei" autocomplete="family-name" value="${esc(s.sei)}" placeholder="山田"></div>
        <div class="field"><label for="mei">名</label><input class="input" id="mei" name="mei" autocomplete="given-name" value="${esc(s.mei)}" placeholder="太郎"></div>
      </div>
      ${errorLine}
      <button class="btn" type="submit">次へ</button>
    </form>
  </div>`);
  bindForm(async (f) => {
    const sei = String(f.get('sei')).trim(), mei = String(f.get('mei')).trim();
    if (!sei || !mei) throw new Error('姓と名を入力してください。');
    Object.assign(s, { sei, mei });
    location.hash = '#/create/2';
  });
}

function create2() {
  const s = state.signup;
  show(`<div class="screen">
    ${stepHead(2, '生年月日を入力', '年齢の確認に使います。ほかの人には表示されません。', '/create/1')}
    <form novalidate>
      <div class="row">
        <div class="field"><label for="y">年</label><input class="input" id="y" name="y" inputmode="numeric" autocomplete="bday-year" value="${esc(s.y)}" placeholder="1990"></div>
        <div class="field"><label for="m">月</label><input class="input" id="m" name="m" inputmode="numeric" autocomplete="bday-month" value="${esc(s.m)}" placeholder="1"></div>
        <div class="field"><label for="d">日</label><input class="input" id="d" name="d" inputmode="numeric" autocomplete="bday-day" value="${esc(s.d)}" placeholder="1"></div>
      </div>
      ${errorLine}
      <button class="btn" type="submit">次へ</button>
    </form>
  </div>`);
  bindForm(async (f) => {
    const [y, m, d] = ['y', 'm', 'd'].map((k) => String(f.get(k)).trim());
    if (!/^\d{4}$/.test(y) || !/^\d{1,2}$/.test(m) || !/^\d{1,2}$/.test(d)) throw new Error('年は4桁、月と日は数字で入力してください。');
    Object.assign(s, { y, m, d });
    location.hash = '#/create/3';
  });
}

function create3() {
  const s = state.signup;
  show(`<div class="screen">
    ${stepHead(3, 'アドレスを決める', '英小文字、数字、ピリオド、ハイフン、アンダースコアが使えます。', '/create/2')}
    <form novalidate>
      <div class="field"><label for="local">アドレス</label>
        <div class="addr"><input id="local" name="local" autocapitalize="none" autocomplete="off" spellcheck="false" value="${esc(s.local)}" placeholder="好きな名前"><span>@${esc(domain())}</span></div></div>
      ${errorLine}
      <button class="btn" type="submit">次へ</button>
    </form>
  </div>`);
  bindForm(async (f) => {
    const local = String(f.get('local')).trim().toLowerCase();
    await api('/signup/check', { local });
    s.local = local;
    location.hash = '#/create/4';
  });
}

function create4() {
  const s = state.signup;
  show(`<div class="screen">
    ${stepHead(4, 'パスワードを決める', '忘れにくくて、ほかで使っていないものにしてください。12文字以上です。', '/create/3')}
    <form novalidate>
      <div class="field"><label for="pw">パスワード</label><input class="input" id="pw" name="pw" type="password" autocomplete="new-password"></div>
      <div class="field"><label for="pw2">パスワードの確認</label><input class="input" id="pw2" name="pw2" type="password" autocomplete="new-password"></div>
      <div class="field"><label for="contact">連絡先のメール（任意）</label><input class="input" id="contact" name="contact" type="email" autocomplete="email" value="${esc(s.contact)}" placeholder="you@example.com"></div>
      ${errorLine}
      <button class="btn" type="submit">アドレスを作成</button>
    </form>
    <div class="spacer"></div>
    <p class="foot">連絡先のメールは、パスワードを忘れたときと、新しい端末で入るときの確認にだけ使います。あとから追加もできます。</p>
  </div>`);
  bindForm(async (f) => {
    const pw = String(f.get('pw'));
    if (pw !== String(f.get('pw2'))) throw new Error('パスワードが一致しません。');
    s.contact = String(f.get('contact')).trim();
    await api('/signup', {
      sei: s.sei, mei: s.mei, birth: { y: s.y, m: s.m, d: s.d }, local: s.local, password: pw, contact: s.contact,
    });
    Object.assign(s, { pw: '', pw2: '' });
    return go('/account');
  });
}

/* ---------- パスワード再設定・確認コード ---------- */
function forgot() {
  show(`<div class="screen">
    ${back('/signin')}
    <div class="head"><h1 class="title">パスワードを再設定</h1>
      <p class="lead">アドレスを入れると、登録した連絡先に6桁のコードを送ります。</p></div>
    <form novalidate>
      <div class="field"><label for="address">メールアドレス</label>
        <input class="input" id="address" name="address" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="name@${esc(domain())}"></div>
      ${errorLine}
      <button class="btn" type="submit">コードを送る</button>
    </form>
    <div class="spacer"></div>
    <p class="foot">連絡先を登録していないアドレスは、再設定できません。</p>
  </div>`);
  bindForm(async (f) => {
    const r = await api('/reset/request', { address: f.get('address') });
    Object.assign(state, { ticket: r.ticket, purpose: 'reset', hint: null });
    location.hash = '#/verify';
  });
}

function verify() {
  if (!state.ticket) return go('/signin');
  const lead = state.purpose === 'reset' || !state.hint
    ? 'アドレスの登録があれば、登録した連絡先に6桁のコードを送りました。10分以内に入力してください。'
    : `登録した連絡先（${esc(state.hint)}）に6桁のコードを送りました。10分以内に入力してください。`;
  show(`<div class="screen">
    ${back(state.purpose === 'reset' ? '/forgot' : '/signin')}
    <div class="head"><h1 class="title">確認コードを入力</h1><p class="lead">${lead}</p></div>
    <form novalidate>
      <div class="field"><label for="code">6桁のコード</label>
        <input class="input code" id="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"></div>
      ${errorLine}
      <button class="btn" type="submit">確認する</button>
    </form>
    <div class="stack">
      <button class="linkbtn" id="resend" type="button">コードを再送する</button>
      <button class="linkbtn" id="passkey" type="button">パスキーを使う</button>
    </div>
    <div class="spacer"></div>
    <p class="foot">コードが届かないときは、迷惑メールフォルダも確認してください。</p>
  </div>`);
  app.querySelector('#passkey').addEventListener('click', () => toast('パスキーは準備中です。'));
  app.querySelector('#resend').addEventListener('click', async () => {
    try {
      await api('/resend', { ticket: state.ticket });
      toast('コードを再送しました。');
    } catch (ex) {
      toast(ex.message);
    }
  });
  bindForm(async (f) => {
    const r = await api('/verify', { ticket: state.ticket, code: String(f.get('code')).trim() });
    if (r.resetToken) {
      state.resetToken = r.resetToken;
      location.hash = '#/newpass';
      return;
    }
    state.ticket = null;
    return go('/account');
  });
}

function newpass() {
  if (!state.resetToken) return go('/forgot');
  show(`<div class="screen">
    <div class="head"><h1 class="title">新しいパスワード</h1>
      <p class="lead">12文字以上で、ほかで使っていないものにしてください。</p></div>
    <form novalidate>
      <div class="field"><label for="pw">新しいパスワード</label><input class="input" id="pw" name="pw" type="password" autocomplete="new-password"></div>
      <div class="field"><label for="pw2">パスワードの確認</label><input class="input" id="pw2" name="pw2" type="password" autocomplete="new-password"></div>
      ${errorLine}
      <button class="btn" type="submit">パスワードを変更</button>
    </form>
  </div>`);
  bindForm(async (f) => {
    const pw = String(f.get('pw'));
    if (pw !== String(f.get('pw2'))) throw new Error('パスワードが一致しません。');
    await api('/reset/complete', { resetToken: state.resetToken, password: pw });
    Object.assign(state, { resetToken: null, ticket: null });
    toast('パスワードを変更しました。');
    return go('/account');
  });
}

/* ---------- アカウント設定 ---------- */
function account() {
  const a = active();
  if (!a) return go('/signin');
  const line = (icon, label, val) => `<button class="line" type="button" data-soon>${icon}<span class="grow">${label}</span><span class="val">${esc(val)}</span></button>`;
  show(`<div class="screen">
    <h2 class="big">設定</h2>
    <div class="profile">
      <span class="${avatarClass(a.address)}">${esc(a.initial)}</span>
      <div><b>${esc(a.name)}</b><div class="sub">${esc(a.address)}</div></div>
    </div>
    <div class="list">
      ${line(ICON.mail(22, '#0e7c86'), '連絡先のメール', a.contact || '未設定')}
      ${line(ICON.person, 'パスキーとログイン', '準備中')}
      ${line(ICON.shield, '2段階認証', '新しい端末で確認')}
      ${line(ICON.bell, '通知', '')}
      ${line(ICON.lock, 'プライバシー', '')}
    </div>
    <div class="list"><a class="line" href="#/signin"><span class="grow">別のアカウントを追加</span></a></div>
    <button class="btn danger" id="signout" type="button">サインアウト</button>
    <a class="back" href="/">ホーム画面へ</a>
  </div>`);
  app.querySelectorAll('[data-soon]').forEach((b) => b.addEventListener('click', () => toast('この項目は準備中です。')));
  app.querySelector('#signout').addEventListener('click', async () => {
    await api('/signout', {});
    return go('/');
  });
}

const routes = {
  '/': start, '/signin': signin, '/forgot': forgot, '/verify': verify, '/newpass': newpass, '/account': account,
  '/create/1': create1, '/create/2': create2, '/create/3': create3, '/create/4': create4,
};

async function render() {
  if (!state.me) {
    try {
      await loadMe();
    } catch (ex) {
      show(`<div class="screen"><p class="error">${esc(ex.message)}</p></div>`);
      return;
    }
  }
  (routes[currentPath()] || start)();
}

window.addEventListener('hashchange', render);
render();
