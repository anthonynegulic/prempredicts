"use client";

import { useEffect, useState } from "react";

/**
 * Shows an entrant's magic link and copies it. Renders the path on the server
 * and fills in the origin on mount, so the copied value is always the full URL
 * regardless of where this is deployed.
 */
export function CopyLink({ path }: { path: string }) {
  const [origin, setOrigin] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => setOrigin(window.location.origin), []);

  const full = origin ? `${origin}${path}` : path;

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
