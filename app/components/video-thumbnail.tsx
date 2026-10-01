"use client";
import { useState } from "react";
export function Thumbnail({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  return <div className="flex aspect-video items-center justify-center bg-slate-800 text-sm text-slate-400">
    {url && !failed ?
      // External thumbnails intentionally bypass the server image proxy; no server-side URL fetch.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(true)} /> : <span>動画教材</span>}
  </div>;
}
