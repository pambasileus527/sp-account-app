import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { outbox } from '../server/smtp.js';

let server;
let base;

before(async () => {
  delete process.env.SMTP_HOST;
  server = createApp({ dbFile: ':memory:', secret: 'test-secret', domain: 'muscat.example', rateLimitScale: 1000 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

// 端末（ブラウザ）ごとにCookieを持つ、簡単な入れ物
function device() {
  const jar = new Map();
  return async function call(path, body) {
    const headers = { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
    const init = { headers };
    if (body !== undefined) {
      init.method = 'POST';
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(base + path, init);
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(';');
      const i = kv.indexOf('=');
      jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
    return { status: res.status, data: await res.json().catch(() => null) };
  };
}

const person = (over = {}) => ({
  sei: '山田', mei: '太郎', birth: { y: 1990, m: 5, d: 20 },
  local: 'tokumei', password: 'correct-horse-battery', contact: 'taro@example.com', ...over,
});

test('アドレス作成: 作ると、そのままサインイン済みになり、ようこそメールが届く', async () => {
  const d = device();
  const r = await d('/api/signup', person());
  assert.equal(r.status, 200);
  const me = (await d('/api/me')).data;
  assert.equal(me.active, me.accounts[0].id);
  assert.equal(me.accounts[0].address, 'tokumei@muscat.example');
  assert.equal(me.accounts[0].unread, 1);
  const mails = (await d('/api/mails')).data;
  assert.equal(mails.length, 1);
  assert.match(mails[0].subject, /ようこそ/);
  const detail = (await d(`/api/mails/${mails[0].id}`)).data;
  assert.ok(detail.body.length > 10);
  assert.equal((await d('/api/me')).data.accounts[0].unread, 0);
});

test('アドレス作成: 同じアドレス、予約語、形式の誤り、短いパスワード、若すぎる年齢を断る', async () => {
  const d = device();
  assert.equal((await d('/api/signup', person())).status, 409);
  assert.equal((await d('/api/signup', person({ local: 'admin' }))).status, 409);
  assert.equal((await d('/api/signup', person({ local: 'a..b' }))).status, 400);
  assert.equal((await d('/api/signup', person({ local: 'Ab' }))).status, 400);
  assert.equal((await d('/api/signup', person({ local: 'okname1', password: 'short' }))).status, 400);
  const young = new Date().getUTCFullYear() - 5;
  assert.equal((await d('/api/signup', person({ local: 'okname2', birth: { y: young, m: 1, d: 1 } }))).status, 400);
  assert.equal((await d('/api/signup', person({ local: 'okname3', birth: { y: 1990, m: 2, d: 31 } }))).status, 400);
  assert.equal((await d('/api/signup', person({ local: 'okname4', contact: 'not-an-email' }))).status, 400);
  assert.equal((await d('/api/signup/check', { local: 'tokumei' })).status, 409);
  assert.equal((await d('/api/signup/check', { local: 'free-name' })).status, 200);
});

test('サインイン: 新しい端末では確認コードが要り、正しいコードで入れる', async () => {
  const fresh = device();
  assert.equal((await fresh('/api/signin', { address: 'tokumei', password: 'wrong-password-1' })).status, 401);
  const r = await fresh('/api/signin', { address: 'tokumei@muscat.example', password: 'correct-horse-battery' });
  assert.equal(r.data.needCode, true);
  assert.match(r.data.hint, /^t\*\*\*@example\.com$/);
  const mail = outbox.at(-1);
  assert.equal(mail.to, 'taro@example.com');
  const code = mail.text.match(/\d{6}/)[0];
  assert.equal((await fresh('/api/verify', { ticket: r.data.ticket, code: code === '000000' ? '000001' : '000000' })).status, 400);
  assert.equal((await fresh('/api/verify', { ticket: r.data.ticket, code })).status, 200);
  assert.equal((await fresh('/api/me')).data.accounts.length, 1);
  // 使ったコードは二度と使えない
  assert.equal((await fresh('/api/verify', { ticket: r.data.ticket, code })).status, 400);
  // この端末は信頼済みになったので、次はコードなし
  const again = await fresh('/api/signin', { address: 'tokumei', password: 'correct-horse-battery' });
  assert.equal(again.data.ok, true);
});

test('確認コード: 5回まちがえると止まる', async () => {
  const fresh = device();
  const r = await fresh('/api/signin', { address: 'tokumei', password: 'correct-horse-battery' });
  const real = outbox.at(-1).text.match(/\d{6}/)[0];
  const wrong = real === '123456' ? '654321' : '123456';
  for (let i = 0; i < 5; i += 1) assert.equal((await fresh('/api/verify', { ticket: r.data.ticket, code: wrong })).status, 400);
  assert.equal((await fresh('/api/verify', { ticket: r.data.ticket, code: real })).status, 429);
});

test('パスワード再設定: コード確認のあと新しいパスワードで入れる。存在しないアドレスも同じ応答', async () => {
  const d = device();
  const unknown = await d('/api/reset/request', { address: 'nobody-here' });
  assert.equal(unknown.status, 200);
  assert.ok(unknown.data.ticket);
  assert.equal((await d('/api/verify', { ticket: unknown.data.ticket, code: '000000' })).status, 400);

  const before = outbox.length;
  const req = await d('/api/reset/request', { address: 'tokumei' });
  assert.equal(outbox.length, before + 1);
  const code = outbox.at(-1).text.match(/\d{6}/)[0];
  const ok = await d('/api/verify', { ticket: req.data.ticket, code });
  assert.ok(ok.data.resetToken);
  assert.equal((await d('/api/reset/complete', { resetToken: ok.data.resetToken, password: 'short' })).status, 400);
  assert.equal((await d('/api/reset/complete', { resetToken: ok.data.resetToken, password: 'brand-new-password-1' })).status, 200);
  assert.equal((await d('/api/reset/complete', { resetToken: ok.data.resetToken, password: 'brand-new-password-2' })).status, 400);
  const fresh = device();
  assert.equal((await fresh('/api/signin', { address: 'tokumei', password: 'correct-horse-battery' })).status, 401);
  assert.ok((await fresh('/api/signin', { address: 'tokumei', password: 'brand-new-password-1' })).data.needCode);
});

test('複数アカウント: 追加、切り替え、サインアウト。メールは本人のものだけ見える', async () => {
  const d = device();
  await d('/api/signup', person({ local: 'nanashi', contact: '' }));
  await d('/api/signup', person({ local: 'tokumei2', contact: '' }));
  let me = (await d('/api/me')).data;
  assert.equal(me.accounts.length, 2);
  const [a, b] = me.accounts;
  assert.equal(me.active, b.id);
  await d('/api/switch', { id: a.id });
  assert.equal((await d('/api/me')).data.active, a.id);
  const mailB = (await d('/api/mails')).data;
  await d('/api/switch', { id: b.id });
  const other = (await d('/api/mails')).data;
  assert.notEqual(mailB[0].id, other[0].id);
  assert.equal((await d(`/api/mails/${mailB[0].id}`)).status, 404);
  assert.equal((await d('/api/switch', { id: 99999 })).status, 400);
  await d('/api/signout', {});
  me = (await d('/api/me')).data;
  assert.equal(me.accounts.length, 1);
  assert.equal(me.active, a.id);
  await d('/api/signout', {});
  assert.equal((await d('/api/me')).data.active, null);
  assert.equal((await d('/api/mails')).status, 401);
});

test('Cookieを改ざんしても、他人としては入れない', async () => {
  const d = device();
  await d('/api/signup', person({ local: 'someone', contact: '' }));
  const res = await fetch(`${base}/api/me`, { headers: { Cookie: 'sp_s=eyJpZHMiOlsxXSwiYWN0aXZlIjoxfQ.forged' } });
  assert.equal((await res.json()).active, null);
});

test('静的ファイル: ホーム画面は返り、パスの抜け道は閉じている', async () => {
  const home = await fetch(`${base}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal((await fetch(`${base}/../package.json`)).status, 404);
  assert.equal((await fetch(`${base}/%2e%2e/package.json`)).status, 404);
  assert.equal((await fetch(`${base}/settings/`)).status, 200);
  assert.equal((await fetch(`${base}/mail/`)).status, 200);
});

test('回数制限: 続けてサインインに失敗すると止まる', async () => {
  const strict = createApp({ dbFile: ':memory:', secret: 'test-secret', domain: 'muscat.example' });
  await new Promise((r) => strict.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${strict.address().port}/api/signin`;
  const statuses = [];
  for (let i = 0; i < 12; i += 1) {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: 'nobody', password: 'whatever-password' }),
    });
    statuses.push(res.status);
  }
  strict.close();
  assert.equal(statuses[0], 401);
  assert.equal(statuses.at(-1), 429);
});
