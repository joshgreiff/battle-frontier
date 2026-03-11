import { NextResponse } from "next/server";
import { buildMatchupCells, type MatchRow } from "@/lib/analytics/matchup";
import { recommendDecks, type MetaEntry } from "@/lib/analytics/recommendation";

type RecommendationRequest = {
  deckIds: string[];
  matches: MatchRow[];
  meta: MetaEntry[];
};

export async function POST(req: Request) {
  const body = (await req.json()) as RecommendationRequest;
  if (!body.deckIds?.length) {
    return NextResponse.json({ error: "deckIds is required" }, { status: 400 });
  }
  if (!body.meta?.length) {
    return NextResponse.json({ error: "meta is required" }, { status: 400 });
  }

  const cells = buildMatchupCells(body.matches ?? []);
  const recommendations = recommendDecks(body.deckIds, cells, body.meta);

  return NextResponse.json({ recommendations });
}
