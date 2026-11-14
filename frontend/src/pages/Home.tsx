import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { AppGearIcon, AppMailIcon, BackIcon, MailIcon } from '../icons';
import { useMe } from '../me';
import { ErrorLine, useAction, useToast } from '../ui';
import type { SigninResult } from '../types';

interface ShellProps {
  title: string;
  lead: ReactNode;
  onBack?: () => void;
  above?: ReactNode;
  disabled: boolean;
  busy: boolean;
  error: string;
  onSubmit: () => void;
  children: ReactNode;
}

/** サインイン前の画面の枠（iPhoneのセットアップ画面ふう） */
function IosShell({ title, lead, onBack, above, disabled, busy, error, onSubmit, children }: ShellProps) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <div className="ios">
      <div className="ios-top">
        {onBack && (
          <button className="back linkbtn" type="button" onClick={onBack}><BackIcon />戻る</button>
        )}
      </div>
      <div className="ios-head">
        <div className="logo"><MailIcon size={40} color="#fff" /></div>
        <h1>{title}</h1>
        <p>{lead}</p>
      </div>
      <form noValidate onSubmit={submit}>
        {children}
        <ErrorLine error={error} />
        <div className="ios-bottom">
          {above}
          <button className="ios-btn" type="submit" disabled={disabled || busy}>続ける</button>
        </div>
      </form>
    </div>
  );
}

type Step = 'address' | 'password' | 'code';

export default function Home() {
  const { me } = useMe();
  if (me.active != null) return <HomeApps />;
  return <SignIn />;
}

function SignIn() {
  const { refresh } = useMe();
  const toast = useToast();
  const [step, setStep] = useState<Step>('address');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState('');
  const [hint, setHint] = useState('');
  const { error, busy, run } = useAction();

  if (step === 'address') {
    return (
      <IosShell
        title="Muscat Account"
        lead={<>メールやその他のサービスを使うには、<br />メールアドレスでサインインしてください。</>}
        above={<Link className="ios-btn outline" to="/settings/create/1">新規作成</Link>}
        disabled={!address.trim()}
        busy={false}
        error=""
        onSubmit={() => setStep('password')}
      >
        <input
          className="ios-input" name="address" aria-label="メールアドレス" placeholder="メールアドレス"
          autoComplete="username" autoCapitalize="none" spellCheck={false} autoFocus
          value={address} onChange={(e) => setAddress(e.target.value)}
        />
      </IosShell>
    );
  }

  if (step === 'password') {
    return (
      <IosShell
        title="パスワードを入力"
        lead={<>{address.trim()}<br />のパスワードを入力してください。</>}
        onBack={() => setStep('address')}
        disabled={!password}
        busy={busy}
        error={error}
        onSubmit={() =>
          run(async () => {
            const r = await api<SigninResult>('/signin', { address: address.trim(), password });
            if ('needCode' in r) {
              setTicket(r.ticket);
              setHint(r.hint);
              setStep('code');
              return;
            }
            setPassword('');
            await refresh(); // サインイン済みになると、ホーム画面に切り替わる
          })
        }
      >
        <input
          className="ios-input" name="password" type="password" aria-label="パスワード" placeholder="パスワード"
          autoComplete="current-password" autoFocus
          value={password} onChange={(e) => setPassword(e.target.value)}
        />
        <Link className="textlink center" to="/settings/forgot">パスワードをお忘れの場合</Link>
      </IosShell>
    );
  }

  return (
    <IosShell
      title="確認コードを入力"
      lead={<>登録した連絡先（{hint}）に<br />6桁のコードを送りました。</>}
      onBack={() => setStep('password')}
      disabled={!code.trim()}
      busy={busy}
      error={error}
      onSubmit={() =>
        run(async () => {
          await api('/verify', { ticket, code: code.trim() });
          setPassword('');
          setCode('');
          await refresh();
        })
      }
    >
      <input
        className="ios-input code" name="code" inputMode="numeric" maxLength={6} aria-label="6桁のコード"
        placeholder="000000" autoComplete="one-time-code" autoFocus
        value={code} onChange={(e) => setCode(e.target.value)}
      />
      <button
        className="textlink center" type="button"
        onClick={async () => {
          try {
            await api('/resend', { ticket });
            toast('コードを再送しました。');
          } catch (err) {
            toast(err instanceof Error ? err.message : 'うまくいきませんでした。');
          }
        }}
      >
        コードを再送する
      </button>
    </IosShell>
  );
}

/** サインイン後のホーム: iPhoneのホーム画面のように、アプリを並べるだけ */
function HomeApps() {
  return (
    <div className="homescreen">
      <nav className="grid" aria-label="アプリ">
        <Link className="app" to="/settings">
          <span className="tile app-gear"><AppGearIcon /></span>
          <span className="label">設定</span>
        </Link>
        <Link className="app" to="/mail">
          <span className="tile app-mail"><AppMailIcon /></span>
          <span className="label">メール</span>
        </Link>
      </nav>
    </div>
  );
}
