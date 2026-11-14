// 管理者アカウントを作る（すでにあればパスワードを設定し直す）。顧客画面からは作らない。
// 使い方: docker compose exec app node server/create-admin.js nanashi
import readline from 'node:readline';
import { openDb } from './db.js';
import { hashPassword } from './auth.js';

const domain = process.env.MAIL_DOMAIN || 'muscat.example';
const input = (process.argv[2] || '').trim().toLowerCase();
const local = input.split('@')[0];
if (!/^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/.test(local) || local.includes('..')) {
  console.error('使い方: node server/create-admin.js <アドレスの@より前>   例: nanashi');
  process.exit(1);
}
const address = `${local}@${domain}`;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
let muted = false;
const write = rl._writeToOutput.bind(rl);
rl._writeToOutput = (t) => { if (!muted) write(t); }; // 入力した文字は表示しない
const lines = [];
let waiter = null;
rl.on('line', (l) => { if (waiter) { const w = waiter; waiter = null; w(l); } else lines.push(l); });
function ask(question) {
  process.stdout.write(question);
  muted = true;
  return new Promise((resolve) => {
    const done = (l) => { muted = false; process.stdout.write('\n'); resolve(l); };
    if (lines.length) done(lines.shift()); else waiter = done;
  });
}

const pw = await ask('パスワード（12文字以上。入力しても何も表示されません）: ');
if (pw.length < 12) { console.error('12文字以上にしてください。'); process.exit(1); }
if (pw !== await ask('もう一度: ')) { console.error('一致しません。'); process.exit(1); }

rl.close();
const db = openDb(process.env.DB_FILE || './data/app.db');
const row = db.prepare('SELECT id FROM users WHERE address = ?').get(address);
if (row) {
  db.prepare('UPDATE users SET pw_hash = ? WHERE id = ?').run(hashPassword(pw), row.id);
  console.log(`${address} のパスワードを設定し直しました。`);
} else {
  db.prepare('INSERT INTO users (sei, mei, birth, address, pw_hash, contact_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run('管理', '者', '2000-01-01', address, hashPassword(pw), null, Date.now());
  console.log(`${address} を作りました。`);
}
const admins = (process.env.ADMIN_ADDRESSES || '').split(',').map((a) => a.trim());
if (!admins.includes(local) && !admins.includes(address)) {
  console.log(`注意: .env の ADMIN_ADDRESSES に ${local} を入れないと、管理画面には入れません。`);
}
