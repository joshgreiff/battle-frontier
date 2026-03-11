export type MatchRow = {
  archetypeAId: string;
  archetypeBId: string;
  winnerSide: "A" | "B";
};

export type MatchupCell = {
  deckId: string;
  oppId: string;
  games: number;
  wins: number;
  rawWinRate: number;
  smoothedWinRate: number;
};

type PairStats = { games: number; winsForFirst: number };

function pairKey(a: string, b: string): string {
  return `${a}::${b}`;
}

export function buildMatchupCells(matches: MatchRow[]): MatchupCell[] {
  const stats = new Map<string, PairStats>();

  for (const m of matches) {
    const directKey = pairKey(m.archetypeAId, m.archetypeBId);
    const reverseKey = pairKey(m.archetypeBId, m.archetypeAId);

    const direct = stats.get(directKey) ?? { games: 0, winsForFirst: 0 };
    direct.games += 1;
    if (m.winnerSide === "A") {
      direct.winsForFirst += 1;
    }
    stats.set(directKey, direct);

    const reverse = stats.get(reverseKey) ?? { games: 0, winsForFirst: 0 };
    reverse.games += 1;
    if (m.winnerSide === "B") {
      reverse.winsForFirst += 1;
    }
    stats.set(reverseKey, reverse);
  }

  const cells: MatchupCell[] = [];
  for (const [key, value] of stats) {
    const [deckId, oppId] = key.split("::");
    const rawWinRate = value.games > 0 ? value.winsForFirst / value.games : 0;
    const smoothedWinRate = (value.winsForFirst + 1) / (value.games + 2);

    cells.push({
      deckId,
      oppId,
      games: value.games,
      wins: value.winsForFirst,
      rawWinRate,
      smoothedWinRate
    });
  }
  return cells;
}
