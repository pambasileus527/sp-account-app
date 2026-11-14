export async function api(path, body) {
  const init = { credentials: 'same-origin' };
  if (body !== undefined) {
    init.method = 'POST';
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${path}`, init);
  } catch {
    throw new Error('サーバーに繋がりません。しばらくしてからもう一度お試しください。');
  }
  let data = null;
  try {
    data = await res.json();
  } catch { /* 本文なし */ }
  if (!res.ok) {
    const err = new Error(data?.error || 'うまくいきませんでした。もう一度お試しください。');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function toast(message) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.append(el);
  setTimeout(() => el.remove(), 2400);
}

export function avatarClass(address) {
  let h = 0;
  for (const ch of String(address)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return `av av${h % 6}`;
}

const svg = (body, size = 22, color = 'currentColor') =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICON = {
  back: svg('<path d="M15 5l-7 7 7 7"></path>', 20, '#0e7c86'),
  mail: (size, color) => svg('<rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="M4 7.5l8 6 8-6"></path>', size, color),
  search: svg('<circle cx="11" cy="11" r="7"></circle><path d="M20 20l-4-4"></path>', 18, '#4f5b63'),
  person: svg('<circle cx="12" cy="8" r="3"></circle><path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6"></path>', 22, '#0e7c86'),
  shield: svg('<path d="M12 3l8 3v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z"></path><path d="M9 12l2 2 4-4"></path>', 22, '#0e7c86'),
  bell: svg('<path d="M6 8a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7z"></path><path d="M10 19a2 2 0 0 0 4 0"></path>', 22, '#0e7c86'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path>', 22, '#0e7c86'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"></path>', 22, '#1b2428'),
  plus: svg('<path d="M12 5v14M5 12h14"></path>', 20, '#fff'),
  addPerson: svg('<circle cx="10" cy="8" r="3.5"></circle><path d="M3 20c0-3.5 3-6 7-6"></path><path d="M18 14v6M15 17h6"></path>', 22, '#4f5b63'),
  manage: svg('<circle cx="9" cy="8" r="3.5"></circle><path d="M3 20c0-3.5 2.7-6 6-6"></path><circle cx="17" cy="16" r="2.2"></circle>', 22, '#4f5b63'),
  inbox: (c) => svg('<rect x="3" y="5" width="18" height="14" rx="3"></rect><path d="M4 7.5l8 6 8-6"></path>', 24, c),
  star: (c) => svg('<path d="M12 4l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z"></path>', 24, c),
  sent: (c) => svg('<path d="M21 3L10 14"></path><path d="M21 3l-7 18-4-7-7-4z"></path>', 24, c),
  draft: (c) => svg('<path d="M5 19l1-4L16 5l3 3L9 18z"></path>', 24, c),
  tile: (body, color = '#fff') => svg(body, 40, color),
};
