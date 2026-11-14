from __future__ import annotations

import socketserver
import threading
from email import message_from_bytes, policy

from app.config import Settings
from app.mailer import send_mail


class _Handler(socketserver.StreamRequestHandler):
    def handle(self):
        r = self.server.received
        self.wfile.write(b"220 fake ESMTP\r\n")
        in_data = False
        data = []
        for raw in self.rfile:
            line = raw.rstrip(b"\r\n")
            if in_data:
                if line == b".":
                    in_data = False
                    r["data"] = b"\r\n".join(data)
                    self.wfile.write(b"250 queued\r\n")
                else:
                    data.append(line[1:] if line.startswith(b"..") else line)
                continue
            r["commands"].append(line.decode())
            verb = line.upper()  # smtplib は小文字で送ってくる。SMTPは大文字小文字を区別しない
            if verb.startswith(b"EHLO") or verb.startswith(b"HELO"):
                self.wfile.write(b"250-fake\r\n250 8BITMIME\r\n")
            elif verb == b"DATA":
                in_data = True
                self.wfile.write(b"354 go\r\n")
            elif verb == b"QUIT":
                self.wfile.write(b"221 bye\r\n")
                return
            else:
                self.wfile.write(b"250 ok\r\n")


def test_smtp_sends_without_garbling():
    """本物のSMTPの代わりに、手順どおり返事をするだけの小さなサーバーで、送信処理を確かめる。"""
    with socketserver.ThreadingTCPServer(("127.0.0.1", 0), _Handler) as fake:
        fake.received = {"commands": [], "data": b""}
        threading.Thread(target=fake.serve_forever, daemon=True).start()
        settings = Settings(smtp_host="127.0.0.1", smtp_port=fake.server_address[1])
        send_mail(settings, to="taro@example.com", subject="確認コード 123456", text="コードは 123456 です。\n.先頭にドットがある行\n")
        fake.shutdown()
    cmds = [c.upper() for c in fake.received["commands"]]
    assert "RCPT TO:<TARO@EXAMPLE.COM>" in cmds and "QUIT" in cmds
    msg = message_from_bytes(fake.received["data"], policy=policy.default)
    assert msg["Subject"] == "確認コード 123456"
    body = msg.get_content()
    assert "コードは 123456 です" in body and ".先頭にドットがある行" in body
