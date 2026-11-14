from __future__ import annotations

import logging
import re
import sqlite3
from typing import Any

from fastapi import APIRouter, Body, Depends, Request, Response

from .core import CODE_TTL_MS, MAX_ATTEMPTS, MAX_SENDS, Ctx, mask, now_ms
from .db import connect
from .errors import ApiError
from .security import code_hash, hash_password, new_code, new_ticket, verify_password
from .validate import check_birth, check_local, check_password, clean_contact, clean_name, text

log = logging.getLogger("muscat")
router = APIRouter(prefix="/api")


def get_ctx(request: Request) -> Ctx:
    return request.app.state.ctx


def get_db(ctx: Ctx = Depends(get_ctx)):
    conn = connect(ctx.settings.db_file)
    try:
        yield conn
    finally:
        conn.close()


Json = dict[str, Any]


# ---------------- 読み取り ----------------
@router.get("/me")
def me(request: Request, ctx: Ctx = Depends(get_ctx), db: sqlite3.Connection = Depends(get_db)):
    s = ctx.get_session(db, request)
    accounts = []
    for uid in s["ids"]:
        user = ctx.user_by_id(db, uid)
        unread = db.execute("SELECT COUNT(*) AS n FROM mails WHERE user_id = ? AND unread = 1", (uid,)).fetchone()["n"]
        accounts.append({**ctx.view(user), "unread": unread})
    return {"domain": ctx.domain, "active": s["active"], "accounts": accounts}


@router.get("/mails")
def mails(request: Request, ctx: Ctx = Depends(get_ctx), db: sqlite3.Connection = Depends(get_db)):
    user = ctx.active_user(db, request)
    rows = db.execute(
        "SELECT id, from_name, subject, body, received_at, unread, starred FROM mails "
        "WHERE user_id = ? ORDER BY received_at DESC LIMIT 100",
        (user["id"],),
    ).fetchall()
    return [
        {
            "id": r["id"], "from": r["from_name"], "subject": r["subject"], "receivedAt": r["received_at"],
            "unread": bool(r["unread"]), "starred": bool(r["starred"]),
            "preview": re.sub(r"\s+", " ", r["body"])[:120],
        }
        for r in rows
    ]


@router.get("/mails/{mail_id}")
def mail_detail(mail_id: int, request: Request, ctx: Ctx = Depends(get_ctx), db: sqlite3.Connection = Depends(get_db)):
    user = ctx.active_user(db, request)
    row = db.execute("SELECT * FROM mails WHERE id = ? AND user_id = ?", (mail_id, user["id"])).fetchone()
    if not row:
        raise ApiError(404, "メールが見つかりません。")
    db.execute("UPDATE mails SET unread = 0 WHERE id = ?", (row["id"],))
    return {
        "id": row["id"], "from": row["from_name"], "fromAddress": row["from_addr"], "subject": row["subject"],
        "body": row["body"], "receivedAt": row["received_at"],
    }


# ---------------- 管理（ADMIN_ADDRESSES のアカウントでサインイン中のときだけ） ----------------
@router.get("/admin/users")
def admin_users(request: Request, ctx: Ctx = Depends(get_ctx), db: sqlite3.Connection = Depends(get_db)):
    ctx.require_admin(db, request)
    rows = db.execute(
        """SELECT u.id, u.sei, u.mei, u.address, u.contact_email, u.created_at,
             (SELECT COUNT(*) FROM mails m WHERE m.user_id = u.id) AS mails,
             (SELECT COUNT(*) FROM mails m WHERE m.user_id = u.id AND m.unread = 1) AS unread
           FROM users u ORDER BY u.id DESC"""
    ).fetchall()
    # パスワード関係の列は、ここでも返さない
    return [
        {
            "id": r["id"], "name": f"{r['sei']} {r['mei']}", "address": r["address"], "contact": r["contact_email"],
            "createdAt": r["created_at"], "mails": r["mails"], "unread": r["unread"],
        }
        for r in rows
    ]


@router.post("/admin/delete")
def admin_delete(request: Request, body: Json = Body(...), ctx: Ctx = Depends(get_ctx), db: sqlite3.Connection = Depends(get_db)):
    me_ = ctx.require_admin(db, request)
    target = ctx.user_by_id(db, body.get("id")) if isinstance(body.get("id"), int) else None
    if not target:
        raise ApiError(404, "アカウントが見つかりません。")
    if target["id"] == me_["id"]:
        raise ApiError(400, "サインイン中の自分自身は削除できません。")
    db.execute("DELETE FROM codes WHERE user_id = ?", (target["id"],))
    db.execute("DELETE FROM users WHERE id = ?", (target["id"],))  # メールは外部キーで一緒に消える
    return {"ok": True}


