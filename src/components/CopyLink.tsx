"use client";

import { useEffect, useState } from "react";

/**
 * The single join link, with a copy button. The origin is filled in on mount so
 * the copied value is the real deployed URL rather than a bare path.
 */
export function JoinLink() {
  const [origin, setOrigin] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);

  const full = origin ? `${origin}/join` : "/join";

  return (
    <>
      <span className="mono">{full}</span>
      <button
        type="button"
        className="btn sm ghost"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(full);
            setDone(true);
            setTimeout(() => setDone(false), 1800);
          } catch {
            setDone(false);
          }
        }}
      >
        {done ? "Copied" : "Copy"}
      </button>
    </>
  );
}
