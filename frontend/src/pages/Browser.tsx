import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BackWhiteIcon } from '../icons';
import { useMe } from '../me';

export default function Browser() {
  const { me } = useMe();
  const [q, setQ] = useState('');
  if (me.active == null) return <Navigate to="/" replace />;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = q.trim();
    if (!text) return;
    // Googleは、ほかのページの中に埋め込めないので、別のウィンドウで開く
    window.open(`https://www.google.com/search?q=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="vapp">
      <div className="vbar">
        <Link className="vback" to="/"><BackWhiteIcon />ホーム</Link>
        <h1>ブラウザ</h1>
      </div>
      <form className="vsearch" role="search" onSubmit={submit}>
        <input
          type="search" name="q" aria-label="Googleで検索" placeholder="Googleで検索" enterKeyHint="search"
          autoComplete="off" autoFocus value={q} onChange={(e) => setQ(e.target.value)}
        />
      </form>
      <p className="vnote">検索結果は、別のウィンドウで開きます。</p>
    </div>
  );
}
