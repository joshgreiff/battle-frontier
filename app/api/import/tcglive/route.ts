import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
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

  return { rows, failedRows, totalLines: lines.length };
}

export async function POST(req: Request) {
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
}
