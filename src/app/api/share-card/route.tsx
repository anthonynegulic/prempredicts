import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { shortClub } from "@/lib/clubs";
import {
  countAnswered,
  getEntrantById,
  getOwnPicks,
  getQuestions,
  isLocked,
  getActiveSeason,
} from "@/lib/data";
import { getSessionEntrantId } from "@/lib/entrant-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const W = 1080;
const H = 1350;

const BLUE = "#1633f5";
const BLUE_DK = "#0b1a8f";
const ACID = "#d9ff35";
const BONE = "#f3f1e8";
const INK = "#0c0d12";
const GREY = "#8b8e9c";

/**
 * Satori renders a subset of CSS: no grid, and repeating gradients are not
 * dependable. Every pattern below is therefore built from explicit flex
 * children, which also keeps the stripe widths exactly on the reference values.
 */
/**
 * Satori honours explicit top/left/width/height but silently drops the `inset`
 * shorthand — with `inset: 0` these overlays collapse and the band paints flat.
 * Every positioned layer below is therefore sized explicitly.
 */
function Stripes({ height }: { height: number }) {
  const cols = [];
  for (let x = 0; x < W; x += 52) {
    cols.push(
      <div key={x} style={{ display: "flex", width: 52, height }}>
        <div style={{ width: 26, height, background: BLUE_DK }} />
        <div style={{ width: 26, height, background: BLUE }} />
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        position: "absolute",
        top: 0,
        left: 0,
        width: W,
        height,
      }}
    >
      {cols}
    </div>
  );
}

function Pinstripe({ height }: { height: number }) {
  const cols = [];
  for (let x = 0; x < W; x += 13) {
    cols.push(
      <div key={x} style={{ display: "flex", width: 13, height }}>
        <div style={{ width: 2, height, background: "rgba(255,255,255,0.14)" }} />
        <div style={{ width: 11, height }} />
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        position: "relative",
        width: W,
        height,
        background: BLUE,
      }}
    >
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          width: W,
          height,
        }}
      >
        {cols}
      </div>
    </div>
  );
}

/**
 * The bolt, as an SVG data URI. Satori will not resolve an <svg> child into a
 * repeating <pattern>, but it does render an <img>, so the chevrons stay crisp
 * exactly as the brief requires — no gradient fakery.
 */
