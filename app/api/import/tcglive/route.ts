import { NextResponse } from "next/server";

type ParsedLine = {
  playerA: string;
  playerB: string;
  winner: string;
};

function parseLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const vsPattern = /^(.+?)\s+vs\s+(.+?)\s*-\s*winner:\s*(.+)$/i;
  const m = trimmed.match(vsPattern);
  if (!m) return null;

  return {
    playerA: m[1].trim(),
    playerB: m[2].trim(),
    winner: m[3].trim()
  };
}

export async function POST(req: Request) {
  const body = (await req.json()) as { logText?: string };
  if (!body.logText) {
    return NextResponse.json({ error: "logText is required" }, { status: 400 });
  }

  const lines = body.logText.split(/\r?\n/);
  const parsed = lines
    .map(parseLine)
    .filter((line): line is ParsedLine => line !== null);

  return NextResponse.json({
    totalLines: lines.length,
    parsedLines: parsed.length,
    rows: parsed
  });
}
