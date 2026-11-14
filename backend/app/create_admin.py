"""管理者アカウントを作る（すでにあればパスワードを設定し直す）。顧客画面からは作らない。

使い方: docker compose exec api python -m app.create_admin nanashi
"""
from __future__ import annotations

import getpass
import sqlite3
import sys

from .config import Settings
from .core import now_ms
from .db import connect, init_db
from .security import hash_password
from .validate import LOCAL_RE


def upsert_admin(db: sqlite3.Connection, domain: str, local: str, password: str) -> bool:
    """作ったら True、パスワードの設定し直しなら False。"""
    address = f"{local}@{domain}"
    row = db.execute("SELECT id FROM users WHERE address = ?", (address,)).fetchone()
    if row:
        db.execute("UPDATE users SET pw_hash = ? WHERE id = ?", (hash_password(password), row["id"]))
        return False
    db.execute(
        "INSERT INTO users (sei, mei, birth, address, pw_hash, contact_email, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)",
        ("管理", "者", "2000-01-01", address, hash_password(password), now_ms()),
    )
    return True


def main() -> int:
    settings = Settings.from_env()
    local = (sys.argv[1] if len(sys.argv) > 1 else "").strip().lower().split("@")[0]
    if not LOCAL_RE.fullmatch(local) or ".." in local:
        print("使い方: python -m app.create_admin <アドレスの@より前>   例: nanashi", file=sys.stderr)
        return 1
    pw = getpass.getpass("パスワード（12文字以上。入力しても何も表示されません）: ")
    if len(pw) < 12:
        print("12文字以上にしてください。", file=sys.stderr)
        return 1
    if pw != getpass.getpass("もう一度: "):
        print("一致しません。", file=sys.stderr)
        return 1
    init_db(settings.db_file)
    db = connect(settings.db_file)
    address = f"{local}@{settings.domain}"
    print(f"{address} を作りました。" if upsert_admin(db, settings.domain, local, pw) else f"{address} のパスワードを設定し直しました。")
    admins = [a.strip().lower() for a in settings.admin_addresses]
    if local not in admins and address not in admins:
        print(f"注意: .env の ADMIN_ADDRESSES に {local} を入れないと、管理画面には入れません。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