function boltDataUri(width: number, height: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<defs><pattern id="b" width="56" height="34" patternUnits="userSpaceOnUse">` +
    `<path d="M0 26 L14 6 L28 26 L42 6 L56 26 L56 34 L42 14 L28 34 L14 14 L0 34 Z" fill="${BLUE_DK}"/>` +
    `</pattern></defs>` +
    `<rect width="100%" height="100%" fill="${BLUE}"/>` +
    `<rect width="100%" height="100%" fill="url(#b)"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/**
 * Reads a bundled font off disk.
 *
 * Not `fetch(new URL(..., import.meta.url))` — the bundler leaves that as a
 * file: URL and Node's fetch cannot read those ("not implemented... yet").
 * next.config.ts adds outputFileTracingIncludes so these two files ship with
 * this route on Vercel rather than being traced away.
 */
function loadFont(name: string): Buffer {
  const path = join(process.cwd(), "src", "assets", "fonts", name);
  try {
    return readFileSync(path);
  } catch (e) {
    throw new Error(
      `Share card font missing at ${path}. Check outputFileTracingIncludes in ` +
        `next.config.ts. (${e instanceof Error ? e.message : String(e)})`
    );
  }
}

export async function GET() {
  const entrantId = await getSessionEntrantId();
  if (!entrantId) {
    return new Response("Sign in first.", { status: 401 });
  }

  const season = await getActiveSeason();
  if (!season) return new Response("No active season.", { status: 404 });

  const entrant = await getEntrantById(entrantId);
  if (!entrant || entrant.season_id !== season.id) {
    return new Response("Not found.", { status: 404 });
  }

  const [questions, picks] = await Promise.all([
    getQuestions(season.id),
    getOwnPicks(entrant.id),
  ]);

  const answered = countAnswered(questions, picks);
  if (answered < questions.length) {
    return new Response("Finish all ten picks first.", { status: 409 });
  }

  const locked = isLocked(season);

  const valueOf = (qid: number, slot: number) =>
    picks.find((p) => p.question_id === qid && p.slot_index === slot)?.raw_value ?? "";

  const rowsFor = (key: string): { label: string; value: string } | null => {
    const q = questions.find((x) => x.key === key);
    if (!q) return null;
    const vals = Array.from({ length: q.slot_count }, (_, i) =>
      valueOf(q.id, i)
    ).filter(Boolean);
    const isClub = q.input_type !== "free_text";
    return {
      label: q.label,
      value: vals.map((v) => (isClub ? shortClub(v) : v)).join(" · "),
    };
  };

  const order = [
    "league_winner",
    "top_four",
    "positions_5_6_7",
    "relegated_three",
    "player_of_season",
    "young_player_of_season",
    "top_scorer",
    "most_assists",
    "first_manager_sacked",
    "wildcard",
  ];
  const rows = order.map(rowsFor).filter(Boolean) as {
    label: string;
    value: string;
  }[];

  const cond = loadFont("SairaCondensed-Black.ttf");
  const body = loadFont("Saira-SemiBold.ttf");

  const lockLine = locked
    ? "Locked · Premier League " + season.label.replace("-", "/")
    : "Picks lock 21 August · Premier League " + season.label.replace("-", "/");

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          flexDirection: "column",
          background: BONE,
          fontFamily: "Saira",
        }}
      >
        {/* ===== 01 FLAT — hero ===== */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            background: BLUE,
            padding: "46px 54px 40px",
          }}
        >
          <div
            style={{
              fontSize: 20,
              letterSpacing: 6,
              color: ACID,
              fontWeight: 600,
              textTransform: "uppercase",
            }}
          >
            {lockLine}
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Saira Condensed",
              fontSize: 132,
              lineHeight: 0.84,
              color: "#fff",
              textTransform: "uppercase",
              marginTop: 18,
            }}
          >
            Predictions
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: "Saira Condensed",
              fontSize: 132,
              lineHeight: 0.84,
              color: ACID,
              textTransform: "uppercase",
            }}
          >
            League
          </div>
        </div>

        {/* ===== 02 STRIPES — the name plate ===== */}
        <div
          style={{
            display: "flex",
            position: "relative",
            width: W,
            height: 132,
            alignItems: "center",
          }}
        >
          <Stripes height={132} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              position: "relative",
              padding: "0 54px",
            }}
          >
            <div
              style={{
                display: "flex",
                fontFamily: "Saira Condensed",
                fontSize: 68,
                lineHeight: 1,
                color: "#fff",
                textTransform: "uppercase",
              }}
            >
              {entrant.display_name}
            </div>
            {entrant.club_affiliation ? (
              <div
                style={{
                  fontSize: 19,
                  letterSpacing: 4,
                  color: "rgba(255,255,255,0.8)",
                  textTransform: "uppercase",
                  fontWeight: 600,
                  marginTop: 6,
                }}
              >
                {shortClub(entrant.club_affiliation)}
              </div>
            ) : null}
          </div>
        </div>

        {/* ===== 03 BOLT — real SVG pattern rule, one clean chevron band ===== */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={boltDataUri(W, 34)} width={W} height={34} style={{ display: "flex" }} alt="" />

        {/* ===== picks, on flat bone — never on a pattern ===== */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "34px 54px 0",
            flexGrow: 1,
          }}
        >
          {rows.map((r, i) => (
            <div
              key={r.label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                background: "#fff",
                border: `3px solid ${INK}`,
                borderTopWidth: i === 0 ? 3 : 0,
                padding: "14px 20px",
              }}
            >
              <div
                style={{
                  fontSize: 17,
                  letterSpacing: 3,
                  color: GREY,
                  textTransform: "uppercase",
                  fontWeight: 600,
                  flexShrink: 0,
                  paddingRight: 20,
                }}
              >
                {r.label}
              </div>
              <div
                style={{
                  display: "flex",
                  fontFamily: "Saira Condensed",
                  fontSize: 34,
                  lineHeight: 1,
                  color: INK,
                  textTransform: "uppercase",
                  textAlign: "right",
                }}
              >
                {r.value}
              </div>
            </div>
          ))}
        </div>

        {/* ===== 06 PINSTRIPE — footer ===== */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 30 }}>
          <Pinstripe height={72} />
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Saira Condensed", data: cond, weight: 900, style: "normal" },
        { name: "Saira", data: body, weight: 600, style: "normal" },
      ],
      headers: {
        // Private to this entrant; never let a CDN hold on to it.
        "Cache-Control": "private, no-store",
      },
    }
  );
}
