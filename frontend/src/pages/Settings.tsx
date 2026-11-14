import { createContext, useContext, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api } from '../api';
import {
  BackIcon, BellIcon, GuestIcon, LockIcon, MailIcon, PersonIcon, SearchIcon, ShieldIcon, Svg,
} from '../icons';
import { activeAccount, useMe } from '../me';
import type { SigninResult } from '../types';
import { ErrorLine, avatarClass, useAction, useToast } from '../ui';

/* ---------- 画面をまたいで持ち回る入力（アドレスを作る途中、確認コードの宛先など） ---------- */
interface Signup {
  sei: string; mei: string; y: string; m: string; d: string; local: string; contact: string;
}

interface Flow {
  signup: Signup;
  ticket: string | null;
  purpose: 'signin' | 'reset' | null;
  hint: string | null;
  resetToken: string | null;
}

const EMPTY_FLOW: Flow = {
  signup: { sei: '', mei: '', y: '', m: '', d: '', local: '', contact: '' },
  ticket: null, purpose: null, hint: null, resetToken: null,
};

interface FlowValue {
  flow: Flow;
  update: (patch: Partial<Flow>) => void;
  updateSignup: (patch: Partial<Signup>) => void;
}

const FlowContext = createContext<FlowValue | null>(null);

function useFlow(): FlowValue {
  const value = useContext(FlowContext);
  if (!value) throw new Error('Settings の外では使えません');
  return value;
}

export default function Settings() {
  const [flow, setFlow] = useState<Flow>(EMPTY_FLOW);
  const value: FlowValue = {
    flow,
    update: (patch) => setFlow((f) => ({ ...f, ...patch })),
    updateSignup: (patch) => setFlow((f) => ({ ...f, signup: { ...f.signup, ...patch } })),
  };
  return (
    <FlowContext.Provider value={value}>
      <Routes>
        <Route index element={<Start />} />
        <Route path="signin" element={<SignIn />} />
        <Route path="create/1" element={<Create1 />} />
        <Route path="create/2" element={<Create2 />} />
        <Route path="create/3" element={<Create3 />} />
        <Route path="create/4" element={<Create4 />} />
        <Route path="forgot" element={<Forgot />} />
        <Route path="verify" element={<Verify />} />
        <Route path="newpass" element={<NewPass />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/settings" replace />} />
      </Routes>
    </FlowContext.Provider>
  );
}

/* ---------- 共通の部品 ---------- */
const Back = ({ to }: { to: string }) => <Link className="back" to={to}><BackIcon />戻る</Link>;

function Submit({ children, busy }: { children: ReactNode; busy: boolean }) {
  return <button className="btn" type="submit" disabled={busy}>{children}</button>;
}

function Form({ onSubmit, children }: { onSubmit: () => void; children: ReactNode }) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return <form noValidate onSubmit={submit}>{children}</form>;
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="field"><label htmlFor={id}>{label}</label>{children}</div>;
}

function StepHead({ n, title, lead, back }: { n: number; title: string; lead: string; back: string }) {
  return (
    <>
      <div className="top"><Back to={back} /><span className="step">{n} / 4</span></div>
      <div className="head"><h1 className="title">{title}</h1><p className="lead">{lead}</p></div>
    </>
  );
}

