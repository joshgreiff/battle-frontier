import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type ParsedLine = {
  playerA: string;
  playerB: string;
  winner: string;
  archetypeA?: string;
  archetypeB?: string;
  formatCode?: string;
};

type FailedLine = {
  lineNumber: number;
  rawLine: string;
  reason: string;
};

function parseLine(line: string): ParsedLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const detailedPattern =
    /^(.+?)\s+vs\s+(.+?)\s*-\s*winner:\s*(.+?)\s*-\s*decks:\s*(.+?)\s+vs\s+(.+?)(?:\s*-\s*format:\s*([A-Z0-9/-]+))?$/i;
  const detailedMatch = trimmed.match(detailedPattern);
  if (detailedMatch) {
    return {
      playerA: detailedMatch[1].trim(),
      playerB: detailedMatch[2].trim(),
      winner: detailedMatch[3].trim(),
      archetypeA: detailedMatch[4].trim(),
      archetypeB: detailedMatch[5].trim(),
      formatCode: detailedMatch[6]?.trim().toUpperCase()
    };
  }

  const vsPattern = /^(.+?)\s+vs\s+(.+?)\s*-\s*winner:\s*(.+)$/i;
  const m = trimmed.match(vsPattern);
  if (!m) return null;

  return {
    playerA: m[1].trim(),
    playerB: m[2].trim(),
    winner: m[3].trim()
  };
}

function normalizePlayerName(value: string): string {
  return value.trim().replace(/[.:]$/, "");
}

function inferArchetypeFromPokemonCounts(counts: Map<string, number>): string {
  const top = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);
  if (top.length === 0) return "Other";
  if (top.length === 1) return top[0];
  return `${top[0]} / ${top[1]}`;
}

function parseFullTcgLiveLog(logText: string): ParsedLine | null {
  const lines = logText.split(/\r?\n/);
  const playerSet = new Set<string>();

  for (const line of lines) {
    const openingHand = line.match(/^(.+?) drew 7 cards for the opening hand\./);
    if (openingHand) playerSet.add(normalizePlayerName(openingHand[1]));
  }

  if (playerSet.size < 2) {
    for (const line of lines) {
      const genericAction = line.match(/^(.+?) (drew|played|attached|evolved|retreated)\b/);
      if (genericAction) playerSet.add(normalizePlayerName(genericAction[1]));
      if (playerSet.size >= 2) break;
    }
  }

  const players = Array.from(playerSet);
  if (players.length < 2) return null;
  const [playerA, playerB] = players;

  let winner: string | null = null;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    const inactiveWin = line.match(/inactive for too long\.\s+(.+?) wins\./i);
    if (inactiveWin) {
      winner = normalizePlayerName(inactiveWin[1]);
      break;
    }
    const basicWin = line.match(/^(.+?) wins\./);
    if (basicWin) {
      winner = normalizePlayerName(basicWin[1]);
      break;
    }

    const conceded = line.match(/^(.+?) (?:conceded|forfeited)\./i);
    if (conceded) {
      const loser = normalizePlayerName(conceded[1]).toLowerCase();
      if (playerA.toLowerCase() === loser) winner = playerB;
      else if (playerB.toLowerCase() === loser) winner = playerA;
      if (winner) break;
    }
  }
  if (!winner) return null;

  const pokemonByPlayer = new Map<string, Map<string, number>>([
    [playerA, new Map<string, number>()],
    [playerB, new Map<string, number>()]
  ]);

  function bumpPokemon(player: string, pokemonName: string) {
    if (!pokemonByPlayer.has(player)) return;
    const counts = pokemonByPlayer.get(player)!;
    const next = (counts.get(pokemonName) ?? 0) + 1;
    counts.set(pokemonName, next);
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    const playedPokemon = line.match(
      /^(.+?) played (.+?) to the (Active Spot|Bench)\./
    );
    if (playedPokemon) {
      bumpPokemon(
        normalizePlayerName(playedPokemon[1]),
        playedPokemon[2].trim()
      );
      continue;
    }

    const evolvedPokemon = line.match(/^(.+?) evolved .+? to (.+?) on the Bench\./);
    if (evolvedPokemon) {
      bumpPokemon(
        normalizePlayerName(evolvedPokemon[1]),
        evolvedPokemon[2].trim()
      );
      continue;
    }

    const usedMove = line.match(/^(.+?)'s (.+?) used /);
    if (usedMove) {
      bumpPokemon(normalizePlayerName(usedMove[1]), usedMove[2].trim());
      continue;
    }
  }

  const archetypeA = inferArchetypeFromPokemonCounts(
    pokemonByPlayer.get(playerA) ?? new Map()
  );
  const archetypeB = inferArchetypeFromPokemonCounts(
    pokemonByPlayer.get(playerB) ?? new Map()
  );

  return {
    playerA,
    playerB,
    winner,
    archetypeA,
    archetypeB
  };
}

function parseLogText(logText: string): {
  rows: ParsedLine[];
  failedRows: FailedLine[];
  totalLines: number;
} {
  const lines = logText.split(/\r?\n/);
  const rows: ParsedLine[] = [];
  const failedRows: FailedLine[] = [];

  lines.forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;

    const parsed = parseLine(raw);
    if (parsed) {
      rows.push(parsed);
    } else {
      failedRows.push({
        lineNumber: index + 1,
        rawLine: raw,
        reason:
          "Expected `PlayerA vs PlayerB - winner: PlayerA` or detailed decks/format pattern."
      });
    }
  });

  if (rows.length === 0) {
    const fullLog = parseFullTcgLiveLog(logText);
    if (fullLog) {
      return {
        rows: [fullLog],
        failedRows: [],
        totalLines: lines.length
      };
    }
  }

  return { rows, failedRows, totalLines: lines.length };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      logText?: string;
      groupId?: string;
      persist?: boolean;
    };
    if (!body.logText) {
      return NextResponse.json({ error: "logText is required" }, { status: 400 });
    }

    const parsedResult = parseLogText(body.logText);

    let savedImportId: string | null = null;
    if (body.persist && body.groupId) {
      const session = await getServerSession(authOptions);
      if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      const membership = await prisma.groupMember.findUnique({
        where: {
          groupId_userId: { groupId: body.groupId, userId: session.user.id }
        }
      });
      if (!membership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      try {
        const saved = await prisma.tcgLiveImport.create({
          data: {
            groupId: body.groupId,
            loggedByUserId: session.user.id,
            rawText: body.logText,
            totalLines: parsedResult.totalLines,
            parsedLines: parsedResult.rows.length,
            parsedRows: parsedResult.rows,
            failedRows: parsedResult.failedRows
          },
          select: { id: true }
        });
        savedImportId = saved.id;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") {
          return NextResponse.json(
            {
              error:
                "TCG Live import table is missing in this database. Run `npm run db:push` and retry."
            },
            { status: 500 }
          );
        }
        throw error;
      }
    }

    return NextResponse.json({
      totalLines: parsedResult.totalLines,
      parsedLines: parsedResult.rows.length,
      failedLines: parsedResult.failedRows.length,
      rows: parsedResult.rows,
      failedRows: parsedResult.failedRows,
      parseMessage:
        parsedResult.rows.length > 0
          ? `Parsed ${parsedResult.rows.length} row(s). ${parsedResult.failedRows.length} failed.`
          : "No valid rows parsed. Check the expected line format.",
      savedImportId
    });
  } catch (error) {
    console.error("TCG Live import route failure:", error);
    return NextResponse.json(
      {
        error: "TCG Live import failed on server. Verify DATABASE_URL and run `npm run db:push`."
      },
      { status: 500 }
    );
  }
}
