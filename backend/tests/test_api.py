from __future__ import annotations

import datetime as dt
import re

from fastapi.testclient import TestClient

from app import mailer
from app.config import Settings
from app.main import create_app

from .conftest import person


def code_of(mail: dict) -> str:
    return re.search(r"\d{6}", mail["text"]).group(0)


def test_signup_signs_in_and_welcome_mail(server):
    _, device = server
    d = device()
    assert d.post("/api/signup", json=person()).status_code == 200
    me = d.get("/api/me").json()
    assert me["active"] == me["accounts"][0]["id"]
    assert me["accounts"][0]["address"] == "tokumei@muscat.example"
    assert me["accounts"][0]["unread"] == 1
    mails = d.get("/api/mails").json()
    assert len(mails) == 1 and "ようこそ" in mails[0]["subject"]
    detail = d.get(f"/api/mails/{mails[0]['id']}").json()
    assert len(detail["body"]) > 10
    assert d.get("/api/me").json()["accounts"][0]["unread"] == 0


def test_signup_rejections(server):
    _, device = server
    d = device()
    assert d.post("/api/signup", json=person()).status_code == 200
    assert d.post("/api/signup", json=person()).status_code == 409
    assert d.post("/api/signup", json=person(local="admin")).status_code == 409
    assert d.post("/api/signup", json=person(local="a..b")).status_code == 400
    assert d.post("/api/signup", json=person(local="Ab")).status_code == 400
    assert d.post("/api/signup", json=person(local="okname1", password="short")).status_code == 400
    young = dt.datetime.now(dt.timezone.utc).year - 5
    assert d.post("/api/signup", json=person(local="okname2", birth={"y": young, "m": 1, "d": 1})).status_code == 400
    assert d.post("/api/signup", json=person(local="okname3", birth={"y": 1990, "m": 2, "d": 31})).status_code == 400
    assert d.post("/api/signup", json=person(local="okname4", contact="not-an-email")).status_code == 400
    assert d.post("/api/signup/check", json={"local": "tokumei"}).status_code == 409
    assert d.post("/api/signup/check", json={"local": "free-name"}).status_code == 200


def test_new_device_needs_code(server):
    _, device = server
    device().post("/api/signup", json=person())
    fresh = device()
    assert fresh.post("/api/signin", json={"address": "tokumei", "password": "wrong-password-1"}).status_code == 401
    r = fresh.post("/api/signin", json={"address": "tokumei@muscat.example", "password": "correct-horse-battery"}).json()
    assert r["needCode"] is True
    assert re.fullmatch(r"t\*\*\*@example\.com", r["hint"])
    mail = mailer.outbox[-1]
    assert mail["to"] == "taro@example.com"
    code = code_of(mail)
    wrong = "000001" if code == "000000" else "000000"
    assert fresh.post("/api/verify", json={"ticket": r["ticket"], "code": wrong}).status_code == 400
    assert fresh.post("/api/verify", json={"ticket": r["ticket"], "code": code}).status_code == 200
    assert len(fresh.get("/api/me").json()["accounts"]) == 1
    # 使ったコードは二度と使えない
    assert fresh.post("/api/verify", json={"ticket": r["ticket"], "code": code}).status_code == 400
    # この端末は信頼済みになったので、次はコードなし
    again = fresh.post("/api/signin", json={"address": "tokumei", "password": "correct-horse-battery"}).json()
    assert again["ok"] is True


def test_five_wrong_codes_lock(server):
    _, device = server
    device().post("/api/signup", json=person())
    fresh = device()
    r = fresh.post("/api/signin", json={"address": "tokumei", "password": "correct-horse-battery"}).json()
    real = code_of(mailer.outbox[-1])
    wrong = "654321" if real == "123456" else "123456"
    for _ in range(5):
        assert fresh.post("/api/verify", json={"ticket": r["ticket"], "code": wrong}).status_code == 400
    assert fresh.post("/api/verify", json={"ticket": r["ticket"], "code": real}).status_code == 429


def test_password_reset(server):
    _, device = server
    device().post("/api/signup", json=person())
    d = device()
    unknown = d.post("/api/reset/request", json={"address": "nobody-here"})
    assert unknown.status_code == 200 and unknown.json()["ticket"]
    assert d.post("/api/verify", json={"ticket": unknown.json()["ticket"], "code": "000000"}).status_code == 400

    before = len(mailer.outbox)
    req = d.post("/api/reset/request", json={"address": "tokumei"}).json()
    assert len(mailer.outbox) == before + 1
    ok = d.post("/api/verify", json={"ticket": req["ticket"], "code": code_of(mailer.outbox[-1])}).json()
    assert ok["resetToken"]
    assert d.post("/api/reset/complete", json={"resetToken": ok["resetToken"], "password": "short"}).status_code == 400
    assert d.post("/api/reset/complete", json={"resetToken": ok["resetToken"], "password": "brand-new-password-1"}).status_code == 200
    assert d.post("/api/reset/complete", json={"resetToken": ok["resetToken"], "password": "brand-new-password-2"}).status_code == 400
    fresh = device()
    assert fresh.post("/api/signin", json={"address": "tokumei", "password": "correct-horse-battery"}).status_code == 401
    assert fresh.post("/api/signin", json={"address": "tokumei", "password": "brand-new-password-1"}).json()["needCode"]


