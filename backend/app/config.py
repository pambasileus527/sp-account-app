from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass
class Settings:
    db_file: str = "./data/app.db"
    secret: str = ""
    domain: str = "muscat.example"
    cookie_secure: bool = False
    rate_limit_scale: int = 1
    admin_addresses: list[str] = field(default_factory=list)
    smtp_host: str = ""
    smtp_port: int = 25
    mail_from: str = "no-reply@muscat.example"
    static_dir: str = ""  # 本番で、ビルドした画面（frontend/dist）をここから配る
    debug: bool = False

    @classmethod
    def from_env(cls) -> "Settings":
        e = os.environ
        return cls(
            db_file=e.get("DB_FILE", "./data/app.db"),
            secret=e.get("SESSION_SECRET", ""),
            domain=e.get("MAIL_DOMAIN", "muscat.example"),
            cookie_secure=e.get("COOKIE_SECURE") == "1",
            admin_addresses=[a for a in e.get("ADMIN_ADDRESSES", "").split(",")],
            smtp_host=e.get("SMTP_HOST", ""),
            smtp_port=int(e.get("SMTP_PORT", "25")),
            mail_from=e.get("MAIL_FROM", "no-reply@muscat.example"),
            static_dir=e.get("STATIC_DIR", ""),
            debug=e.get("DEBUG") == "1",
        )
