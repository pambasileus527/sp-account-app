from __future__ import annotations

from .conftest import person


def signed_in(device):
    d = device()
    assert d.post("/api/signup", json=person()).status_code == 200
    return d


def test_video_needs_sign_in(server):
    _, device = server
    assert device().get("/api/video/search").status_code == 401


def test_sample_without_key(server):
    _, device = server
    d = signed_in(device)
    r = d.get("/api/video/search").json()
    assert r["sample"] is True and len(r["items"]) == 5
    hit = d.get("/api/video/search", params={"q": "ジャズ"}).json()
    assert [v["title"] for v in hit["items"]] == ["夜に聴くジャズ プレイリスト"]
    assert d.get("/api/video/search", params={"q": "ありえない語"}).json()["items"] == []


def test_search_with_key_maps_and_caches(make_client):
    app, device = make_client(youtube_api_key="secret-key")
    calls: list[str] = []

    def fake(url: str) -> dict:
        calls.append(url)
        return {"items": [
            {"id": {"videoId": "abcdefghijk"}, "snippet": {"title": "Tom &amp; Jerry&#39;s", "channelTitle": "チャンネル"}},
            {"id": {"videoId": "bad id"}, "snippet": {"title": "無効なID", "channelTitle": "x"}},
        ]}

    app.state.video.fetch = fake
    d = signed_in(device)
    r = d.get("/api/video/search", params={"q": "猫"}).json()
    assert r["sample"] is False
    assert r["items"] == [{
        "id": "abcdefghijk", "title": "Tom & Jerry's", "channel": "チャンネル",
        "thumb": "https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg",
    }]
    d.get("/api/video/search", params={"q": "猫"})
    assert len(calls) == 1  # 同じ検索は、まとめて1回だけ
    assert "/search?" in calls[0] and "key=secret-key" in calls[0]
    d.get("/api/video/search")  # 空なら、いま人気の動画
    assert "/videos?" in calls[1] and "chart=mostPopular" in calls[1]


def test_failure_hides_key(make_client):
    app, device = make_client(youtube_api_key="secret-key")

    def boom(url: str) -> dict:
        raise RuntimeError(url)

    app.state.video.fetch = boom
    d = signed_in(device)
    r = d.get("/api/video/search", params={"q": "猫"})
    assert r.status_code == 502
    assert "secret-key" not in r.text