def test_multiple_accounts(server):
    _, device = server
    d = device()
    d.post("/api/signup", json=person(local="nanashi", contact=""))
    d.post("/api/signup", json=person(local="tokumei2", contact=""))
    me = d.get("/api/me").json()
    assert len(me["accounts"]) == 2
    a, b = me["accounts"]
    assert me["active"] == b["id"]
    d.post("/api/switch", json={"id": a["id"]})
    assert d.get("/api/me").json()["active"] == a["id"]
    mail_b = d.get("/api/mails").json()
    d.post("/api/switch", json={"id": b["id"]})
    other = d.get("/api/mails").json()
    assert mail_b[0]["id"] != other[0]["id"]
    assert d.get(f"/api/mails/{mail_b[0]['id']}").status_code == 404
    assert d.post("/api/switch", json={"id": 99999}).status_code == 400
    d.post("/api/signout", json={})
    me = d.get("/api/me").json()
    assert len(me["accounts"]) == 1 and me["active"] == a["id"]
    d.post("/api/signout", json={})
    assert d.get("/api/me").json()["active"] is None
    assert d.get("/api/mails").status_code == 401


def test_forged_cookie_is_rejected(server):
    _, device = server
    d = device()
    d.post("/api/signup", json=person(local="someone", contact=""))
    res = TestClient(server[0]).get("/api/me", headers={"Cookie": "sp_s=eyJpZHMiOlsxXSwiYWN0aXZlIjoxfQ.forged"})
    assert res.json()["active"] is None


def test_node_compatible_password_hash():
    # Node版が作ったハッシュ（scrypt$salt$hash）を、そのまま確かめられる（以前のアカウントを引き継げる）
    from app.security import verify_password

    stored = (
        "scrypt$00112233445566778899aabbccddeeff$"
        "6d66b6550da1078287fbea6fe1377f62f5618cf14576321330717e8e9f618560"
        "997562c3cd9d770a346b00acdf6caf07da3bb8932cf740f6d761b57b0d844848"
    )
    assert verify_password("correct-horse-battery 日本語", stored) is True
    assert verify_password("wrong-password", stored) is False
    assert verify_password("anything", None) is False


def test_unknown_api_and_bad_json(server):
    _, device = server
    d = device()
    assert d.get("/api/nothing").status_code == 404
    assert d.get("/api/nothing").json()["error"]
    assert d.post("/api/signin", content="not json", headers={"Content-Type": "application/json"}).status_code == 400
    assert d.post("/api/signin", content="x=1", headers={"Content-Type": "text/plain"}).status_code == 400


def test_rate_limit(tmp_path):
    strict = create_app(Settings(db_file=str(tmp_path / "s.db"), secret="x", domain="muscat.example"))
    c = TestClient(strict)
    statuses = [c.post("/api/signin", json={"address": "nobody", "password": "whatever-password"}).status_code for _ in range(12)]
    assert statuses[0] == 401 and statuses[-1] == 429


def test_admin_api(make_client):
    app, device = make_client(admin_addresses=["boss1"])
    boss, other, anon = device(), device(), device()
    boss.post("/api/signup", json=person(local="boss1", contact="a@example.com"))
    other.post("/api/signup", json=person(local="guest1", contact=""))
    assert anon.get("/api/admin/users").status_code == 401
    assert other.get("/api/admin/users").status_code == 403
    ok = boss.get("/api/admin/users")
    assert ok.status_code == 200
    users = ok.json()
    assert len(users) == 2
    assert any(u["address"] == "boss1@muscat.example" and u["contact"] == "a@example.com" for u in users)
    assert not re.search(r"pw_hash|scrypt|password", ok.text, re.I)
    # 削除: 管理者だけができ、自分自身は消せない。消すとメールも一緒に消える
    guest_id = next(u["id"] for u in users if u["address"] == "guest1@muscat.example")
    boss_id = next(u["id"] for u in users if u["address"] == "boss1@muscat.example")
    assert other.post("/api/admin/delete", json={"id": guest_id}).status_code == 403
    assert boss.post("/api/admin/delete", json={"id": boss_id}).status_code == 400
    assert boss.post("/api/admin/delete", json={"id": guest_id}).status_code == 200
    assert boss.post("/api/admin/delete", json={"id": guest_id}).status_code == 404
    assert [u["address"] for u in boss.get("/api/admin/users").json()] == ["boss1@muscat.example"]
    assert other.get("/api/mails").status_code == 401


def test_admin_disabled_without_setting(server):
    _, device = server
    d = device()
    d.post("/api/signup", json=person(local="boss1", contact=""))
    assert d.get("/api/admin/users").status_code == 404


def test_create_admin_script(server):
    from app.create_admin import upsert_admin
    from app.db import connect
    from app.security import verify_password

    app, _ = server
    db = connect(app.state.ctx.settings.db_file)
    assert upsert_admin(db, "muscat.example", "nanashi", "first-password-123") is True
    assert upsert_admin(db, "muscat.example", "nanashi", "second-password-45") is False
    row = db.execute("SELECT * FROM users WHERE address = 'nanashi@muscat.example'").fetchone()
    assert verify_password("second-password-45", row["pw_hash"])
    assert not verify_password("first-password-123", row["pw_hash"])
    assert row["contact_email"] is None


def test_static_files_and_traversal(tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<!doctype html><title>x</title>")
    (dist / "app.js").write_text("console.log(1)")
    (tmp_path / "secret.txt").write_text("secret")
    app = create_app(Settings(db_file=str(tmp_path / "s.db"), secret="x", static_dir=str(dist)))
    c = TestClient(app)
    home = c.get("/")
    assert home.status_code == 200 and "default-src 'self'" in home.headers["content-security-policy"]
    assert c.get("/settings/account").text.startswith("<!doctype html>")  # 画面の行き先はブラウザ側
    assert c.get("/app.js").text == "console.log(1)"
    assert "secret" not in c.get("/../secret.txt").text
    assert "secret" not in c.get("/%2e%2e/secret.txt").text
    assert c.get("/api/me").headers["cache-control"] == "no-store"
