# アプリとしてインストールする（PWA）

`frontend/public/` に manifest・アイコン・Service Worker（`sw.js`）があり、ブラウザからアプリのようにインストールできます。開発用と本番用で、インストール後の動きが違います。

- **3000番（開発用）**: 画面はアプリのように開きます。ただしオフラインでは動きません。開発中に画面が古いまま残らないよう、Service Worker を登録しないためです。
- **8001番（本番用）**: 画面の殻を端末に保存するので、オフラインでも画面の枠は出ます。`/api` は保存しません（メールの中身を端末に残さないため）。

本番用の試し方（8000番は開発用の `api` が使っているので、別のポートにする）:

```
docker build -t muscat . && docker run --rm -p 8001:8000 -e SESSION_SECRET=test muscat
```

その後 `http://localhost:8001` を開きます。

- インストールのアイコンは、manifest があれば3000番でも出ます（最近のChrome・Edge）。Android の Chrome は Service Worker もあるほうが確実です。
- スマホで使うには HTTPS の公開URLが必要です。iPhone は Safari の共有メニューの「ホーム画面に追加」で追加できます。

