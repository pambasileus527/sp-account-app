import { api, esc, toast, avatarClass, ICON } from '/shared/common.js';

const app = document.getElementById('app');
let me = null;
let mails = [];
let panelOpen = false;

const active = () => me.accounts.find((a) => a.id === me.active);
const initialOf = (name) => Array.from(name || '?')[0];

function formatTime(ms) {
  const d = new Date(ms);
  const now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diff === 1) return '昨日';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatFull(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function load() {
  me = await api('/me');
  if (!me.active) {
    // サインインしていなければ、ホームのサインイン画面へ
    location.replace('/');
    return false;
  }
  mails = await api('/mails');
  return true;
}

function panel() {
  if (!panelOpen) return '';
  const a = active();
  const rows = me.accounts
    .map((acc) => `<button class="acct" type="button" data-id="${acc.id}">
      <span class="${avatarClass(acc.address)}">${esc(acc.initial)}</span>
      <span class="w"><b>${esc(acc.name)}</b><span>${esc(acc.address)}</span></span>
      <span class="n">${acc.id === me.active ? '使用中' : `未読 ${acc.unread}`}</span>
    </button>`)
    .join('');
  return `<button class="scrim" type="button" id="scrim" aria-label="閉じる"></button>
    <div class="sheet" role="dialog" aria-label="アカウント">
      <div class="t"><button class="x" type="button" id="close" aria-label="閉じる">${ICON.close}</button><b>Muscat Account</b><span class="x"></span></div>
      <div class="me"><span class="${avatarClass(a.address)}">${esc(a.initial)}</span><div><b>${esc(a.name)}</b><span>${esc(a.address)}</span></div></div>
      <div class="manage"><a class="btn ghost" href="/settings/#/account">Muscat Account を管理</a></div>
      <hr>
      ${rows}
      <a class="act" href="/settings/#/signin">${ICON.addPerson}別のアカウントを追加</a>
      <a class="act" href="/settings/#/account">${ICON.manage}このデバイスのアカウントを管理</a>
      <hr>
      <div class="legal"><span>プライバシー ポリシー</span><span aria-hidden="true">·</span><span>利用規約</span></div>
    </div>`;
}

function renderList() {
  const a = active();
  const items = mails.length
    ? mails
        .map((m) => `<button class="m${m.unread ? ' unread' : ''}" type="button" data-id="${m.id}">
          <span class="${avatarClass(m.from)}">${esc(initialOf(m.from))}</span>
          <span class="body">
            <span class="l1"><span class="name">${esc(m.from)}</span><span class="time">${esc(formatTime(m.receivedAt))}</span></span>
            <span class="subj">${esc(m.subject)}</span>
            <span class="l3"><span class="prev">${esc(m.preview)}</span><i class="dot"></i></span>
          </span>
        </button>`)
        .join('')
    : '<div class="empty">メールはまだありません。</div>';
  const tab = (label, icon, on) => `<button class="tab${on ? ' on' : ''}" type="button" data-soon>${icon(on ? '#0e7c86' : '#4f5b63')}${label}</button>`;
  app.innerHTML = `<div class="mail">
    <div class="mailhead">
      <div class="bar"><h1>受信トレイ</h1>
        <button class="avbtn ${avatarClass(a.address)}" type="button" id="avatar" aria-label="アカウントを開く">${esc(a.initial)}</button></div>
      <div class="search">${ICON.search}メールを検索</div>
    </div>
    <div class="mails">${items}</div>
    <button class="fab" type="button" data-soon>${ICON.plus}作成</button>
    <div class="tabs">${tab('受信', ICON.inbox, true)}${tab('スター', ICON.star)}${tab('送信済み', ICON.sent)}${tab('下書き', ICON.draft)}</div>
  </div>${panel()}`;

  app.querySelectorAll('[data-soon]').forEach((b) => b.addEventListener('click', () => toast('この機能は準備中です。')));
  app.querySelector('#avatar').addEventListener('click', () => {
    panelOpen = true;
    renderList();
    app.querySelector('#close')?.focus();
  });
  app.querySelectorAll('.m').forEach((b) => b.addEventListener('click', () => openMail(b.dataset.id)));
  if (panelOpen) {
    const close = () => {
      panelOpen = false;
      renderList();
    };
    app.querySelector('#scrim').addEventListener('click', close);
    app.querySelector('#close').addEventListener('click', close);
    app.querySelectorAll('.acct').forEach((b) => b.addEventListener('click', async () => {
      const id = Number(b.dataset.id);
      if (id !== me.active) {
        await api('/switch', { id });
        await load();
      }
      panelOpen = false;
      renderList();
    }));
  }
}

async function openMail(id) {
  try {
    const m = await api(`/mails/${id}`);
    app.innerHTML = `<div class="detail">
      <button class="back linkbtn" type="button" id="back">${ICON.back}受信トレイ</button>
      <h1>${esc(m.subject)}</h1>
      <div class="meta"><span class="${avatarClass(m.from)}">${esc(initialOf(m.from))}</span>
        <div><b>${esc(m.from)}</b><span>${esc(m.fromAddress)} ・ ${esc(formatFull(m.receivedAt))}</span></div></div>
      <pre>${esc(m.body)}</pre>
    </div>`;
    window.scrollTo(0, 0);
    app.querySelector('#back').addEventListener('click', async () => {
      await load();
      renderList();
    });
  } catch (ex) {
    toast(ex.message);
  }
}

try {
  if (await load()) renderList();
} catch (ex) {
  app.innerHTML = `<div class="screen"><p class="error">${esc(ex.message)}</p></div>`;
}
