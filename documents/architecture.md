# 作り

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