# ---------------- アドレスを作る ----------------
@router.post("/signup/check")
def signup_check(request: Request, body: Json = Body(...), ctx: Ctx = Depends(get_ctx), db: sqlite3.Connection = Depends(get_db)):
    ctx.limit(request, "check", 60)
    err = check_local(text(body.get("local")).strip().lower(), lambda l: bool(ctx.user_by_address(db, f"{l}@{ctx.domain}")))
    if err:
        raise ApiError(*err)
    return {"ok": True}


@router.post("/signup")
def signup(
    request: Request, response: Response, body: Json = Body(...),
    ctx: Ctx = Depends(get_ctx), db: sqlite3.Connection = Depends(get_db),
):
    ctx.limit(request, "signup", 5, 10 * 60)
    sei, mei = clean_name(body.get("sei")), clean_name(body.get("mei"))
    if not sei or not mei:
        raise ApiError(400, "名前を入力してください。")
    birth, birth_err = check_birth(body.get("birth"))
    if birth_err:
        raise ApiError(400, birth_err)
    local = text(body.get("local")).strip().lower()
    local_err = check_local(local, lambda l: bool(ctx.user_by_address(db, f"{l}@{ctx.domain}")))
    if local_err:
        raise ApiError(*local_err)
    password = body.get("password")
    pw_err = check_password(password)
    if pw_err:
        raise ApiError(400, pw_err)
    if password == local:
        raise ApiError(400, "アドレスと同じパスワードは使えません。")
    contact, contact_ok = clean_contact(body.get("contact"))
    if not contact_ok:
        raise ApiError(400, "連絡先のメールアドレスを正しく入力してください。")
    address = f"{local}@{ctx.domain}"
    if not ctx.provisioner.is_available(address):
        raise ApiError(409, "このアドレスは使えません。")

    try:
        cur = db.execute(
            "INSERT INTO users (sei, mei, birth, address, pw_hash, contact_email, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (sei, mei, birth, address, hash_password(password), contact, now_ms()),
        )
    except sqlite3.IntegrityError:
        raise ApiError(409, "このアドレスはすでに使われています。") from None
    uid = cur.lastrowid
    try:
        ctx.provisioner.create(address=address, password=password, name=f"{sei} {mei}")
    except Exception:  # noqa: BLE001
        db.execute("DELETE FROM users WHERE id = ?", (uid,))
        log.exception("メールボックスの作成に失敗")
        raise ApiError(502, "アドレスを作れませんでした。しばらくしてからもう一度お試しください。") from None
    db.execute(
        "INSERT INTO mails (user_id, from_name, from_addr, subject, body, received_at) VALUES (?, ?, ?, ?, ?, ?)",
        (
            uid, "Muscat チーム", f"team@{ctx.domain}", "ようこそ、Muscat Account へ",
            "アドレスの作成が完了しました。\n\n連絡先のメールを登録しておくと、パスワードを忘れたときや、新しい端末でサインインするときに確認コードを受け取れます。\n\nどうぞよろしくお願いします。",
            now_ms(),
        ),
    )
    return ctx.complete_signin(db, request, response, uid)


# ---------------- サインイン・確認コード ----------------
@router.post("/signin")
def signin(
    request: Request, response: Response, body: Json = Body(...),
    ctx: Ctx = Depends(get_ctx), db: sqlite3.Connection = Depends(get_db),
):
    ctx.limit(request, "signin", 10)
    user = ctx.find_user(db, body.get("address"))
    ok = verify_password(text(body.get("password"))[:200], user["pw_hash"] if user else None)
    if not user or not ok:
        raise ApiError(401, "アドレスまたはパスワードが違います。")
    # 連絡先がなければ確認コードは送れないので、パスワードだけで入る
    if user["id"] in ctx.get_trusted(request) or not user["contact_email"]:
        return ctx.complete_signin(db, request, response, user["id"])
    ticket = ctx.issue_code(db, user["id"], "signin", user["contact_email"])
    return {"needCode": True, "ticket": ticket, "hint": mask(user["contact_email"])}


@router.post("/verify")
def verify(
    request: Request, response: Response, body: Json = Body(...),
    ctx: Ctx = Depends(get_ctx), db: sqlite3.Connection = Depends(get_db),
):
    ctx.limit(request, "verify", 20)
    row = db.execute("SELECT * FROM codes WHERE ticket = ?", (text(body.get("ticket")),)).fetchone()
    bad = ApiError(400, "コードが正しくないか、期限が切れています。")
    if not row or row["used"] or row["expires_at"] < now_ms() or row["purpose"] not in ("signin", "reset"):
        raise bad
    if row["attempts"] >= MAX_ATTEMPTS:
        raise ApiError(429, "入力の回数が上限に達しました。コードをもう一度送ってください。")
    db.execute("UPDATE codes SET attempts = attempts + 1 WHERE ticket = ?", (row["ticket"],))
    if not ctx.code_matches(row, text(body.get("code")).strip()) or not row["user_id"]:
        raise bad
    db.execute("UPDATE codes SET used = 1 WHERE ticket = ?", (row["ticket"],))
    if row["purpose"] == "signin":
        return ctx.complete_signin(db, request, response, row["user_id"])
    reset_token = new_ticket()
    db.execute(
        "INSERT INTO codes (ticket, user_id, purpose, code_hash, expires_at) VALUES (?, ?, 'reset-ok', 'x', ?)",
        (reset_token, row["user_id"], now_ms() + CODE_TTL_MS),
    )
    return {"resetToken": reset_token}


