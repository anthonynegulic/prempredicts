// Premier League 2026/27. Stored as data so a promotion surprise is one edit.
export const CLUBS = [
  "Arsenal",
  "Aston Villa",
  "Bournemouth",
  "Brentford",
  "Brighton & Hove Albion",
  "Chelsea",
  "Coventry City",
  "Crystal Palace",
  "Everton",
  "Fulham",
  "Hull City",
  "Ipswich Town",
  "Leeds United",
  "Liverpool",
  "Manchester City",
  "Manchester United",
  "Newcastle United",
  "Nottingham Forest",
  "Sunderland",
  "Tottenham Hotspur",
] as const;

export type Club = (typeof CLUBS)[number];

export function isClub(value: string): value is Club {
  return (CLUBS as readonly string[]).includes(value);
}

// Short forms for the reveal board, where horizontal room is scarce.
const SHORT: Record<string, string> = {
  "Arsenal": "Arsenal",
  "Aston Villa": "Villa",
  "Bournemouth": "Bournemouth",
  "Brentford": "Brentford",
  "Brighton & Hove Albion": "Brighton",
  "Chelsea": "Chelsea",
  "Coventry City": "Coventry",
  "Crystal Palace": "Palace",
  "Everton": "Everton",
  "Fulham": "Fulham",
  "Hull City": "Hull",
  "Ipswich Town": "Ipswich",
  "Leeds United": "Leeds",
  "Liverpool": "Liverpool",
  "Manchester City": "Man City",
  "Manchester United": "Man Utd",
  "Newcastle United": "Newcastle",
  "Nottingham Forest": "Forest",
  "Sunderland": "Sunderland",
  "Tottenham Hotspur": "Spurs",
};

export function shortClub(name: string | null | undefined): string {
  if (!name) return "";
  return SHORT[name] ?? name;
}

// Three-letter tags for the relegation panel.
const TAG: Record<string, string> = {
  "Arsenal": "ARS",
  "Aston Villa": "AVL",
  "Bournemouth": "BOU",
  "Brentford": "BRE",
  "Brighton & Hove Albion": "BHA",
  "Chelsea": "CHE",
  "Coventry City": "COV",
  "Crystal Palace": "CRY",
  "Everton": "EVE",
  "Fulham": "FUL",
  "Hull City": "HUL",
  "Ipswich Town": "IPS",
  "Leeds United": "LEE",
  "Liverpool": "LIV",
  "Manchester City": "MCI",
  "Manchester United": "MUN",
  "Newcastle United": "NEW",
  "Nottingham Forest": "NFO",
  "Sunderland": "SUN",
  "Tottenham Hotspur": "TOT",
};

export function clubTag(name: string | null | undefined): string {
  if (!name) return "—";
  return TAG[name] ?? name.slice(0, 3).toUpperCase();
}
