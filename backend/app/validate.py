from __future__ import annotations

import datetime as dt
import re
from typing import Any, Callable

MIN_AGE = 13
LOCAL_RE = re.compile(r"[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]")
EMAIL_RE = re.compile(r"[^\s@<>\"',;:]+@[^\s@<>\"',;:]+\.[^\s@<>\"',;:]+")
RESERVED = {
    "admin", "administrator", "root", "postmaster", "abuse", "support", "noreply", "no-reply",
    "webmaster", "hostmaster", "security", "info", "mail", "mailer-daemon", "muscat", "staff", "team",
}


def text(value: Any) -> str:
    """JavaScript の String(v ?? '') と同じ。"""
    return "" if value is None else str(value)


def check_local(local: str, exists: Callable[[str], bool]) -> tuple[int, str] | None:
    if not LOCAL_RE.fullmatch(local):
        return 400, "アドレスは3〜30文字で、英小文字・数字・ピリオド・ハイフン・アンダースコアが使えます。先頭と末尾は英数字にしてください。"
    if ".." in local:
        return 400, "ピリオドを2つ続けることはできません。"
    if local in RESERVED:
        return 409, "このアドレスは使えません。"
    if exists(local):
        return 409, "このアドレスはすでに使われています。"
    return None


def check_password(pw: Any) -> str | None:
    if not isinstance(pw, str) or len(pw) < 12:
        return "パスワードは12文字以上にしてください。"
    if len(pw) > 200:
        return "パスワードが長すぎます。"
    return None


def _int(v: Any) -> int | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, float) and v.is_integer():
        return int(v)
    if isinstance(v, str) and re.fullmatch(r"\s*\d+\s*", v):
        return int(v)
    return None


def check_birth(b: Any) -> tuple[str | None, str | None]:
    bad = (None, "生年月日を正しく入力してください。")
    if not isinstance(b, dict):
        return bad
    y, m, d = _int(b.get("y")), _int(b.get("m")), _int(b.get("d"))
    if y is None or m is None or d is None or y < 1900:
        return bad
    try:
        date = dt.date(y, m, d)
    except ValueError:
        return bad
    today = dt.datetime.now(dt.timezone.utc).date()
    if date > today:
        return bad
    age = today.year - y - ((today.month, today.day) < (m, d))
    if age < MIN_AGE:
        return None, f"{MIN_AGE}歳以上の方がご利用いただけます。"
    return f"{y:04d}-{m:02d}-{d:02d}", None


def clean_name(v: Any) -> str | None:
    s = text(v).strip()
    return s if 1 <= len(s) <= 40 and not re.search(r"[\x00-\x1f<>]", s) else None


def clean_contact(v: Any) -> tuple[str | None, bool]:
    """(メール or None, 正しいか)。空は「未入力」として正しい扱い。"""
    s = text(v).strip().lower()
    if not s:
        return None, True
    if len(s) > 254 or not EMAIL_RE.fullmatch(s):
        return None, False
    return s, True
