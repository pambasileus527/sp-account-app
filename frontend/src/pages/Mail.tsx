import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { api, messageOf } from '../api';
import {
  AddPersonIcon, BackIcon, CloseIcon, DraftIcon, InboxIcon, ManageIcon, PlusIcon, SearchIcon, SentIcon, StarIcon,
} from '../icons';
import { activeAccount, useMe } from '../me';
import type { MailDetail, MailSummary } from '../types';
import { avatarClass, initialOf, useToast } from '../ui';

function formatTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (diff === 1) return '昨日';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatFull(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function Mail() {
  const { me } = useMe();
  // サインインしていなければ、ホームのサインイン画面へ
  if (me.active == null) return <Navigate to="/" replace />;
  return (
    <Routes>
      <Route index element={<MailList />} />
      <Route path=":id" element={<MailView />} />
      <Route path="*" element={<Navigate to="/mail" replace />} />
    </Routes>
  );
}

function MailList() {
  const { me, refresh } = useMe();
  const toast = useToast();
  const navigate = useNavigate();
  const [mails, setMails] = useState<MailSummary[] | null>(null);
  const [error, setError] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const a = activeAccount(me);

  // 一覧を開くたびと、アカウントを切り替えたときに読み直す（未読の数も新しくする）
  useEffect(() => {
    setMails(null);
    api<MailSummary[]>('/mails').then(setMails).catch((err) => setError(messageOf(err)));
    refresh().catch(() => {});
  }, [me.active, refresh]);

  const soon = () => toast('この機能は準備中です。');
  const switchTo = useCallback(async (id: number) => {
    if (id !== me.active) {
      await api('/switch', { id });
      await refresh();
    }
    setPanelOpen(false);
  }, [me.active, refresh]);

  if (!a) return null;
  if (error) return <div className="screen"><p className="error">{error}</p></div>;

  const tab = (label: string, Icon: typeof InboxIcon, on = false) => (
    <button className={`tab${on ? ' on' : ''}`} type="button" onClick={soon}>
      <Icon color={on ? '#0e7c86' : '#4f5b63'} />{label}
    </button>
  );

  return (
    <>
      <div className="mail">
        <div className="mailhead">
          <div className="bar">
            <h1>受信トレイ</h1>
            <button className={`avbtn ${avatarClass(a.address)}`} type="button" aria-label="アカウントを開く" onClick={() => setPanelOpen(true)}>
              {a.initial}
            </button>
          </div>
          <div className="search"><SearchIcon />メールを検索</div>
        </div>
        <div className="mails">
          {mails === null ? null : mails.length === 0 ? (
            <div className="empty">メールはまだありません。</div>
          ) : (
            mails.map((m) => (
              <button key={m.id} className={`m${m.unread ? ' unread' : ''}`} type="button" onClick={() => navigate(`/mail/${m.id}`)}>
                <span className={avatarClass(m.from)}>{initialOf(m.from)}</span>
                <span className="body">
                  <span className="l1"><span className="name">{m.from}</span><span className="time">{formatTime(m.receivedAt)}</span></span>
                  <span className="subj">{m.subject}</span>
                  <span className="l3"><span className="prev">{m.preview}</span><i className="dot" /></span>
                </span>
              </button>
            ))
          )}
        </div>
        <button className="fab" type="button" onClick={soon}><PlusIcon />作成</button>
        <div className="tabs">
          {tab('受信', InboxIcon, true)}{tab('スター', StarIcon)}{tab('送信済み', SentIcon)}{tab('下書き', DraftIcon)}
        </div>
      </div>
      {panelOpen && (
        <>
          <button className="scrim" type="button" aria-label="閉じる" onClick={() => setPanelOpen(false)} />
          <div className="sheet" role="dialog" aria-label="アカウント">
            <div className="t">
              <button className="x" type="button" aria-label="閉じる" onClick={() => setPanelOpen(false)} autoFocus><CloseIcon /></button>
              <b>Muscat Account</b>
              <span className="x" />
            </div>
            <div className="me">
              <span className={`${avatarClass(a.address)}`}>{a.initial}</span>
              <div><b>{a.name}</b><span>{a.address}</span></div>
            </div>
            <div className="manage"><Link className="btn ghost" to="/settings/account">Muscat Account を管理</Link></div>
            <hr />
            {me.accounts.map((acc) => (
              <button key={acc.id} className="acct" type="button" onClick={() => switchTo(acc.id).catch((err) => toast(messageOf(err)))}>
                <span className={avatarClass(acc.address)}>{acc.initial}</span>
                <span className="w"><b>{acc.name}</b><span>{acc.address}</span></span>
                <span className="n">{acc.id === me.active ? '使用中' : `未読 ${acc.unread}`}</span>
              </button>
            ))}
            <Link className="act" to="/settings/signin"><AddPersonIcon />別のアカウントを追加</Link>
            <Link className="act" to="/settings/account"><ManageIcon />このデバイスのアカウントを管理</Link>
            <hr />
            <div className="legal"><span>プライバシー ポリシー</span><span aria-hidden="true">·</span><span>利用規約</span></div>
          </div>
        </>
      )}
    </>
  );
}

function MailView() {
  const { id } = useParams();
  const [mail, setMail] = useState<MailDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setMail(null);
    api<MailDetail>(`/mails/${encodeURIComponent(id ?? '')}`).then(setMail).catch((err) => setError(messageOf(err)));
  }, [id]);

  if (error) {
    return (
      <div className="detail">
        <Link className="back" to="/mail"><BackIcon />受信トレイ</Link>
        <p className="error">{error}</p>
      </div>
    );
  }
  if (!mail) return null;
  return (
    <div className="detail">
      <Link className="back" to="/mail"><BackIcon />受信トレイ</Link>
      <h1>{mail.subject}</h1>
      <div className="meta">
        <span className={avatarClass(mail.from)}>{initialOf(mail.from)}</span>
        <div><b>{mail.from}</b><span>{mail.fromAddress} ・ {formatFull(mail.receivedAt)}</span></div>
      </div>
      <pre>{mail.body}</pre>
    </div>
  );
}
