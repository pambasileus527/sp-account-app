from __future__ import annotations

import hmac
import logging
import secrets
import sqlite3
import threading
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import Request, Response

from .config import Settings
from .errors import ApiError
from .mailer import send_mail
from .provision import Provisioner
from .security import code_hash, new_code, new_ticket, sign_token, verify_token

log = logging.getLogger("muscat")

DAY_MS = 24 * 60 * 60 * 1000
CODE_TTL_MS = 10 * 60 * 1000
MAX_ATTEMPTS = 5
MAX_SENDS = 5


def now_ms() -> int:
    return int(time.time() * 1000)


def mask(email: str) -> str:
    local, domain = email.split("@", 1)
    return f"{local[0]}***@{domain}"


@dataclass
class Ctx:
    """サーバー全体で共有する設定と状態。"""

    settings: Settings
    secret: str
    provisioner: Provisioner
    admins: set[str] = field(default_factory=set)
    hits: dict[str, list[float]] = field(default_factory=dict)
    lock: threading.Lock = field(default_factory=threading.Lock)

    @property
    def domain(self) -> str:
        return self.settings.domain

    # ---- 回数制限（IPごと・メモリ上） ----
    def limit(self, request: Request, key: str, max_: int, window: float = 60.0) -> None:
        now = time.monotonic()
        host = request.client.host if request.client else "?"
        k = f"{key}:{host}"
        with self.lock:
            lst = [t for t in self.hits.get(k, []) if now - t < window]
            lst.append(now)
            self.hits[k] = lst
            if len(self.hits) > 5000:
                for kk in [kk for kk, v in self.hits.items() if now - v[-1] > window]:
                    del self.hits[kk]
            too_many = len(lst) > max_ * self.settings.rate_limit_scale
        if too_many:
            raise ApiError(429, "しばらくしてからもう一度お試しください。")

    # ---- Cookie（署名つき） ----
    def read_signed(self, request: Request, name: str) -> dict | None:
        v = verify_token(self.secret, request.cookies.get(name))
        if not v:
            return None
        exp = v.get("exp")
        if exp and exp < now_ms():
            return None
        return v

    def _set_cookie(self, response: Response, name: str, token: str, days: int) -> None:
        response.set_cookie(
            name, token, max_age=days * 86400, path="/", httponly=True, samesite="lax",
            secure=self.settings.cookie_secure,
        )

    def get_session(self, db: sqlite3.Connection, request: Request) -> dict[str, Any]:
        v = self.read_signed(request, "sp_s") or {}
        raw = v.get("ids") if isinstance(v.get("ids"), list) else []
        ids = [
            n for n in raw
            if isinstance(n, int) and not isinstance(n, bool)
            and db.execute("SELECT 1 FROM users WHERE id = ?", (n,)).fetchone()
        ]
        active = v.get("active")
        if active not in ids:
            active = ids[0] if ids else None
        return {"ids": ids, "active": active}

    def set_session(self, response: Response, s: dict[str, Any]) -> None:
        token = sign_token(self.secret, {"ids": s["ids"], "active": s["active"], "exp": now_ms() + 30 * DAY_MS})
        self._set_cookie(response, "sp_s", token, 30)

    def get_trusted(self, request: Request) -> list[int]:
        v = self.read_signed(request, "sp_d")
        ids = v.get("ids") if v else None
        return [n for n in ids if isinstance(n, int) and not isinstance(n, bool)] if isinstance(ids, list) else []

    def set_trusted(self, response: Response, ids: list[int]) -> None:
        self._set_cookie(response, "sp_d", sign_token(self.secret, {"ids": ids, "exp": now_ms() + 365 * DAY_MS}), 365)

    # ---- アカウント ----
    @staticmethod
    def view(u: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": u["id"],
            "name": f"{u['sei']} {u['mei']}",
            "initial": u["sei"][0],
            "address": u["address"],
            "contact": mask(u["contact_email"]) if u["contact_email"] else None,
        }

    @staticmethod
    def user_by_id(db: sqlite3.Connection, uid: Any) -> sqlite3.Row | None:
        return db.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()

    def user_by_address(self, db: sqlite3.Connection, address: str) -> sqlite3.Row | None:
        return db.execute("SELECT * FROM users WHERE address = ?", (address,)).fetchone()

    def to_local(self, value: Any) -> str | None:
        s = ("" if value is None else str(value)).strip().lower()[:80]
        if "@" not in s:
            return s
        parts = s.split("@")
        return parts[0] if len(parts) == 2 and parts[1] == self.domain else None

    def find_user(self, db: sqlite3.Connection, value: Any) -> sqlite3.Row | None:
        local = self.to_local(value)
        return self.user_by_address(db, f"{local}@{self.domain}") if local else None

    def active_user(self, db: sqlite3.Connection, request: Request) -> sqlite3.Row:
        active = self.get_session(db, request)["active"]
        if active is None:
            raise ApiError(401, "サインインしてください。")
        return self.user_by_id(db, active)

    def require_admin(self, db: sqlite3.Connection, request: Request) -> sqlite3.Row:
        if not self.admins:
            raise ApiError(404, "ページが見つかりません。")
        self.limit(request, "admin", 60)
        me = self.active_user(db, request)
        if me["address"] not in self.admins:
            raise ApiError(403, "このアカウントには管理の権限がありません。")
        return me

    def complete_signin(self, db: sqlite3.Connection, request: Request, response: Response, user_id: int) -> dict:
        s = self.get_session(db, request)
        if user_id not in s["ids"]:
            s["ids"].append(user_id)
        s["active"] = user_id
        self.set_session(response, s)
        trusted = self.get_trusted(request)
        if user_id not in trusted:
            trusted.append(user_id)
        self.set_trusted(response, trusted)
        return {"ok": True}

    # ---- 確認コード ----
    def deliver_code(self, contact: str, code: str) -> None:
        try:
            send_mail(
                self.settings, to=contact, subject=f"確認コード {code}",
                text=f"Muscat Account の確認コードは {code} です。\n10分以内に入力してください。\n\n心当たりがない場合は、このメールを無視してください。",
            )
        except Exception as err:  # noqa: BLE001
            log.error("確認コードの送信に失敗: %s", err)
            raise ApiError(502, "確認コードを送れませんでした。しばらくしてからもう一度お試しください。") from err

    def issue_code(self, db: sqlite3.Connection, user_id: int, purpose: str, contact: str) -> str:
        ticket, code = new_ticket(), new_code()
        db.execute(
            "INSERT INTO codes (ticket, user_id, purpose, code_hash, expires_at) VALUES (?, ?, ?, ?, ?)",
            (ticket, user_id, purpose, code_hash(self.secret, ticket, code), now_ms() + CODE_TTL_MS),
        )
        self.deliver_code(contact, code)
        return ticket

    def fake_ticket(self, db: sqlite3.Connection, purpose: str) -> str:
        """存在しないアドレスでも同じ見た目で返すためのダミー（コードは誰にも届かない）。"""
        ticket = new_ticket()
        db.execute(
            "INSERT INTO codes (ticket, user_id, purpose, code_hash, expires_at) VALUES (?, NULL, ?, ?, ?)",
            (ticket, purpose, secrets.token_hex(16), now_ms() + CODE_TTL_MS),
        )
        return ticket

    def code_matches(self, row: sqlite3.Row, given: str) -> bool:
        return hmac.compare_digest(code_hash(self.secret, row["ticket"], given), row["code_hash"])
