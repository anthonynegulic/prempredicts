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
        await navigator.share({ files: [file], text });
        setStatus("shared");
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "predictions-league.png";
      a.click();
      URL.revokeObjectURL(url);
      setStatus("downloaded");
    } catch (e) {
      // A cancelled share sheet throws AbortError. That isn't a failure.
      if (e instanceof DOMException && e.name === "AbortError") {
        setStatus("idle");
        return;
      }
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
            ? "PNG saved — drop it in the chat"
            : status === "error"
              ? (detail ?? "Couldn't make the card")
              : "Sends a branded PNG to your group chat"}
      </span>
    </div>
  );
}
