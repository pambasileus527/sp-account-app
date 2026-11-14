import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { hashPassword, verifyPassword, signToken, verifyToken, newCode, newTicket, codeHash } from './auth.js';
import { sendMail } from './smtp.js';
import { localProvisioner } from './provision.js';
import { HttpError, sendJson, readJson, parseCookies, serveStatic, applySecurityHeaders } from './http.js';

const WEB_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web');
const DAY = 24 * 60 * 60 * 1000;
const CODE_TTL = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 5;
const MIN_AGE = 13;

const LOCAL_RE = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/;
const EMAIL_RE = /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[^\s@<>"',;:]+$/;
const RESERVED = new Set([
  'admin', 'administrator', 'root', 'postmaster', 'abuse', 'support', 'noreply', 'no-reply',
  'webmaster', 'hostmaster', 'security', 'info', 'mail', 'mailer-daemon', 'muscat', 'staff', 'team',
]);

const mask = (email) => {
  const [local, domain] = email.split('@');
  return `${Array.from(local)[0]}***@${domain}`;
};

export function createApp(opts = {}) {
  const { dbFile = ':memory:', domain = 'muscat.example', provisioner = localProvisioner, cookieSecure = false, rateLimitScale = 1 } = opts;
  let { secret } = opts;
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    console.warn('SESSION_SECRET が未設定です。再起動するとサインインが外れます。');
  }
  const db = openDb(dbFile);
  const hits = new Map();
  const cookieAttrs = `Path=/; HttpOnly; SameSite=Lax${cookieSecure ? '; Secure' : ''}`;

  // ---- 回数制限（IPごと・メモリ上） ----
  function tooMany(req, key, max, windowMs) {
    const now = Date.now();
    const k = `${key}:${req.socket.remoteAddress || '?'}`;
    const list = (hits.get(k) || []).filter((t) => now - t < windowMs);
    list.push(now);
    hits.set(k, list);
    if (hits.size > 5000) {
      for (const [kk, v] of hits) if (now - v[v.length - 1] > windowMs) hits.delete(kk);
    }
    return list.length > max * rateLimitScale;
  }
  const limit = (req, key, max, windowMs = 60_000) => {
    if (tooMany(req, key, max, windowMs)) throw new HttpError(429, 'しばらくしてからもう一度お試しください。');
  };

  // ---- Cookie（署名つき） ----
  function readSigned(req, name) {
    const v = verifyToken(secret, parseCookies(req)[name]);
    if (!v || (v.exp && v.exp < Date.now())) return null;
    return v;
  }
  const userExists = db.prepare('SELECT 1 FROM users WHERE id = ?');
  function getSession(req) {
    const v = readSigned(req, 'sp_s') || {};
    const ids = (Array.isArray(v.ids) ? v.ids : []).filter((n) => Number.isInteger(n) && userExists.get(n));
    const active = ids.includes(v.active) ? v.active : (ids[0] ?? null);
    return { ids, active };
  }
  function setSession(res, s) {
    const token = signToken(secret, { ids: s.ids, active: s.active, exp: Date.now() + 30 * DAY });
    res.appendHeader('Set-Cookie', `sp_s=${token}; ${cookieAttrs}; Max-Age=${30 * 86400}`);
  }
  function getTrusted(req) {
    const v = readSigned(req, 'sp_d');
    return Array.isArray(v?.ids) ? v.ids.filter(Number.isInteger) : [];
  }
  function setTrusted(res, ids) {
    const token = signToken(secret, { ids, exp: Date.now() + 365 * DAY });
    res.appendHeader('Set-Cookie', `sp_d=${token}; ${cookieAttrs}; Max-Age=${365 * 86400}`);
  }

  // ---- アカウント ----
  const view = (u) => ({
    id: u.id,
    name: `${u.sei} ${u.mei}`,
    initial: Array.from(u.sei)[0],
    address: u.address,
    contact: u.contact_email ? mask(u.contact_email) : null,
  });
  const getUserById = db.prepare('SELECT * FROM users WHERE id = ?');
  const getUserByAddress = db.prepare('SELECT * FROM users WHERE address = ?');
  const unreadCount = db.prepare('SELECT COUNT(*) AS n FROM mails WHERE user_id = ? AND unread = 1');

  function toLocal(input) {
    const s = String(input ?? '').trim().toLowerCase().slice(0, 80);
    if (!s.includes('@')) return s;
    const [local, host, ...rest] = s.split('@');
    return rest.length || host !== domain ? null : local;
  }
  function findUser(input) {
    const local = toLocal(input);
    return local ? getUserByAddress.get(`${local}@${domain}`) : undefined;
  }
  function activeUser(req) {
    const { active } = getSession(req);
    if (active == null) throw new HttpError(401, 'サインインしてください。');
    return getUserById.get(active);
  }

  function completeSignin(req, res, user) {
    const s = getSession(req);
    if (!s.ids.includes(user.id)) s.ids.push(user.id);
    s.active = user.id;
    setSession(res, s);
    const trusted = getTrusted(req);
    if (!trusted.includes(user.id)) trusted.push(user.id);
    setTrusted(res, trusted);
    sendJson(res, 200, { ok: true });
  }

  // ---- 入力チェック ----
  function checkLocal(local) {
    if (typeof local !== 'string' || !LOCAL_RE.test(local)) {
      return [400, 'アドレスは3〜30文字で、英小文字・数字・ピリオド・ハイフン・アンダースコアが使えます。先頭と末尾は英数字にしてください。'];
    }
    if (local.includes('..')) return [400, 'ピリオドを2つ続けることはできません。'];
    if (RESERVED.has(local)) return [409, 'このアドレスは使えません。'];
    if (getUserByAddress.get(`${local}@${domain}`)) return [409, 'このアドレスはすでに使われています。'];
    return null;
  }
  function checkPassword(pw) {
    if (typeof pw !== 'string' || pw.length < 12) return 'パスワードは12文字以上にしてください。';
    if (pw.length > 200) return 'パスワードが長すぎます。';
    return null;
  }
  function checkBirth(b) {
    const y = Number(b?.y), m = Number(b?.m), d = Number(b?.d);
    const date = new Date(Date.UTC(y, m - 1, d));
    const valid = Number.isInteger(y) && Number.isInteger(m) && Number.isInteger(d) && y >= 1900
      && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d && date <= new Date();
    if (!valid) return [null, '生年月日を正しく入力してください。'];
    const now = new Date();
    let age = now.getUTCFullYear() - y;
    if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age -= 1;
    if (age < MIN_AGE) return [null, `${MIN_AGE}歳以上の方がご利用いただけます。`];
    return [`${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, null];
  }
  const cleanName = (s) => {
    const v = String(s ?? '').trim();
    return v.length >= 1 && v.length <= 40 && !/[\u0000-\u001f<>]/.test(v) ? v : null;
  };

  // ---- 確認コード ----
  const insertCode = db.prepare(
    'INSERT INTO codes (ticket, user_id, purpose, code_hash, expires_at) VALUES (?, ?, ?, ?, ?)',
  );
  async function deliverCode(contact, code) {
    try {
      await sendMail({
        to: contact,
        subject: `確認コード ${code}`,
        text: `Muscat Account の確認コードは ${code} です。\n10分以内に入力してください。\n\n心当たりがない場合は、このメールを無視してください。`,
      });
    } catch (err) {
      console.error('確認コードの送信に失敗', err.message);
      throw new HttpError(502, '確認コードを送れませんでした。しばらくしてからもう一度お試しください。');
    }
  }
  async function issueCode(userId, purpose, contact) {
    const ticket = newTicket();
    const code = newCode();
    insertCode.run(ticket, userId, purpose, codeHash(secret, ticket, code), Date.now() + CODE_TTL);
    await deliverCode(contact, code);
    return ticket;
  }
  // 存在しないアドレスでも同じ見た目で返すためのダミー（コードは誰にも届かない）
  function fakeTicket(purpose) {
    const ticket = newTicket();
    insertCode.run(ticket, null, purpose, crypto.randomBytes(16).toString('hex'), Date.now() + CODE_TTL);
    return ticket;
  }
  const getCode = db.prepare('SELECT * FROM codes WHERE ticket = ?');

  const welcomeMail = db.prepare(
    'INSERT INTO mails (user_id, from_name, from_addr, subject, body, received_at) VALUES (?, ?, ?, ?, ?, ?)',
  );

  // ---- API ----
  async function api(req, res, pathname) {
    const method = req.method;

    if (method === 'GET' && pathname === '/api/me') {
      const s = getSession(req);
      const accounts = s.ids.map((id) => ({ ...view(getUserById.get(id)), unread: unreadCount.get(id).n }));
      return sendJson(res, 200, { domain, active: s.active, accounts });
    }

    if (method === 'GET' && pathname === '/api/mails') {
      const user = activeUser(req);
      const rows = db.prepare(
        'SELECT id, from_name, from_addr, subject, body, received_at, unread, starred FROM mails WHERE user_id = ? ORDER BY received_at DESC LIMIT 100',
      ).all(user.id);
      return sendJson(res, 200, rows.map((r) => ({
        id: r.id, from: r.from_name, subject: r.subject, receivedAt: r.received_at,
        unread: Boolean(r.unread), starred: Boolean(r.starred),
        preview: r.body.replace(/\s+/g, ' ').slice(0, 120),
      })));
    }

    const mailMatch = pathname.match(/^\/api\/mails\/(\d+)$/);
    if (method === 'GET' && mailMatch) {
      const user = activeUser(req);
      const row = db.prepare('SELECT * FROM mails WHERE id = ? AND user_id = ?').get(Number(mailMatch[1]), user.id);
      if (!row) throw new HttpError(404, 'メールが見つかりません。');
      db.prepare('UPDATE mails SET unread = 0 WHERE id = ?').run(row.id);
      return sendJson(res, 200, {
        id: row.id, from: row.from_name, fromAddress: row.from_addr, subject: row.subject,
        body: row.body, receivedAt: row.received_at,
      });
    }

    if (method !== 'POST') throw new HttpError(404, 'ページが見つかりません。');
    const body = await readJson(req);

    if (pathname === '/api/signup/check') {
      limit(req, 'check', 60);
      const err = checkLocal(String(body.local ?? '').trim().toLowerCase());
      if (err) throw new HttpError(err[0], err[1]);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/signup') {
      limit(req, 'signup', 5, 10 * 60_000);
      const sei = cleanName(body.sei), mei = cleanName(body.mei);
      if (!sei || !mei) throw new HttpError(400, '名前を入力してください。');
      const [birth, birthErr] = checkBirth(body.birth);
      if (birthErr) throw new HttpError(400, birthErr);
      const local = String(body.local ?? '').trim().toLowerCase();
      const localErr = checkLocal(local);
      if (localErr) throw new HttpError(localErr[0], localErr[1]);
      const pwErr = checkPassword(body.password);
      if (pwErr) throw new HttpError(400, pwErr);
      if (body.password === local) throw new HttpError(400, 'アドレスと同じパスワードは使えません。');
      let contact = String(body.contact ?? '').trim().toLowerCase();
      if (contact && (contact.length > 254 || !EMAIL_RE.test(contact))) {
        throw new HttpError(400, '連絡先のメールアドレスを正しく入力してください。');
      }
      contact = contact || null;
      const address = `${local}@${domain}`;
      if (!(await provisioner.isAvailable(address))) throw new HttpError(409, 'このアドレスは使えません。');

      let id;
      try {
        const info = db.prepare(
          'INSERT INTO users (sei, mei, birth, address, pw_hash, contact_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(sei, mei, birth, address, hashPassword(body.password), contact, Date.now());
        id = Number(info.lastInsertRowid);
      } catch {
        throw new HttpError(409, 'このアドレスはすでに使われています。');
      }
      try {
        await provisioner.create({ address, password: body.password, name: `${sei} ${mei}` });
      } catch (err) {
        db.prepare('DELETE FROM users WHERE id = ?').run(id);
        console.error('メールボックスの作成に失敗', err);
        throw new HttpError(502, 'アドレスを作れませんでした。しばらくしてからもう一度お試しください。');
      }
      welcomeMail.run(
        id, 'Muscat チーム', `team@${domain}`, 'ようこそ、Muscat Account へ',
        'アドレスの作成が完了しました。\n\n連絡先のメールを登録しておくと、パスワードを忘れたときや、新しい端末でサインインするときに確認コードを受け取れます。\n\nどうぞよろしくお願いします。',
        Date.now(),
      );
      return completeSignin(req, res, getUserById.get(id));
    }

    if (pathname === '/api/signin') {
      limit(req, 'signin', 10);
      const user = findUser(body.address);
      const ok = verifyPassword(String(body.password ?? '').slice(0, 200), user?.pw_hash);
      if (!user || !ok) throw new HttpError(401, 'アドレスまたはパスワードが違います。');
      // 連絡先がなければ確認コードは送れないので、パスワードだけで入る
      if (getTrusted(req).includes(user.id) || !user.contact_email) return completeSignin(req, res, user);
      const ticket = await issueCode(user.id, 'signin', user.contact_email);
      return sendJson(res, 200, { needCode: true, ticket, hint: mask(user.contact_email) });
    }

    if (pathname === '/api/verify') {
      limit(req, 'verify', 20);
      const row = getCode.get(String(body.ticket ?? ''));
      const bad = new HttpError(400, 'コードが正しくないか、期限が切れています。');
      if (!row || row.used || row.expires_at < Date.now() || !['signin', 'reset'].includes(row.purpose)) throw bad;
      if (row.attempts >= MAX_ATTEMPTS) throw new HttpError(429, '入力の回数が上限に達しました。コードをもう一度送ってください。');
      db.prepare('UPDATE codes SET attempts = attempts + 1 WHERE ticket = ?').run(row.ticket);
      const given = Buffer.from(codeHash(secret, row.ticket, String(body.code ?? '').trim()), 'hex');
      const real = Buffer.from(row.code_hash, 'hex');
      if (given.length !== real.length || !crypto.timingSafeEqual(given, real) || !row.user_id) throw bad;
      db.prepare('UPDATE codes SET used = 1 WHERE ticket = ?').run(row.ticket);
      if (row.purpose === 'signin') return completeSignin(req, res, getUserById.get(row.user_id));
      const resetToken = newTicket();
      insertCode.run(resetToken, row.user_id, 'reset-ok', 'x', Date.now() + CODE_TTL);
      return sendJson(res, 200, { resetToken });
    }

    if (pathname === '/api/resend') {
      limit(req, 'resend', 10);
      const row = getCode.get(String(body.ticket ?? ''));
      if (!row || row.used || !['signin', 'reset'].includes(row.purpose)) throw new HttpError(400, 'もう一度最初からお試しください。');
      if (row.sends >= MAX_SENDS) throw new HttpError(429, '再送の回数が上限に達しました。しばらくしてからお試しください。');
      const user = row.user_id ? getUserById.get(row.user_id) : null;
      const code = newCode();
      db.prepare('UPDATE codes SET code_hash = ?, expires_at = ?, attempts = 0, sends = sends + 1 WHERE ticket = ?')
        .run(row.user_id ? codeHash(secret, row.ticket, code) : row.code_hash, Date.now() + CODE_TTL, row.ticket);
      if (user?.contact_email) await deliverCode(user.contact_email, code);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/reset/request') {
      limit(req, 'reset', 5, 10 * 60_000);
      const user = findUser(body.address);
      const ticket = user?.contact_email ? await issueCode(user.id, 'reset', user.contact_email) : fakeTicket('reset');
      return sendJson(res, 200, { ok: true, ticket });
    }

    if (pathname === '/api/reset/complete') {
      limit(req, 'reset-complete', 10, 10 * 60_000);
      const row = getCode.get(String(body.resetToken ?? ''));
      if (!row || row.used || row.purpose !== 'reset-ok' || row.expires_at < Date.now() || !row.user_id) {
        throw new HttpError(400, '期限が切れました。もう一度最初からお試しください。');
      }
      const pwErr = checkPassword(body.password);
      if (pwErr) throw new HttpError(400, pwErr);
      db.prepare('UPDATE users SET pw_hash = ? WHERE id = ?').run(hashPassword(body.password), row.user_id);
      db.prepare('UPDATE codes SET used = 1 WHERE ticket = ?').run(row.ticket);
      return completeSignin(req, res, getUserById.get(row.user_id));
    }

    if (pathname === '/api/switch') {
      const s = getSession(req);
      if (!s.ids.includes(body.id)) throw new HttpError(400, 'そのアカウントはこの端末にありません。');
      s.active = body.id;
      setSession(res, s);
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/signout') {
      const s = getSession(req);
      const target = s.ids.includes(body.id) ? body.id : s.active;
      s.ids = s.ids.filter((id) => id !== target);
      s.active = s.ids[0] ?? null;
      setSession(res, s);
      return sendJson(res, 200, { ok: true });
    }

    throw new HttpError(404, 'ページが見つかりません。');
  }

  const server = http.createServer(async (req, res) => {
    try {
      applySecurityHeaders(res);
      const { pathname } = new URL(req.url, 'http://localhost');
      if (pathname.startsWith('/api/')) return await api(req, res, pathname);
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, '使えない操作です。');
      if (pathname === '/settings' || pathname === '/mail') {
        res.writeHead(301, { Location: `${pathname}/` });
        return res.end();
      }
      if (await serveStatic(WEB_ROOT, pathname, res)) return;
      throw new HttpError(404, 'ページが見つかりません。');
    } catch (err) {
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
      console.error(err);
      if (!res.headersSent) return sendJson(res, 500, { error: 'サーバーでエラーが起きました。' });
      res.end();
    }
  });
  server.on('close', () => db.close());
  return server;
}
