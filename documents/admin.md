# 登録済みアカウントの一覧（管理画面）

顧客画面（`/`）とは別に、管理者は次の手順で作ります。

1. `.env` に `ADMIN_ADDRESSES=nanashi` と書いて `docker compose up -d`。
2. `docker compose exec api python -m app.create_admin nanashi` でアカウントを作り、パスワードを決める（再実行するとパスワードの設定し直し）。
3. `http://localhost:3000/admin` を開き、そのアドレスとパスワードでサインイン。

一覧にパスワードは出ません。「削除」を2回押すと、そのアカウントとメールが消えます（自分自身は消せません）。`ADMIN_ADDRESSES` が空なら管理画面は無効です。
