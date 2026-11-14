import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { api, messageOf } from '../api';
import { BackWhiteIcon } from '../icons';
import { useMe } from '../me';
import type { VideoItem, VideoResult } from '../types';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export default function Video() {
  const { me } = useMe();
  // サインインしていなければ、ホームのサインイン画面へ
  if (me.active == null) return <Navigate to="/" replace />;
  return (
    <Routes>
      <Route index element={<VideoList />} />
      <Route path=":id" element={<VideoPlayer />} />
      <Route path="*" element={<Navigate to="/video" replace />} />
    </Routes>
  );
}

function VideoList() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<VideoResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setResult(null);
    setError('');
    api<VideoResult>(`/video/search?q=${encodeURIComponent(query)}`)
      .then((r) => { if (alive) setResult(r); })
      .catch((err) => { if (alive) setError(messageOf(err)); });
    return () => { alive = false; };
  }, [query]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setQuery(input.trim());
  };

  return (
    <div className="vapp">
      <div className="vbar">
        <Link className="vback" to="/"><BackWhiteIcon />ホーム</Link>
        <h1>ビデオ</h1>
      </div>
      <form className="vsearch" role="search" onSubmit={submit}>
        <input
          type="search" name="q" aria-label="動画を検索" placeholder="動画を検索" enterKeyHint="search"
          autoComplete="off" value={input} onChange={(e) => setInput(e.target.value)}
        />
      </form>
      {result?.sample && (
        <p className="vnote">YouTubeのキーが未設定なので、サンプルを表示しています。</p>
      )}
      {error && <p className="vmsg" role="alert">{error}</p>}
      {!error && result === null && <p className="vmsg">読み込み中…</p>}
      {result && result.items.length === 0 && (
        <p className="vmsg">見つかりませんでした。別のことばで探してください。</p>
      )}
      {result && (
        <ul className="vlist">
          {result.items.map((v, i) => (
            <li key={v.id}>
              <Link className="vrow" to={`/video/${v.id}`} state={{ title: v.title, channel: v.channel }}>
                <span className={`vthumb k${i % 5}`}>
                  {v.thumb && <img src={v.thumb} alt="" loading="lazy" />}
                </span>
                <span className="vtext">
                  <span className="vtitle">{v.title}</span>
                  <span className="vchan">{v.channel}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VideoPlayer() {
  const { id = '' } = useParams();
  const info = useLocation().state as Pick<VideoItem, 'title' | 'channel'> | null;
  const canPlay = VIDEO_ID.test(id);
  return (
    <div className="vapp">
      <div className="vbar">
        <Link className="vback" to="/video"><BackWhiteIcon />ビデオ</Link>
      </div>
      <div className="vplayer">
        {canPlay ? (
          <iframe
            title={info?.title ?? '動画'}
            src={`https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <p>サンプルなので、再生はできません。</p>
        )}
      </div>
      {info && (
        <div className="vinfo">
          <h2>{info.title}</h2>
          <p>{info.channel}</p>
        </div>
      )}
    </div>
  );
}
