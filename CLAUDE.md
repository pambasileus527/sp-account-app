# sp-account-app

README.md を先に読むこと。ここには、変えないでほしい決めごとだけを書く。

- 構成は、サーバー=Python（FastAPI, `backend/`）、画面=React + TypeScript（Vite, `frontend/`）。
- 設定アプリ（`frontend/src/pages/Settings.tsx`）とメールアプリ（`Mail.tsx`）は別のアプリ。互いの画面に直接リンクしない。行き来はホーム（`/`）と、メールアプリの右上のアカウントのパネルだけ。
- アドレスを作った直後に確認コードは要らない。確認コードは「再設定」と「未信頼の端末でのサインイン」だけ。
- 依存パッケージは増やさない（サーバーは fastapi と uvicorn、画面は react・react-router-dom・vite・typescript だけ）。増やすなら先に相談する。
- CSPが `default-src 'self'` なので、`style=` 属性とインラインのスクリプトは使わない。色は `frontend/src/style.css` のクラスで付ける。
- 画面に出す文字は、React の `{}` を通す（`dangerouslySetInnerHTML` は使わない）。
- APIのエラーは `{"error": "画面に出せる日本語"}` の形。`ApiError`（サーバー）と `ApiError`（`frontend/src/api.ts`）で対になっている。
- ログインの失敗は、アドレスが無いのかパスワードが違うのかを区別して返さない。
- 「メールボックスを作る」処理は `backend/app/provision.py` に隔離している。ここ以外にMailcowの知識を置かない。
- 管理画面は `/admin`（`GET /api/admin/users`, `POST /api/admin/delete`）。`ADMIN_ADDRESSES` のアカウントでサインイン中のときだけ。空なら 404。パスワード関連の列は絶対に返さない。管理者は `python -m app.create_admin` で作り、顧客画面からは作らない。
- 変更したら、サーバーは `pytest`、画面は `npm run typecheck`。テストは通信なしで動く。
