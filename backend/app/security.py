from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets

# Node版と同じ形式（scrypt$salt$hash, N=16384 r=8 p=1）。以前のアカウントもそのまま使える。
_N, _R, _P, _LEN = 16384, 8, 1, 64
_MAXMEM = 64 * 1024 * 1024


def _scrypt(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_N, r=_R, p=_P, maxmem=_MAXMEM, dklen=_LEN)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    return f"scrypt${salt.hex()}${_scrypt(password, salt).hex()}"


# 存在しないアカウントでも同じ時間がかかるように、ダミーのハッシュと比べる
_DUMMY = hash_password("dummy-password-for-timing")


def verify_password(password: str, stored: str | None) -> bool:
    alg, salt_hex, hash_hex = (stored or _DUMMY).split("$")
    if alg != "scrypt":
        return False
    actual = _scrypt(password, bytes.fromhex(salt_hex))
    ok = hmac.compare_digest(actual, bytes.fromhex(hash_hex))
    return bool(stored) and ok


def _b64u(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64u(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _mac(secret: str, payload: str) -> bytes:
    return hmac.new(secret.encode("utf-8"), payload.encode("ascii"), hashlib.sha256).digest()


def sign_token(secret: str, obj: dict) -> str:
    payload = _b64u(json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    return f"{payload}.{_b64u(_mac(secret, payload))}"


def verify_token(secret: str, token: str | None) -> dict | None:
    if not isinstance(token, str):
        return None
    i = token.rfind(".")
    if i < 1:
        return None
    payload = token[:i]
    try:
        given = _unb64u(token[i + 1 :])
        if not payload.isascii() or not hmac.compare_digest(given, _mac(secret, payload)):
            return None
        data = json.loads(_unb64u(payload).decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None
    return data if isinstance(data, dict) else None


def new_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def new_ticket() -> str:
    return secrets.token_urlsafe(18)


def code_hash(secret: str, ticket: str, code: str) -> str:
    return hmac.new(secret.encode("utf-8"), f"{ticket}:{code}".encode("utf-8"), hashlib.sha256).hexdigest()
