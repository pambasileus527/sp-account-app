import { api, esc } from '/shared/common.js';

const app = document.getElementById('app');
let users = [];
let query = '';

const fmt = (ms) => new Date(ms).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });

async function fetchUsers() {
  const res = await fetch('/api/admin/users');
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function signin(message = '', step = 'pw', ticket = '', hint = '') {
  const code = step === 'code';
  app.innerHTML = `<div class="screen">
    <div class="head"><h1 class="title">管理画面</h1>
      <p class="lead">${code ? `${esc(hint)} に届いたコードを入力してください。` : '管理者のアカウントでサインインしてください。'}</p></div>
    <form novalidate>
      ${code ? '<div class="field"><label for="c">確認コード</label><input class="input" id="c" inputmode="numeric" autocomplete="one-time-code"></div>' : `
      <div class="field"><label for="a">アドレス</label><input class="input" id="a" autocomplete="username" autocapitalize="none"></div>
      <div class="field"><label for="p">パスワード</label><input class="input" id="p" type="password" autocomplete="current-password"></div>`}
      <p class="error" role="alert" ${message ? '' : 'hidden'}>${esc(message)}</p>
      <button class="btn" type="submit">${code ? '確認' : 'サインイン'}</button>
    </form>
  </div>`;
  app.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = (id) => app.querySelector(id).value;
    try {
      if (code) {
        await api('/verify', { ticket, code: q('#c') });
      } else {
        const r = await api('/signin', { address: q('#a'), password: q('#p') });
        if (r && r.needCode) return signin('', 'code', r.ticket, r.hint);
      }
      open();
    } catch (ex) {
      signin(ex.message, step, ticket, hint);
    }
  });
}

function notice(title, text) {
  app.innerHTML = `<div class="screen"><div class="head"><h1 class="title">${esc(title)}</h1><p class="lead">${esc(text)}</p></div></div>`;
}

function rows() {
  const q = query.trim().toLowerCase();
  const list = q ? users.filter((u) => `${u.name} ${u.address} ${u.contact || ''}`.toLowerCase().includes(q)) : users;
  return list.length
    ? list.map((u) => `<tr>
        <td class="num">${u.id}</td><td>${esc(u.name)}</td><td>${esc(u.address)}</td>
        <td>${u.contact ? esc(u.contact) : '<span class="muted">未登録</span>'}</td>
        <td>${esc(fmt(u.createdAt))}</td><td class="num">${u.mails}（未読 ${u.unread}）</td>
        <td><button class="btn-del" type="button" data-id="${u.id}">削除</button></td></tr>`).join('')
    : '<tr><td colspan="7" class="muted">該当するアカウントはありません。</td></tr>';
}

function table() {
  app.innerHTML = `<div class="admin">
    <div class="admin-bar"><h1>登録済みアカウント <span class="muted">${users.length}件</span></h1>
      <button class="btn ghost" type="button" id="reload">再読み込み</button></div>
    <input class="input" id="q" placeholder="名前・アドレスで絞り込む" aria-label="絞り込み" value="${esc(query)}">
    <div class="tablewrap"><table>
      <thead><tr><th>ID</th><th>名前</th><th>アドレス</th><th>連絡先</th><th>作成日時</th><th>メール</th><th></th></tr></thead>
      <tbody id="body">${rows()}</tbody></table></div>
    <p class="foot">パスワードは保存されていますが、元に戻せない形（ハッシュ）なので、ここには出ません。</p>
  </div>`;
  app.querySelector('#q').addEventListener('input', (e) => {
    query = e.target.value;
    app.querySelector('#body').innerHTML = rows();
  });
  app.querySelector('#reload').addEventListener('click', open);
  app.querySelector('#body').addEventListener('click', onDelete);
}

let armed = null;
async function onDelete(e) {
  const btn = e.target.closest('.btn-del');
  if (!btn) return;
  if (armed !== btn) { // 1回目: 確認の状態にする
    reset();
    armed = btn;
    btn.textContent = 'もう一度押すと削除';
    btn.classList.add('armed');
    btn.timer = setTimeout(reset, 4000);
    return;
  }
  try {
    await api('/admin/delete', { id: Number(btn.dataset.id) });
    armed = null;
    open();
  } catch (ex) {
    reset();
    btn.textContent = ex.message;
  }
}
function reset() {
  if (!armed) return;
  clearTimeout(armed.timer);
  armed.textContent = '削除';
  armed.classList.remove('armed');
  armed = null;
}

async function open() {
  const { status, data } = await fetchUsers();
  if (status === 200) { users = data; return table(); }
  if (status === 401) return signin();
  if (status === 403) return signin('このアカウントは管理者ではありません。管理者のアカウントでサインインしてください。');
  if (status === 404) return notice('管理画面は無効です', 'サーバーの ADMIN_ADDRESSES に管理者のアドレスを設定してください。');
  notice('読み込めませんでした', data.error || 'もう一度お試しください。');
}

open();
