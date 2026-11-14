from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from .config import Settings

log = logging.getLogger("muscat.mail")

# SMTP_HOST が未設定のときは、送らずにここへ貯めてログに出す（テストや手元確認用）
outbox: list[dict] = []


def send_mail(settings: Settings, *, to: str, subject: str, text: str) -> None:
    if not settings.smtp_host:
        outbox.append({"to": to, "subject": subject, "text": text})
        log.warning("[mail:dev] to=%s subject=%s\n%s", to, subject, text)
        return
    msg = EmailMessage()
    msg["From"] = f"Muscat Account <{settings.mail_from}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text, charset="utf-8")
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        smtp.send_message(msg)