@router.post("/resend")
def resend(request: Request, body: Json = Body(...), ctx: Ctx = Depends(get_ctx), db: sqlite3.Connection = Depends(get_db)):
    ctx.limit(request, "resend", 10)
    row = db.execute("SELECT * FROM codes WHERE ticket = ?", (text(body.get("ticket")),)).fetchone()
    if not row or row["used"] or row["purpose"] not in ("signin", "reset"):
        raise ApiError(400, "もう一度最初からお試しください。")
    if row["sends"] >= MAX_SENDS:
        raise ApiError(429, "再送の回数が上限に達しました。しばらくしてからお試しください。")
    user = ctx.user_by_id(db, row["user_id"]) if row["user_id"] else None
    code = new_code()
    db.execute(
        "UPDATE codes SET code_hash = ?, expires_at = ?, attempts = 0, sends = sends + 1 WHERE ticket = ?",
        (code_hash(ctx.secret, row["ticket"], code) if row["user_id"] else row["code_hash"], now_ms() + CODE_TTL_MS, row["ticket"]),
    )
    if user and user["contact_email"]:
        ctx.deliver_code(user["contact_email"], code)
    return {"ok": True}


# ---------------- パスワード再設定 ----------------
@router.post("/reset/request")
def reset_request(request: Request, body: Json = Body(...), ctx: Ctx = Depends(get_ctx), db: sqlite3.Connection = Depends(get_db)):
    ctx.limit(request, "reset", 5, 10 * 60)
    user = ctx.find_user(db, body.get("address"))
    if user and user["contact_email"]:
        ticket = ctx.issue_code(db, user["id"], "reset", user["contact_email"])
    else:
        ticket = ctx.fake_ticket(db, "reset")
    return {"ok": True, "ticket": ticket}


@router.post("/reset/complete")
def reset_complete(
    request: Request, response: Response, body: Json = Body(...),
    ctx: Ctx = Depends(get_ctx), db: sqlite3.Connection = Depends(get_db),
):
    ctx.limit(request, "reset-complete", 10, 10 * 60)
    row = db.execute("SELECT * FROM codes WHERE ticket = ?", (text(body.get("resetToken")),)).fetchone()
    if not row or row["used"] or row["purpose"] != "reset-ok" or row["expires_at"] < now_ms() or not row["user_id"]:
        raise ApiError(400, "期限が切れました。もう一度最初からお試しください。")
    pw_err = check_password(body.get("password"))
    if pw_err:
        raise ApiError(400, pw_err)
    db.execute("UPDATE users SET pw_hash = ? WHERE id = ?", (hash_password(body["password"]), row["user_id"]))
    db.execute("UPDATE codes SET used = 1 WHERE ticket = ?", (row["ticket"],))
    return ctx.complete_signin(db, request, response, row["user_id"])


# ---------------- アカウントの切り替え・サインアウト ----------------
@router.post("/switch")
def switch(
    request: Request, response: Response, body: Json = Body(...),
    ctx: Ctx = Depends(get_ctx), db: sqlite3.Connection = Depends(get_db),
):
    s = ctx.get_session(db, request)
    target = body.get("id")
    if isinstance(target, bool) or target not in s["ids"]:
        raise ApiError(400, "そのアカウントはこの端末にありません。")
    s["active"] = target
    ctx.set_session(response, s)
    return {"ok": True}


@router.post("/signout")
def signout(
    request: Request, response: Response, body: Json = Body(...),
    ctx: Ctx = Depends(get_ctx), db: sqlite3.Connection = Depends(get_db),
):
    s = ctx.get_session(db, request)
    target = body.get("id") if body.get("id") in s["ids"] and not isinstance(body.get("id"), bool) else s["active"]
    s["ids"] = [i for i in s["ids"] if i != target]
    s["active"] = s["ids"][0] if s["ids"] else None
    ctx.set_session(response, s)
    return {"ok": True}


@router.get("/video/search")
def video_search(
    request: Request, q: str = "", ctx: Ctx = Depends(get_ctx), db: sqlite3.Connection = Depends(get_db),
):
    ctx.active_user(db, request)  # サインインしている人だけ（YouTubeの利用枠を守る）
    ctx.limit(request, "video", 30)
    return request.app.state.video.search(q)


@router.api_route("/{rest:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"], include_in_schema=False)
def not_found(rest: str):
    raise ApiError(404, "ページが見つかりません。")
