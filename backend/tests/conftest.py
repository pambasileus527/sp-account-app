from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app import mailer


@pytest.fixture
def make_client(tmp_path):
    """端末（ブラウザ）ごとにCookieを持つクライアントを、同じサーバーに対して作る。"""
    counter = {"n": 0}

    def build(**overrides):
        counter["n"] += 1
        settings = Settings(
            db_file=str(tmp_path / f"app{counter['n']}.db"), secret="test-secret", domain="muscat.example",
            rate_limit_scale=1000, **overrides,
        )
        app = create_app(settings)

        def device() -> TestClient:
            return TestClient(app)

        return app, device

    return build


@pytest.fixture
def server(make_client):
    app, device = make_client()
    mailer.outbox.clear()
    return app, device


def person(**over):
    base = {
        "sei": "山田", "mei": "太郎", "birth": {"y": 1990, "m": 5, "d": 20},
        "local": "tokumei", "password": "correct-horse-battery", "contact": "taro@example.com",
    }
    base.update(over)
    return base
