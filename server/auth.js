import crypto from 'node:crypto';

const b64u = (s) => Buffer.from(s).toString('base64url');

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

// 存在しないアカウントでも同じ時間がかかるように、ダミーのハッシュと比べる
const DUMMY = hashPassword('dummy-password-for-timing');

export function verifyPassword(password, stored) {
  const [alg, saltHex, hashHex] = (stored || DUMMY).split('$');
  if (alg !== 'scrypt') return false;
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  const ok = crypto.timingSafeEqual(actual, Buffer.from(hashHex, 'hex'));
  return Boolean(stored) && ok;
}

export function signToken(secret, obj) {
  const payload = b64u(JSON.stringify(obj));
  const mac = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

export function verifyToken(secret, token) {
  if (typeof token !== 'string') return null;
  const i = token.lastIndexOf('.');
  if (i < 1) return null;
  const payload = token.slice(0, i);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const given = Buffer.from(token.slice(i + 1), 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
}

export const newCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
export const newTicket = () => crypto.randomBytes(18).toString('base64url');
export const codeHash = (secret, ticket, code) =>
  crypto.createHmac('sha256', secret).update(`${ticket}:${code}`).digest('hex');
