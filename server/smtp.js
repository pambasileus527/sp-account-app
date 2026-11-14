import net from 'node:net';

// SMTP_HOST が未設定のときは、送らずにここへ貯めてログに出す（テストや手元確認用）
export const outbox = [];

const FROM = process.env.MAIL_FROM || 'no-reply@muscat.example';

function encodeHeader(text) {
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function buildMessage({ to, subject, text }) {
  const body = Buffer.from(text, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');
  return [
    `From: Muscat Account <${FROM}>`,
    `To: <${to}>`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n');
}

function smtpSend({ host, port, from, to, data }) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      sock.destroy();
      reject(new Error('SMTP timeout'));
    }, 10000);
    const expect = [220, 250, 250, 250, 354, 250, 221];
    let step = 0;
    let buf = '';
    const fail = (err) => {
      clearTimeout(timer);
      sock.destroy();
      reject(err);
    };
    const next = () => {
      if (step === 1) sock.write('EHLO muscat.local\r\n');
      else if (step === 2) sock.write(`MAIL FROM:<${from}>\r\n`);
      else if (step === 3) sock.write(`RCPT TO:<${to}>\r\n`);
      else if (step === 4) sock.write('DATA\r\n');
      else if (step === 5) sock.write(`${data.replace(/^\./gm, '..')}\r\n.\r\n`);
      else if (step === 6) sock.write('QUIT\r\n');
    };
    sock.on('error', fail);
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (/^\d{3}-/.test(line)) continue; // 複数行の途中
        const code = Number(line.slice(0, 3));
        if (code !== expect[step]) return fail(new Error(`SMTP error: ${line}`));
        step += 1;
        if (step >= expect.length) {
          clearTimeout(timer);
          sock.end();
          return resolve();
        }
        next();
      }
    });
  });
}

export async function sendMail({ to, subject, text }) {
  const host = process.env.SMTP_HOST;
  if (!host) {
    outbox.push({ to, subject, text });
    console.log(`[mail:dev] to=${to}\n  ${subject}\n  ${text.replace(/\n/g, '\n  ')}`);
    return;
  }
  await smtpSend({
    host,
    port: Number(process.env.SMTP_PORT || 25),
    from: FROM,
    to,
    data: buildMessage({ to, subject, text }),
  });
}
