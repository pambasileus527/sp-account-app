"""ビデオアプリ用の動画検索（YouTube Data API）。

- キー（YOUTUBE_API_KEY）が空のときは、決まったサンプルを返す。キーなしでも画面を試せる。
- 同じ検索は10分間まとめる（利用枠を節約する）。標準ライブラリだけで呼ぶ。
- キーは環境変数にだけ置き、画面やログには出さない。
"""
from __future__ import annotations

import html
import json
import logging
import re
import threading
import time
import urllib.parse
import urllib.request
from typing import Any, Callable

from .errors import ApiError

log = logging.getLogger("muscat")

API = "https://www.googleapis.com/youtube/v3"
TTL = 600.0
MAX_CACHE = 200
VIDEO_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")

SAMPLE = [
    {"id": "sample-1", "title": "朝の10分ストレッチ", "channel": "ゆるフィットTV"},
    {"id": "sample-2", "title": "東京の街歩き 夕暮れの下町", "channel": "さんぽ日和"},
    {"id": "sample-3", "title": "やさしいPython入門 第1回", "channel": "まなびラボ"},
    {"id": "sample-4", "title": "夜に聴くジャズ プレイリスト", "channel": "ミッドナイト音楽室"},
    {"id": "sample-5", "title": "5分でわかる今週の経済ニュース", "channel": "ニュースの教室"},
]

Fetch = Callable[[str], dict]


def _http_get(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=8) as res:  # noqa: S310 固定のhttpsだけ
        return json.loads(res.read().decode("utf-8"))


def _thumb(video_id: str) -> str:
    # 画像は、許可している i.ytimg.com だけから読む
    return f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg"


class VideoService:
    def __init__(self, key: str, fetch: Fetch | None = None):
        self.key = key.strip()
        self.fetch: Fetch = fetch or _http_get
        self.lock = threading.Lock()
        self.cache: dict[str, tuple[float, dict]] = {}

    @property
    def sample(self) -> bool:
        return not self.key

    def search(self, q: str) -> dict[str, Any]:
        q = " ".join(q.split())[:100]
        if self.sample:
            hit = [v for v in SAMPLE if q.lower() in (v["title"] + v["channel"]).lower()]
            return {"sample": True, "items": [{**v, "thumb": ""} for v in hit]}
        now = time.monotonic()
        with self.lock:
            cached = self.cache.get(q)
            if cached and cached[0] > now:
                return cached[1]
        result = {"sample": False, "items": self._call(q)}
        with self.lock:
            if len(self.cache) >= MAX_CACHE:
                self.cache.clear()
            self.cache[q] = (now + TTL, result)
        return result

    def _call(self, q: str) -> list[dict]:
        if q:
            params = {
                "part": "snippet", "type": "video", "maxResults": "15", "q": q, "safeSearch": "moderate",
                "regionCode": "JP", "relevanceLanguage": "ja", "videoEmbeddable": "true", "key": self.key,
            }
            url = f"{API}/search?{urllib.parse.urlencode(params)}"
        else:  # 検索語が空のときは、いま人気の動画（利用枠の消費が少ない）
            params = {
                "part": "snippet", "chart": "mostPopular", "maxResults": "15", "regionCode": "JP", "key": self.key,
            }
            url = f"{API}/videos?{urllib.parse.urlencode(params)}"
        try:
            data = self.fetch(url)
        except Exception as e:  # キーが入るので、URLや本文はログに出さない
            log.warning("YouTube APIの呼び出しに失敗: %s", type(e).__name__)
            raise ApiError(502, "動画を取得できませんでした。しばらくしてからもう一度お試しください。") from None
        items = []
        for row in data.get("items", []):
            raw = row.get("id")
            vid = raw.get("videoId") if isinstance(raw, dict) else raw
            snip = row.get("snippet") or {}
            if not isinstance(vid, str) or not VIDEO_ID.match(vid):
                continue
            items.append({
                "id": vid,
                "title": html.unescape(str(snip.get("title", "")))[:200],
                "channel": html.unescape(str(snip.get("channelTitle", "")))[:100],
                "thumb": _thumb(vid),
            })
        return items
