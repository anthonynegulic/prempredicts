"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    mins: Math.floor((s % 3600) / 60),
    secs: s % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Counts down to lock in the viewer's own timezone. lockAt arrives as a UTC
 * ISO string; the browser does the conversion, so 20:00 BST reads as 05:00
 * Saturday for anyone in Australia without us hardcoding either offset.
 *
 * Renders placeholders until mounted — the server has no idea what timezone
 * the viewer is in, and guessing produces a hydration mismatch.
 */
export function Countdown({
  lockAt,
  locked,
}: {
  lockAt: string;
  locked: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const target = new Date(lockAt).getTime();
  const isLocked = locked || (now !== null && now >= target);

  if (isLocked) {
    return (
      <div className="facts" role="status">
        <div className="fact hot">
          <b>Locked</b>
          <i>Picks are final</i>
        </div>
      </div>
    );
  }

  const p = now === null ? null : parts(target - now);

  return (
    <>
      <div className="cd" role="timer" aria-live="off">
        <div>
          <b>{p ? p.days : "--"}</b>
          <i>Days</i>
        </div>
        <div>
          <b>{p ? pad(p.hours) : "--"}</b>
          <i>Hours</i>
        </div>
        <div>
          <b>{p ? pad(p.mins) : "--"}</b>
          <i>Mins</i>
        </div>
        <div>
          <b>{p ? pad(p.secs) : "--"}</b>
          <i>Secs</i>
        </div>
      </div>
      <p className="bsub">
        {now === null ? (
          "Picks lock 21 August 2026"
        ) : (
          <>
            Picks lock{" "}
            {new Intl.DateTimeFormat(undefined, {
              weekday: "short",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
              timeZoneName: "short",
            }).format(new Date(lockAt))}{" "}
            · your time
          </>
        )}
      </p>
    </>
  );
}
