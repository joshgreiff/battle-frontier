import type { MatchupCell } from "@/lib/analytics/matchup";

export type MetaEntry = {
  archetypeId: string;
  sharePct: number;
};

export type DeckRecommendation = {
  archetypeId: string;
  expectedWinRate: number;
};

export function recommendDecks(
  deckIds: string[],
  cells: MatchupCell[],
  meta: MetaEntry[]
): DeckRecommendation[] {
  const byPair = new Map<string, MatchupCell>();
  for (const c of cells) byPair.set(`${c.deckId}::${c.oppId}`, c);

  const normalizedTotal = meta.reduce((sum, m) => sum + m.sharePct, 0);
  const normMeta = meta.map((m) => ({
    archetypeId: m.archetypeId,
    share:
      normalizedTotal > 0 ? m.sharePct / normalizedTotal : 1 / Math.max(meta.length, 1)
  }));

  const result = deckIds.map((deckId) => {
    let expected = 0;
    for (const opp of normMeta) {
      if (deckId === opp.archetypeId) {
        expected += opp.share * 0.5;
        continue;
      }

      const cell = byPair.get(`${deckId}::${opp.archetypeId}`);
      const winRate = cell?.smoothedWinRate ?? 0.5;
      expected += opp.share * winRate;
    }
    return { archetypeId: deckId, expectedWinRate: expected };
  });

  return result.sort((a, b) => b.expectedWinRate - a.expectedWinRate);
}
