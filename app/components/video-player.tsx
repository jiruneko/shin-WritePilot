"use client";
import { useRef, useState } from "react";
import { renewPlayback } from "@/app/videos/actions";
export function VideoPlayer({ src, id }: { src: string; id: string }) {
  const player = useRef<HTMLVideoElement>(null);
  const position = useRef(0);
  const wasPlaying = useRef(false);
  const recovering = useRef(false);
  const autoRetried = useRef(false);
  const [url, setUrl] = useState(src);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function recover() {
    if (recovering.current) return;
    recovering.current = true; setPending(true); setError("");
    try {
      const result = await renewPlayback(id);
      if (!result.url) { setError(result.error ?? "再生できませんでした。"); return; }
      setUrl(result.url);
      // load() also handles a retry receiving the same signed URL within one second.
      if (player.current) { player.current.src = result.url; player.current.load(); }
    } catch { setError("通信に失敗しました。"); }
    finally { recovering.current = false; setPending(false); }
  }
  return <div><video ref={player} className="aspect-video w-full rounded-2xl bg-black" src={url} controls playsInline preload="metadata"
    onTimeUpdate={() => { if (player.current && player.current.currentTime > 0) position.current = player.current.currentTime; }}
    onPlay={() => { wasPlaying.current = true; }}
    onPause={() => { if (!player.current?.error) wasPlaying.current = false; }}
    onLoadedMetadata={() => {
      if (player.current && position.current > 0) {
        player.current.currentTime = position.current;
        if (wasPlaying.current) void player.current.play().catch(() => undefined);
      }
    }}
    onPlaying={() => { autoRetried.current = false; }}
    onError={() => {
      if (!autoRetried.current) { autoRetried.current = true; void recover(); }
      else setError("再生できませんでした。通信状態や動画形式を確認してください。");
    }}>動画の再生に対応したブラウザーをお使いください。</video>
    {pending && <p role="status" className="mt-4 text-sky-200">再生URLを更新しています…</p>}
    {error && <div className="mt-4 space-y-3"><p role="alert" className="text-red-200">{error}</p><button className="button-secondary" disabled={pending} onClick={() => { autoRetried.current = true; void recover(); }}>再生を再試行</button></div>}
  </div>;
}
