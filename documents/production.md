# 本番にするとき（まだやっていないこと）

- **本物のメールボックスを作る**: `backend/app/provision.py` の `Provisioner` を、MailcowのAPIを呼ぶ実装に差し替える。APIキーは環境変数にだけ置く。
- **メールの送受信**: Mailcowを置いたVPSと独自ドメイン（MX・SPF・DKIM・DMARC・逆引き）が必要。
- `SESSION_SECRET` を長いランダムな値にする（`.env.example` を参照）。HTTPSで公開するときは `COOKIE_SECURE=1`。本番は、ルートの `Dockerfile` で画面ごと1つのイメージにする。
- 回数制限はメモリ上なので、複数台にするときは置き場所を変える。
- 未実装: パスキー、メールを書く画面、スター・送信済み・下書き、メールの受信（いまのメールは「ようこそ」の1通だけ）。

