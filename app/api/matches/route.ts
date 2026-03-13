import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createMatchSchema, updateMatchResultSchema } from "@/lib/validation";

function normalizeArchetypePiece(value: string): string {
  const cleaned = value
    .trim()
    .replace(/’/g, "'")
    .replace(/^(\([^)]*\)\s*)+/g, "")
    .replace(/^[a-z0-9 .-]+'s\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const aliasKey = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const aliasToDeck: Record<string, string> = {
    dreepy: "Dragapult",
    dreep: "Dragapult",
    drakloak: "Dragapult",
    gimmighoul: "Gholdengo"
  };
  return aliasToDeck[aliasKey] ?? cleaned;
}

function normalizeArchetypeLabel(value: string): string {
  const parts = value
    .split("/")
    .map((piece) => normalizeArchetypePiece(piece))
    .filter(Boolean)
    .slice(0, 2);
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(part);
  }
  if (deduped.length === 0) return "Other";
  return deduped.join(" / ");
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get("groupId");
  if (!groupId) {
    return NextResponse.json({ error: "groupId is required" }, { status: 400 });
  }

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: session.user.id } }
  });
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formatCode = searchParams.get("formatCode");

  const matches = await prisma.match.findMany({
    where: {
      groupId,
      ...(formatCode ? { formatCode } : {})
    },
    orderBy: { playedAt: "desc" }
  });

  return NextResponse.json(matches);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createMatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid match payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const membership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId: parsed.data.groupId, userId: session.user.id }
    }
  });
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const match = await prisma.match.create({
    data: {
      ...parsed.data,
      archetypeA: normalizeArchetypeLabel(parsed.data.archetypeA),
      archetypeB: normalizeArchetypeLabel(parsed.data.archetypeB),
      loggedByUserId: session.user.id,
      loggedByName: session.user.name ?? session.user.email ?? "Member"
    }
  });
  return NextResponse.json(match, { status: 201 });
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = updateMatchResultSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid match update payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const membership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId: parsed.data.groupId, userId: session.user.id }
    }
  });
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const existing = await prisma.match.findFirst({
    where: { id: parsed.data.matchId, groupId: parsed.data.groupId },
    select: { id: true, loggedByUserId: true }
  });
  if (!existing) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (existing.loggedByUserId !== session.user.id) {
    return NextResponse.json({ error: "You can only edit logs you posted." }, { status: 403 });
  }

  const updated = await prisma.match.update({
    where: { id: parsed.data.matchId },
    data: {
      archetypeA: normalizeArchetypeLabel(parsed.data.archetypeA),
      archetypeB: normalizeArchetypeLabel(parsed.data.archetypeB),
      winnerSide: parsed.data.winnerSide
    }
  });

  return NextResponse.json(updated);
}
