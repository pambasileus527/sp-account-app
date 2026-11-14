# 動かし方

```
docker compose up --build
```

| 何が | どこで |
|---|---|
| ホーム（サインイン前はサインイン画面、サインイン後は2つのアプリの入口） | http://localhost:3000 |
| 設定アプリ（サインイン、アドレス作成） | http://localhost:3000/settings |
| メールアプリ | http://localhost:3000/mail |
| ビデオアプリ（キーが空ならサンプル） | http://localhost:3000/video |
| ブラウザ（Google検索を開く） | http://localhost:3000/browser |
| 管理画面（登録済みアカウントの一覧・削除） | http://localhost:3000/admin |
| APIの文書（開発用） | http://localhost:8000/api/docs |
| 偽メールサーバーの受信箱（確認コードはここに届く） | http://localhost:8025 |

止めるとき: `Ctrl+C`。データ（アカウントとメール）を消して最初からやり直すとき: `docker compose down -v`

初回は、画面側が `npm install` をするので、少し待ちます（`web` のログに `Local: http://localhost:3000/` と出たら準備完了）。

Dockerを使わない場合: サーバーは `cd backend && pip install -r requirements-dev.txt && uvicorn app.main:factory --factory --reload`、
画面は `cd frontend && npm install && npm run dev`（確認コードは、サーバーを起動したターミナルに表示される）。

テスト: `docker compose run --rm api sh -c "pip install -q -r requirements-dev.txt && python -m pytest"`（画面の型チェックは `cd frontend && npm run typecheck`）。

