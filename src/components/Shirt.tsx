/**
 * The shirt-number block. Shows the rank number, or — once faces exist — a
 * square cut-out filling the block. Squares, not circles: circles fight the
 * geometry. Drop a square image at /public/faces/<slug>.jpg and set
 * avatar_url to /faces/<slug>.jpg in admin; nothing else needs to change.
 */
export function Shirt({
  rank,
  name,
  avatarUrl,
  lead = false,
}: {
  rank: number | null;
  name: string;
  avatarUrl?: string | null;
  lead?: boolean;
}) {
  if (avatarUrl) {
    return (
      <div className="num">
        {/* Plain img: these are 5–8 hand-cropped local squares, not a CDN. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl} alt="" />
      </div>
    );
  }
  return (
    <div className="num">
      {rank === null ? (
        <span className="initials">{initials(name)}</span>
      ) : (
        <b>{rank}</b>
      )}
      <span className="sr">{lead ? "Leading" : ""}</span>
    </div>
  );
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
