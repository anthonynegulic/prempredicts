import type { ReactNode } from "react";

/**
 * Pattern assignment is permanent — the pattern IS the navigation, so it must
 * never shuffle. Stripes always means standings. Bolt always means top four.
 *
 * Intensity tracks how public the page is: pinstripe on admin is deliberate,
 * the quietest pattern on the least public page. Follow that for new sections.
 */
export const PATTERNS = {
  flat: { cls: "pat-flat", n: "01", name: "Flat", use: "Hero / entry form" },
  stripes: { cls: "pat-stripes", n: "02", name: "Vertical stripes", use: "Standings" },
  bolt: { cls: "pat-bolt", n: "03", name: "Bolt", use: "Top four" },
  sash: { cls: "pat-sash", n: "04", name: "Sash", use: "Golden boot / assists" },
  halves: { cls: "pat-halves", n: "05", name: "Halves", use: "Relegation / wildcards" },
  pinstripe: { cls: "pat-pinstripe", n: "06", name: "Pinstripe", use: "Admin / footer" },
  // 07 Hoops is spare — reserved for a future season archive. Not used yet.
} as const;

export type PatternKey = keyof typeof PATTERNS;

/**
 * The bolt must be an inline SVG <pattern>. CSS gradient zigzags go fuzzy at
 * the joints. Each instance needs its own id so multiple bolts on one page
 * don't collide.
 */
function Bolt({ id }: { id: string }) {
  return (
    <svg width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <pattern id={id} width="56" height="34" patternUnits="userSpaceOnUse">
          <path
            d="M0 26 L14 6 L28 26 L42 6 L56 26 L56 34 L42 14 L28 34 L14 14 L0 34 Z"
            fill="#0b1a8f"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}

export function Banner({
  pattern,
  children,
  tight = true,
  showLabel = true,
  id,
}: {
  pattern: PatternKey;
  children: ReactNode;
  tight?: boolean;
  showLabel?: boolean;
  id?: string;
}) {
  const p = PATTERNS[pattern];
  const boltId = `bolt-${id ?? pattern}`;
  return (
    <section className="banner">
      <div className={`pat ${p.cls}`}>
        {pattern === "bolt" ? <Bolt id={boltId} /> : null}
      </div>
      <div className={`wrap banner-in${tight ? " banner-tight" : ""}`}>
        {children}
        {showLabel ? (
          <p className="bsub">
            Pattern {p.n} · {p.name}
          </p>
        ) : null}
      </div>
    </section>
  );
}
