"use client";

import { useState } from "react";

type Status = "idle" | "working" | "shared" | "downloaded" | "error";

/**
 * Renders the entrant's picks to a branded PNG server-side, then hands it to
 * the OS share sheet so it lands in the group chat as an image.
 *
 * navigator.share with files is the mobile path (iOS Safari 15+, Android
 * Chrome). Desktop browsers mostly can't share files, so there we download the
 * PNG instead and the person drags it into the chat.
 *
 * In-app browsers (Messenger, Instagram, and similar embedded webviews) often
 * pass the canShare() feature check but then reject the actual share() call
 * with a NotAllowedError — the host app restricts the Web Share API even
 * though the API exists. That's caught here and treated the same as "no
 * share support": fall back to download rather than surface a raw platform
 * error the entrant can't act on.
 */
export function ShareButton({
  complete,
  locked,
}: {
  complete: boolean;
  locked: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [detail, setDetail] = useState<string | null>(null);

  if (!complete) {
    return (
      <p className="hint" style={{ margin: 0 }}>
        Answer all ten and a share card appears here
      </p>
    );
  }

  async function share() {
    setStatus("working");
    setDetail(null);
    try {
      const res = await fetch("/api/share-card", { cache: "no-store" });
      if (!res.ok) throw new Error(`Card failed (${res.status})`);
      const blob = await res.blob();
      const file = new File([blob], "predictions-league.png", {
        type: "image/png",
      });

      const text = locked
        ? "My ten. Locked in."
        : "My ten are in. Picks lock 21 August.";

      if (
        typeof navigator !== "undefined" &&
        navigator.canShare?.({ files: [file] })
      ) {
        try {
          await navigator.share({ files: [file], text });
          setStatus("shared");
          return;
        } catch (shareErr) {
          // Cancelling the share sheet throws AbortError — not a failure.
          if (shareErr instanceof DOMException && shareErr.name === "AbortError") {
            setStatus("idle");
            return;
          }
          // Anything else (typically NotAllowedError from an in-app browser
          // that blocks sharing) falls through to the download below.
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "predictions-league.png";
      a.click();
      URL.revokeObjectURL(url);
      setStatus("downloaded");
    } catch (e) {
      setStatus("error");
      setDetail(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  return (
    <div className="sharebar">
      <button
        type="button"
        className="btn"
        onClick={share}
        disabled={status === "working"}
      >
        {status === "working" ? "Making the card…" : "Share my picks"}
      </button>
      <span className="savestate" role="status" aria-live="polite">
        {status === "shared"
          ? "Sent"
          : status === "downloaded"
            ? "PNG downloaded — drop it in the chat. If nothing happened, open this page in Safari or Chrome instead of the app browser, then try again"
            : status === "error"
              ? (detail ?? "Couldn't make the card")
              : "Sends a branded PNG to your group chat"}
      </span>
    </div>
  );
}
