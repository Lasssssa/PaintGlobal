"use client";

import { useEffect, useState } from "react";

interface Props {
  /** Unix timestamp (seconds) when the auction ends */
  endTime: bigint;
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return "Ended";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const hh = h.toString().padStart(2, "0");
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  if (d > 0) return `${d}d ${hh}:${mm}:${ss}`;
  return `${hh}:${mm}:${ss}`;
}

export default function CountdownTimer({ endTime }: Props) {
  const end = Number(endTime);
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, end - Math.floor(Date.now() / 1000))
  );

  useEffect(() => {
    const tick = () =>
      setRemaining(Math.max(0, end - Math.floor(Date.now() / 1000)));
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [end]);

  const ended = remaining === 0;

  return (
    <span
      className={`font-mono tabular-nums text-sm font-semibold ${
        ended ? "text-danger" : remaining < 3600 ? "text-accent" : "text-ink"
      }`}
    >
      {formatTime(remaining)}
    </span>
  );
}
