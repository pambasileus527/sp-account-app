// 「本物のメールアドレス（メールボックス）を作る」処理の差し込み口。
//
// いまは手元で動かすだけなので、アカウントをデータベースに入れる以外は何もしない。
// 本番では、この2つをMailcowのAPIを呼ぶ処理に差し替える。
// （APIキーはサーバーの環境変数にだけ置き、画面側には出さない）
export const localProvisioner = {
  // そのアドレスをメールサーバー側で作れるか
  async isAvailable(_address) {
    return true;
  },
  // メールサーバー側にメールボックスを作る
  async create(_mailbox) {
    return { ok: true };
  },
};
