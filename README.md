# sp-account-app

独自ドメインのメールアドレスを、画面からぽちぽち作れるサービス「Muscat Account」の、手元で動かす版です。
**設定アプリ**と**メールアプリ**は、別のアプリとして分かれています。

- サーバー: Python（FastAPI）+ SQLite
- 画面: React（Vite）+ TypeScript（PWAとしてインストール可能）
- 開発環境: Docker Compose（`docker compose up --build` → http://localhost:3000）
- 本物のメール（Mailcow）は、あとから `backend/app/provision.py` を差し替えて入れる前提

## ドキュメント（`documents/`）

| ファイル | 内容 |
|---|---|
| [setup.md](documents/setup.md) | 動かし方・URL・テスト |
| [flow.md](documents/flow.md) | 画面の流れと、決めたこと |
| [architecture.md](documents/architecture.md) | 作り・フォルダ構成 |
| [pwa.md](documents/pwa.md) | アプリとしてインストールする（開発用と本番用の違い） |
| [production.md](documents/production.md) | 本番にするときの残りの作業 |
| [admin.md](documents/admin.md) | 管理画面（アカウントの一覧・削除） |
| [CLAUDE.md](CLAUDE.md) | AIに守らせる開発ルール（直下） |
