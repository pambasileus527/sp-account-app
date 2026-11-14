import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';

// 本物のSMTPの代わりに、手順どおり返事をするだけの小さなサーバーを立てて、送信処理を確かめる
test('SMTP: 手順どおりに送り、件名と本文が文字化けせず届く', async () => {
  const received = { commands: [], data: '' };
  const fake = net.createServer((sock) => {
    let inData = false;
    let buf = '';
    sock.write('220 fake ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            sock.write('250 queued\r\n');
          } else received.data += `${line}\n`;
          continue;
        }
        received.commands.push(line);
        if (line.startsWith('EHLO')) sock.write('250-fake\r\n250 8BITMIME\r\n');
        else if (line === 'DATA') {
          inData = true;
          sock.write('354 go\r\n');
        } else if (line === 'QUIT') {
          sock.write('221 bye\r\n');
          sock.end();
        } else sock.write('250 ok\r\n');
      }
    });
  });
  await new Promise((r) => fake.listen(0, '127.0.0.1', r));
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = String(fake.address().port);
  try {
    const { sendMail } = await import('../server/smtp.js');
    await sendMail({ to: 'taro@example.com', subject: '確認コード 123456', text: 'コードは 123456 です。\n.先頭にドットがある行\n' });
  } finally {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    fake.close();
  }
  assert.ok(received.commands.includes('RCPT TO:<taro@example.com>'));
  assert.ok(received.commands.includes('QUIT'));
  const subject = received.data.match(/^Subject: =\?UTF-8\?B\?(.+)\?=$/m)[1];
  assert.equal(Buffer.from(subject, 'base64').toString('utf8'), '確認コード 123456');
  const body = received.data.split('\n\n').slice(1).join('\n\n').replace(/\n/g, '');
  const text = Buffer.from(body, 'base64').toString('utf8');
  assert.match(text, /コードは 123456 です/);
  assert.match(text, /\.先頭にドットがある行/);
});