/* ---------- 設定（サインイン前・後） ---------- */
function Start() {
  const { me } = useMe();
  const a = activeAccount(me);
  const Mini = ({ children }: { children: ReactNode }) => <Svg size={18} color="#fff">{children}</Svg>;
  const Item = ({ cls, icon, label }: { cls: string; icon: ReactNode; label: string }) => (
    <Link className="item" to="/settings"><span className={`ico ${cls}`}>{icon}</span>{label}</Link>
  );
  return (
    <div className="side">
      <div className="dots" aria-hidden="true"><i className="r" /><i className="y" /><i className="g" /></div>
      <div className="search"><SearchIcon />検索</div>
      {a ? (
        <Link className="signin-row" to="/settings/account">
          <span className="av pfp me">{a.initial}</span>
          <span className="who"><b>{a.name}</b><span>{a.address}</span></span>
        </Link>
      ) : (
        <Link className="signin-row" to="/settings/signin">
          <span className="av pfp"><GuestIcon /></span>
          <span className="who"><b>サインイン</b><span>Muscat Accountで<br />サインイン</span></span>
        </Link>
      )}
      <div className="items">
        <Item cls="c-blue" label="メールアドレス" icon={<Mini><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M4 7.5l8 6 8-6" /></Mini>} />
        <Item cls="c-green" label="接続状況" icon={<Mini><path d="M3 12h4l3-7 4 14 3-7h4" /></Mini>} />
        <Item cls="c-gray" label="ストレージ" icon={<Mini><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" /><path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></Mini>} />
      </div>
      <div className="items">
        <Item cls="c-gray" label="一般" icon={<Mini><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></Mini>} />
        <Item cls="c-teal" label="外観" icon={<Mini><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2" /></Mini>} />
        <Item cls="c-red" label="通知" icon={<Mini><path d="M6 8a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7z" /><path d="M10 19a2 2 0 0 0 4 0" /></Mini>} />
        <Item cls="c-purple" label="プライバシーとセキュリティ" icon={<Mini><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Mini>} />
      </div>
    </div>
  );
}

/* ---------- サインイン ---------- */
function SignIn() {
  const { me, refresh } = useMe();
  const { update } = useFlow();
  const navigate = useNavigate();
  const toast = useToast();
  const { error, busy, run } = useAction();
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  return (
    <div className="screen">
      <Back to="/settings" />
      <div className="hero">
        <div className="logo"><MailIcon size={40} color="#fff" /></div>
        <h1 className="title center">Muscat Account<br />にサインイン</h1>
        <p className="lead center">自分だけのアドレスを作って、<br />メールの送受信と設定をひとつの場所で。</p>
      </div>
      <Form onSubmit={() => run(async () => {
        const r = await api<SigninResult>('/signin', { address, password });
        if ('needCode' in r) {
          update({ ticket: r.ticket, purpose: 'signin', hint: r.hint });
          navigate('/settings/verify');
          return;
        }
        await refresh();
        navigate('/settings/account');
      })}>
        <Field id="address" label="メールアドレス">
          <input
            className="input" id="address" autoComplete="username" autoCapitalize="none" spellCheck={false}
            placeholder={`name@${me.domain}`} value={address} onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
        <Field id="password" label="パスワード">
          <input
            className="input" id="password" type="password" autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <ErrorLine error={error} />
        <Submit busy={busy}>続ける</Submit>
      </Form>
      <div className="divider">または</div>
      <button className="btn ghost" type="button" onClick={() => toast('パスキーは準備中です。')}><PersonIcon />パスキーでサインイン</button>
      <div className="spacer" />
      <div className="links"><Link to="/settings/forgot">パスワードをお忘れの場合</Link><Link to="/settings/create/1">アドレスを新しく作る</Link></div>
    </div>
  );
}

/* ---------- アドレスを新しく作る（4ステップ） ---------- */
function Create1() {
  const { flow, updateSignup } = useFlow();
  const navigate = useNavigate();
  const { error, busy, run } = useAction();
  const [sei, setSei] = useState(flow.signup.sei);
  const [mei, setMei] = useState(flow.signup.mei);
  return (
    <div className="screen">
      <StepHead n={1} title="名前を入力" lead="アカウントに表示する名前です。あとから変えられます。" back="/settings/signin" />
      <Form onSubmit={() => run(async () => {
        if (!sei.trim() || !mei.trim()) throw new Error('姓と名を入力してください。');
        updateSignup({ sei: sei.trim(), mei: mei.trim() });
        navigate('/settings/create/2');
      })}>
        <div className="row">
          <Field id="sei" label="姓"><input className="input" id="sei" autoComplete="family-name" placeholder="山田" value={sei} onChange={(e) => setSei(e.target.value)} /></Field>
          <Field id="mei" label="名"><input className="input" id="mei" autoComplete="given-name" placeholder="太郎" value={mei} onChange={(e) => setMei(e.target.value)} /></Field>
        </div>
        <ErrorLine error={error} />
        <Submit busy={busy}>次へ</Submit>
      </Form>
    </div>
  );
}

function Create2() {
  const { flow, updateSignup } = useFlow();
  const navigate = useNavigate();
  const { error, busy, run } = useAction();
  const [y, setY] = useState(flow.signup.y);
  const [m, setM] = useState(flow.signup.m);
  const [d, setD] = useState(flow.signup.d);
  return (
    <div className="screen">
      <StepHead n={2} title="生年月日を入力" lead="年齢の確認に使います。ほかの人には表示されません。" back="/settings/create/1" />
      <Form onSubmit={() => run(async () => {
        if (!/^\d{4}$/.test(y.trim()) || !/^\d{1,2}$/.test(m.trim()) || !/^\d{1,2}$/.test(d.trim())) {
          throw new Error('年は4桁、月と日は数字で入力してください。');
        }
        updateSignup({ y: y.trim(), m: m.trim(), d: d.trim() });
        navigate('/settings/create/3');
      })}>
        <div className="row">
          <Field id="y" label="年"><input className="input" id="y" inputMode="numeric" autoComplete="bday-year" placeholder="1990" value={y} onChange={(e) => setY(e.target.value)} /></Field>
          <Field id="m" label="月"><input className="input" id="m" inputMode="numeric" autoComplete="bday-month" placeholder="1" value={m} onChange={(e) => setM(e.target.value)} /></Field>
          <Field id="d" label="日"><input className="input" id="d" inputMode="numeric" autoComplete="bday-day" placeholder="1" value={d} onChange={(e) => setD(e.target.value)} /></Field>
        </div>
        <ErrorLine error={error} />
        <Submit busy={busy}>次へ</Submit>
      </Form>
    </div>
  );
}

function Create3() {
  const { me } = useMe();
  const { flow, updateSignup } = useFlow();
  const navigate = useNavigate();
  const { error, busy, run } = useAction();
  const [local, setLocal] = useState(flow.signup.local);
  return (
    <div className="screen">
      <StepHead n={3} title="アドレスを決める" lead="英小文字、数字、ピリオド、ハイフン、アンダースコアが使えます。" back="/settings/create/2" />
      <Form onSubmit={() => run(async () => {
        const value = local.trim().toLowerCase();
        await api('/signup/check', { local: value });
        updateSignup({ local: value });
        navigate('/settings/create/4');
      })}>
        <Field id="local" label="アドレス">
          <div className="addr">
            <input id="local" autoCapitalize="none" autoComplete="off" spellCheck={false} placeholder="好きな名前" value={local} onChange={(e) => setLocal(e.target.value)} />
            <span>@{me.domain}</span>
          </div>
        </Field>
        <ErrorLine error={error} />
        <Submit busy={busy}>次へ</Submit>
      </Form>
    </div>
  );
}

function Create4() {
  const { refresh } = useMe();
  const { flow, update, updateSignup } = useFlow();
  const navigate = useNavigate();
  const { error, busy, run } = useAction();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [contact, setContact] = useState(flow.signup.contact);
  const s = flow.signup;
  return (
    <div className="screen">
      <StepHead n={4} title="パスワードを決める" lead="忘れにくくて、ほかで使っていないものにしてください。12文字以上です。" back="/settings/create/3" />
      <Form onSubmit={() => run(async () => {
        if (pw !== pw2) throw new Error('パスワードが一致しません。');
        updateSignup({ contact: contact.trim() });
        await api('/signup', {
          sei: s.sei, mei: s.mei, birth: { y: s.y, m: s.m, d: s.d }, local: s.local, password: pw, contact: contact.trim(),
        });
        update({ signup: EMPTY_FLOW.signup });
        await refresh();
        navigate('/settings/account');
      })}>
        <Field id="pw" label="パスワード"><input className="input" id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field id="pw2" label="パスワードの確認"><input className="input" id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        <Field id="contact" label="連絡先のメール（任意）">
          <input className="input" id="contact" type="email" autoComplete="email" placeholder="you@example.com" value={contact} onChange={(e) => setContact(e.target.value)} />
        </Field>
        <ErrorLine error={error} />
        <Submit busy={busy}>アドレスを作成</Submit>
      </Form>
      <div className="spacer" />
      <p className="foot">連絡先のメールは、パスワードを忘れたときと、新しい端末で入るときの確認にだけ使います。あとから追加もできます。</p>
    </div>
  );
}

/* ---------- パスワード再設定・確認コード ---------- */
function Forgot() {
  const { me } = useMe();
  const { update } = useFlow();
  const navigate = useNavigate();
  const { error, busy, run } = useAction();
  const [address, setAddress] = useState('');
  return (
    <div className="screen">
      <Back to="/settings/signin" />
      <div className="head">
        <h1 className="title">パスワードを再設定</h1>
        <p className="lead">アドレスを入れると、登録した連絡先に6桁のコードを送ります。</p>
      </div>
      <Form onSubmit={() => run(async () => {
        const r = await api<{ ticket: string }>('/reset/request', { address });
        update({ ticket: r.ticket, purpose: 'reset', hint: null });
        navigate('/settings/verify');
      })}>
        <Field id="address" label="メールアドレス">
          <input
            className="input" id="address" autoComplete="username" autoCapitalize="none" spellCheck={false}
            placeholder={`name@${me.domain}`} value={address} onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
        <ErrorLine error={error} />
        <Submit busy={busy}>コードを送る</Submit>
      </Form>
      <div className="spacer" />
      <p className="foot">連絡先を登録していないアドレスは、再設定できません。</p>
    </div>
  );
}

function Verify() {
  const { refresh } = useMe();
  const { flow, update } = useFlow();
  const navigate = useNavigate();
  const toast = useToast();
  const { error, busy, run } = useAction();
  const [code, setCode] = useState('');
  if (!flow.ticket) return <Navigate to="/settings/signin" replace />;
  const lead = flow.purpose === 'reset' || !flow.hint
    ? 'アドレスの登録があれば、登録した連絡先に6桁のコードを送りました。10分以内に入力してください。'
    : `登録した連絡先（${flow.hint}）に6桁のコードを送りました。10分以内に入力してください。`;
  return (
    <div className="screen">
      <Back to={flow.purpose === 'reset' ? '/settings/forgot' : '/settings/signin'} />
      <div className="head"><h1 className="title">確認コードを入力</h1><p className="lead">{lead}</p></div>
      <Form onSubmit={() => run(async () => {
        const r = await api<{ resetToken?: string; ok?: boolean }>('/verify', { ticket: flow.ticket, code: code.trim() });
        if (r.resetToken) {
          update({ resetToken: r.resetToken });
          navigate('/settings/newpass');
          return;
        }
        update({ ticket: null });
        await refresh();
        navigate('/settings/account');
      })}>
        <Field id="code" label="6桁のコード">
          <input
            className="input code" id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <ErrorLine error={error} />
        <Submit busy={busy}>確認する</Submit>
      </Form>
      <div className="stack">
        <button
          className="linkbtn" type="button"
          onClick={async () => {
            try {
              await api('/resend', { ticket: flow.ticket });
              toast('コードを再送しました。');
            } catch (err) {
              toast(err instanceof Error ? err.message : 'うまくいきませんでした。');
            }
          }}
        >
          コードを再送する
        </button>
        <button className="linkbtn" type="button" onClick={() => toast('パスキーは準備中です。')}>パスキーを使う</button>
      </div>
      <div className="spacer" />
      <p className="foot">コードが届かないときは、迷惑メールフォルダも確認してください。</p>
    </div>
  );
}

function NewPass() {
  const { refresh } = useMe();
  const { flow, update } = useFlow();
  const navigate = useNavigate();
  const toast = useToast();
  const { error, busy, run } = useAction();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  if (!flow.resetToken) return <Navigate to="/settings/forgot" replace />;
  return (
    <div className="screen">
      <div className="head">
        <h1 className="title">新しいパスワード</h1>
        <p className="lead">12文字以上で、ほかで使っていないものにしてください。</p>
      </div>
      <Form onSubmit={() => run(async () => {
        if (pw !== pw2) throw new Error('パスワードが一致しません。');
        await api('/reset/complete', { resetToken: flow.resetToken, password: pw });
        update({ resetToken: null, ticket: null });
        toast('パスワードを変更しました。');
        await refresh();
        navigate('/settings/account');
      })}>
        <Field id="pw" label="新しいパスワード"><input className="input" id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field id="pw2" label="パスワードの確認"><input className="input" id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        <ErrorLine error={error} />
        <Submit busy={busy}>パスワードを変更</Submit>
      </Form>
    </div>
  );
}

/* ---------- アカウント設定 ---------- */
function AccountPage() {
  const { me, refresh } = useMe();
  const navigate = useNavigate();
  const toast = useToast();
  const { run } = useAction();
  const a = activeAccount(me);
  if (!a) return <Navigate to="/settings/signin" replace />;
  const Line = ({ icon, label, value }: { icon: ReactNode; label: string; value: string }) => (
    <button className="line" type="button" onClick={() => toast('この項目は準備中です。')}>
      {icon}<span className="grow">{label}</span><span className="val">{value}</span>
    </button>
  );
  return (
    <div className="screen">
      <h2 className="big">設定</h2>
      <div className="profile">
        <span className={avatarClass(a.address)}>{a.initial}</span>
        <div><b>{a.name}</b><div className="sub">{a.address}</div></div>
      </div>
      <div className="list">
        <Line icon={<MailIcon size={22} color="#0e7c86" />} label="連絡先のメール" value={a.contact || '未設定'} />
        <Line icon={<PersonIcon />} label="パスキーとログイン" value="準備中" />
        <Line icon={<ShieldIcon />} label="2段階認証" value="新しい端末で確認" />
        <Line icon={<BellIcon />} label="通知" value="" />
        <Line icon={<LockIcon />} label="プライバシー" value="" />
      </div>
      <div className="list"><Link className="line" to="/settings/signin"><span className="grow">別のアカウントを追加</span></Link></div>
      <button
        className="btn danger" type="button"
        onClick={() => run(async () => {
          await api('/signout', {});
          await refresh();
          navigate('/settings');
        })}
      >
        サインアウト
      </button>
      <Link className="back" to="/">ホーム画面へ</Link>
    </div>
  );
}
