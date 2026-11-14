from __future__ import annotations

import logging
import secrets
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import Settings
from .core import Ctx
from .db import init_db
from .errors import ApiError
from .provision import LocalProvisioner, Provisioner
from .routes import router
from .video import VideoService

log = logging.getLogger("muscat")

# 本番で画面も一緒に配るときの方針。インラインのスクリプトとスタイルは使わない。
# 動画のサムネイル（i.ytimg.com）と、公式の埋め込みプレーヤー（youtube-nocookie.com）だけを外から許可する
CSP = (
    "default-src 'self'; img-src 'self' data: https://i.ytimg.com; frame-src https://www.youtube-nocookie.com; "
    "frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
)


def create_app(settings: Settings | None = None, provisioner: Provisioner | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    secret = settings.secret
    if not secret:
        secret = secrets.token_hex(32)
        log.warning("SESSION_SECRET が未設定です。再起動するとサインインが外れます。")
    init_db(settings.db_file)

    admins = {
        (a if "@" in a else f"{a}@{settings.domain}")
        for a in (x.strip().lower() for x in settings.admin_addresses)
        if a
    }
    app = FastAPI(
        title="Muscat Account API",
        docs_url="/api/docs" if settings.debug else None,
        openapi_url="/api/openapi.json" if settings.debug else None,
        redoc_url=None,
    )
    app.state.video = VideoService(settings.youtube_api_key)
    app.state.ctx = Ctx(settings=settings, secret=secret, provisioner=provisioner or LocalProvisioner(), admins=admins)

    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError):
        return JSONResponse({"error": exc.message}, status_code=exc.status)

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException):
        messages = {404: "ページが見つかりません。", 405: "使えない操作です。"}
        return JSONResponse({"error": messages.get(exc.status_code, "うまくいきませんでした。")}, status_code=exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _bad_request(request: Request, exc: RequestValidationError):
        return JSONResponse({"error": "リクエストが正しくありません。"}, status_code=400)

    @app.exception_handler(Exception)
    async def _server_error(request: Request, exc: Exception):
        log.exception("予期しないエラー")
        return JSONResponse({"error": "サーバーでエラーが起きました。"}, status_code=500)

    @app.middleware("http")
    async def _headers(request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        elif settings.static_dir:
            response.headers.setdefault("Content-Security-Policy", CSP)
        return response

    app.include_router(router)

    if settings.static_dir:
        root = Path(settings.static_dir).resolve()

        @app.get("/{full_path:path}", include_in_schema=False)
        def spa(full_path: str):
            target = (root / full_path).resolve()
            if full_path and target.is_file() and target.is_relative_to(root):
                return FileResponse(target)
            return FileResponse(root / "index.html")  # 画面の行き先は、ブラウザ側のルーターが決める

    return app


def factory() -> FastAPI:
    """uvicorn app.main:factory --factory で起動する。"""
    logging.basicConfig(level=logging.INFO)
    return create_app()
