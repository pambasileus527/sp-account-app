# sp-account-app

独自ドメインのメールアドレスを、画面からぽちぽち作れるサービス「Muscat Account」の、手元で動かす版です。
**設定アプリ**と**メールアプリ**は、別のアプリとして分かれています。

## 動かす

```
docker compose up --build
```

| 何が | どこで |
|---|---|
| ホーム（サインイン前はサインイン画面、サインイン後は2つのアプリの入口） | http://localhost:3000 |
| 設定アプリ（サインイン、アドレス作成） | http://localhost:3000/settings |
| メールアプリ | http://localhost:3000/mail |
| 管理画面（登録済みアカウントの一覧・削除） | http://localhost:3000/admin |
| APIの文書（開発用） | http://localhost:8000/api/docs |
| 偽メールサーバーの受信箱（確認コードはここに届く） | http://localhost:8025 |

止めるとき: `Ctrl+C`。データ（アカウントとメール）を消して最初からやり直すとき: `docker compose down -v`

初回は、画面側が `npm install` をするので、少し待ちます（`web` のログに `Local: http://localhost:3000/` と出たら準備完了）。

Dockerを使わない場合: サーバーは `cd backend && pip install -r requirements-dev.txt && uvicorn app.main:factory --factory --reload`、
画面は `cd frontend && npm install && npm run dev`（確認コードは、サーバーを起動したターミナルに表示される）。

テスト: `docker compose run --rm api sh -c "pip install -q -r requirements-dev.txt && python -m pytest"`（画面の型チェックは `cd frontend && npm run typecheck`）。

## 画面の流れ

```
ホーム（サインイン画面 → サインイン後はアプリの入口）─┬─ 設定アプリ: 設定（サインイン前）→ サインイン ─┬─ 新しい端末なら確認コード ─┐
        │                          ├─ パスワードをお忘れの場合 → コード → 新しいパスワード
        │                          └─ アドレスを新しく作る（名前 → 生年月日 → アドレス → パスワード）
        │                                                                              ↓
        │                                                                      アカウント設定
        └─ メールアプリ: 受信トレイ ─ 右上のアイコン → アカウントのパネル → 設定アプリへ
```

決めたこと:

- アドレスを作った直後は、確認コードなしでそのまま入れる。
- 確認コードを使うのは、「パスワードの再設定」と「まだ信頼していない端末でのサインイン」だけ。
- コードの送り先は、登録時に入力した**連絡先のメール**（任意）。連絡先がないアカウントは、パスワードだけで入れる。再設定はできない。
- メールアプリは、設定アプリでサインインしたアカウントで開く。右上のアイコンで、アカウントの切り替えと追加ができる。

## 作り

- サーバー: Python（FastAPI）。データベースはSQLite（標準の `sqlite3`）。
- 画面: React（Vite）+ TypeScript。画面の切り替えは React Router。
- 開発中は、画面（:3000）が `/api` をサーバー（:8000）へ中継するので、ブラウザからは1つの場所に見える（Cookieがそのまま使える）。

```
backend/
  app/        main.py（起動・エラー整形・本番の画面配信）、routes.py（API）、core.py（セッション・回数制限・確認コード）、
              validate.py（入力チェック）、security.py（ハッシュ・署名）、mailer.py（メール送信）、
              provision.py（メールボックス作成の差し込み口）、create_admin.py（管理者を作る）
  tests/      pytest
frontend/
  src/        api.ts、me.tsx（サインイン状態）、ui.tsx、icons.tsx、style.css
  src/pages/  Home.tsx（ホーム）、Settings.tsx（設定アプリ）、Mail.tsx（メールアプリ）、Admin.tsx（管理画面）
Dockerfile    本番用（画面をビルドして、サーバーから一緒に配る）
```

以前のNode.js版からの作り直しですが、パスワードのハッシュとCookieの署名は同じ形式なので、以前のDB（アカウント）はそのまま使えます。

## 本番にするとき（まだやっていないこと）

- **本物のメールボックスを作る**: `backend/app/provision.py` の `Provisioner` を、MailcowのAPIを呼ぶ実装に差し替える。APIキーは環境変数にだけ置く。
- **メールの送受信**: Mailcowを置いたVPSと独自ドメイン（MX・SPF・DKIM・DMARC・逆引き）が必要。
- `SESSION_SECRET` を長いランダムな値にする（`.env.example` を参照）。HTTPSで公開するときは `COOKIE_SECURE=1`。本番は、ルートの `Dockerfile` で画面ごと1つのイメージにする。
- 回数制限はメモリ上なので、複数台にするときは置き場所を変える。
- 未実装: パスキー、メールを書く画面、スター・送信済み・下書き、メールの受信（いまのメールは「ようこそ」の1通だけ）。

## 登録済みアカウントの一覧（管理画面）

顧客画面（`/`）とは別に、管理者は次の手順で作ります。

1. `.env` に `ADMIN_ADDRESSES=nanashi` と書いて `docker compose up -d`。
2. `docker compose exec api python -m app.create_admin nanashi` でアカウントを作り、パスワードを決める（再実行するとパスワードの設定し直し）。
3. `http://localhost:3000/admin` を開き、そのアドレスとパスワードでサインイン。

一覧にパスワードは出ません。「削除」を2回押すと、そのアカウントとメールが消えます（自分自身は消せません）。`ADMIN_ADDRESSES` が空なら管理画面は無効です。
