import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { api, messageOf } from '../api';
import type { AdminUser, SigninResult } from '../types';
import { ErrorLine } from '../ui';

const fmt = (ms: number) => new Date(ms).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' });

type State =
  | { kind: 'loading' }
  | { kind: 'signin'; message: string }
  | { kind: 'disabled' }
  | { kind: 'ready'; users: AdminUser[] };

export default function Admin() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  // この画面だけ、表が入るように横幅を広げる
  useEffect(() => {
    const el = document.getElementById('app');
    el?.classList.add('wide');
    return () => el?.classList.remove('wide');
  }, []);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/users', { credentials: 'same-origin' });
    if (res.status === 200) return setState({ kind: 'ready', users: (await res.json()) as AdminUser[] });
    if (res.status === 404) return setState({ kind: 'disabled' });
    if (res.status === 401) return setState({ kind: 'signin', message: '' });
    if (res.status === 403) {
      return setState({ kind: 'signin', message: 'このアカウントは管理者ではありません。管理者のアカウントでサインインしてください。' });
    }
    return setState({ kind: 'signin', message: '読み込めませんでした。もう一度お試しください。' });
  }, []);

  useEffect(() => {
    load().catch((err) => setState({ kind: 'signin', message: messageOf(err) }));
  }, [load]);

  if (state.kind === 'loading') return null;
  if (state.kind === 'disabled') {
    return (
      <div className="screen">
        <div className="head">
          <h1 className="title">管理画面は無効です</h1>
          <p className="lead">サーバーの ADMIN_ADDRESSES に管理者のアドレスを設定してください。</p>
        </div>
      </div>
    );
  }
  if (state.kind === 'signin') return <AdminSignIn message={state.message} onDone={load} />;
  return <UserTable users={state.users} onChanged={load} />;
}

function AdminSignIn({ message, onDone }: { message: string; onDone: () => Promise<void> }) {
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState(message);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (ticket) {
        await api('/verify', { ticket, code: code.trim() });
      } else {
        const r = await api<SigninResult>('/signin', { address, password });
        if ('needCode' in r) {
          setTicket(r.ticket);
          setHint(r.hint);
          return;
        }
      }
      await onDone();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <div className="head">
        <h1 className="title">管理画面</h1>
        <p className="lead">{ticket ? `${hint} に届いたコードを入力してください。` : '管理者のアカウントでサインインしてください。'}</p>
      </div>
      <form noValidate onSubmit={submit}>
        {ticket ? (
          <div className="field">
            <label htmlFor="c">確認コード</label>
            <input className="input" id="c" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="a">アドレス</label>
              <input className="input" id="a" autoComplete="username" autoCapitalize="none" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="p">パスワード</label>
              <input className="input" id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </>
        )}
        <ErrorLine error={error} />
        <button className="btn" type="submit" disabled={busy}>{ticket ? '確認' : 'サインイン'}</button>
      </form>
    </div>
  );
}

function UserTable({ users, onChanged }: { users: AdminUser[]; onChanged: () => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [armed, setArmed] = useState<number | null>(null);
  const [failed, setFailed] = useState<{ id: number; message: string } | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const q = query.trim().toLowerCase();
  const rows = q ? users.filter((u) => `${u.name} ${u.address} ${u.contact ?? ''}`.toLowerCase().includes(q)) : users;

  const press = async (id: number) => {
    window.clearTimeout(timer.current);
    if (armed !== id) { // 1回目: 確認の状態にする（4秒で元に戻る）
      setFailed(null);
      setArmed(id);
      timer.current = window.setTimeout(() => setArmed(null), 4000);
      return;
    }
    try {
      await api('/admin/delete', { id });
      setArmed(null);
      await onChanged();
    } catch (err) {
      setArmed(null);
      setFailed({ id, message: messageOf(err) });
    }
  };

  const label = (id: number) => (failed?.id === id ? failed.message : armed === id ? 'もう一度押すと削除' : '削除');

  return (
    <div className="admin">
      <div className="admin-bar">
        <h1>登録済みアカウント <span className="muted">{users.length}件</span></h1>
        <button className="btn ghost" type="button" onClick={() => onChanged()}>再読み込み</button>
      </div>
      <input className="input" placeholder="名前・アドレスで絞り込む" aria-label="絞り込み" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="tablewrap">
        <table>
          <thead>
            <tr><th>ID</th><th>名前</th><th>アドレス</th><th>連絡先</th><th>作成日時</th><th>メール</th><th /></tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="muted">該当するアカウントはありません。</td></tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id}>
                  <td className="num">{u.id}</td>
                  <td>{u.name}</td>
                  <td>{u.address}</td>
                  <td>{u.contact ?? <span className="muted">未登録</span>}</td>
                  <td>{fmt(u.createdAt)}</td>
                  <td className="num">{u.mails}（未読 {u.unread}）</td>
                  <td>
                    <button className={`btn-del${armed === u.id ? ' armed' : ''}`} type="button" onClick={() => press(u.id)}>
                      {label(u.id)}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="foot">パスワードは保存されていますが、元に戻せない形（ハッシュ）なので、ここには出ません。</p>
    </div>
  );
}
