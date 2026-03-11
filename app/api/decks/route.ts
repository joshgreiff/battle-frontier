import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function normalizePokemonName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return `${trimmed[0].toUpperCase()}${trimmed.slice(1).toLowerCase()}`;
}

function normalizeDeckKey(formatCode: string, pokemon1: string, pokemon2?: string): string {
  const format = formatCode.toLowerCase().replace(/[^a-z0-9]/g, "");
  const p1 = pokemon1.toLowerCase().replace(/[^a-z0-9]/g, "");
  const p2 = (pokemon2 ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return p2 ? `${format}-${p1}-${p2}` : `${format}-${p1}`;
}

function toDisplayName(pokemon1: string, pokemon2?: string): string {
  return pokemon2 ? `${pokemon1} / ${pokemon2}` : pokemon1;
}

function normalizeNickname(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 32);
}

function isMissingNicknameColumn(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2022") return false;
  return String(error.meta?.column ?? "").includes("GroupDeck.nickname");
}

async function ensureMembership(groupId: string, userId: string) {
  return prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId } }
  });
}

function getGroupDeckClient() {
  const deckClient = (prisma as unknown as { groupDeck?: unknown }).groupDeck;
  if (!deckClient) {
    return null;
  }
  return deckClient as {
    findMany: (args: unknown) => Promise<unknown>;
    findUnique: (args: unknown) => Promise<unknown>;
    create: (args: unknown) => Promise<unknown>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get("groupId");
  const formatCode = searchParams.get("formatCode")?.trim().toUpperCase();
  if (!groupId) {
    return NextResponse.json({ error: "groupId is required" }, { status: 400 });
  }

  const membership = await ensureMembership(groupId, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deckClient = getGroupDeckClient();
  if (!deckClient) {
    return NextResponse.json(
      { error: "Deck model not ready in Prisma client. Run `npm run db:generate` and restart dev." },
      { status: 500 }
    );
  }

  let decks: unknown;
  try {
    decks = await deckClient.findMany({
      where: formatCode ? { groupId, formatCode } : { groupId },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        key: true,
        pokemon1: true,
        pokemon2: true,
        nickname: true,
        displayName: true,
        formatCode: true
      }
    });
  } catch (error) {
    if (!isMissingNicknameColumn(error)) throw error;
    // Backward compatibility for databases that have not added GroupDeck.nickname yet.
    const legacy = (await deckClient.findMany({
      where: formatCode ? { groupId, formatCode } : { groupId },
      orderBy: [{ createdAt: "asc" }],
      select: {
        id: true,
        key: true,
        pokemon1: true,
        pokemon2: true,
        displayName: true,
        formatCode: true
      }
    })) as Array<Record<string, unknown>>;
    decks = legacy.map((entry) => ({ ...entry, nickname: null }));
  }
  return NextResponse.json(decks);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    groupId?: string;
    formatCode?: string;
    pokemon1?: string;
    pokemon2?: string;
    nickname?: string;
  };

  if (!body.groupId) {
    return NextResponse.json({ error: "groupId is required" }, { status: 400 });
  }

  const membership = await ensureMembership(body.groupId, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deckClient = getGroupDeckClient();
  if (!deckClient) {
    return NextResponse.json(
      { error: "Deck model not ready in Prisma client. Run `npm run db:generate` and restart dev." },
      { status: 500 }
    );
  }

  const pokemon1 = normalizePokemonName(body.pokemon1 ?? "");
  const pokemon2 = normalizePokemonName(body.pokemon2 ?? "");
  const formatCode = (body.formatCode ?? "").trim().toUpperCase();
  const nickname = normalizeNickname(body.nickname ?? "");
  if (!pokemon1) {
    return NextResponse.json({ error: "Primary Pokemon is required" }, { status: 400 });
  }
  if (!formatCode) {
    return NextResponse.json({ error: "formatCode is required" }, { status: 400 });
  }
  if (pokemon1 === "Other" || pokemon2 === "Other") {
    return NextResponse.json({ error: "Use Other as a built-in fallback only" }, { status: 400 });
  }

  const key = normalizeDeckKey(formatCode, pokemon1, pokemon2 || undefined);
  const displayName = toDisplayName(pokemon1, pokemon2 || undefined);

  let existing: unknown;
  try {
    existing = await deckClient.findUnique({
      where: { groupId_key: { groupId: body.groupId, key } },
      select: {
        id: true,
        key: true,
        pokemon1: true,
        pokemon2: true,
        nickname: true,
        displayName: true,
        formatCode: true
      }
    });
  } catch (error) {
    if (!isMissingNicknameColumn(error)) throw error;
    const legacy = await deckClient.findUnique({
      where: { groupId_key: { groupId: body.groupId, key } },
      select: {
        id: true,
        key: true,
        pokemon1: true,
        pokemon2: true,
        displayName: true,
        formatCode: true
      }
    });
    existing = legacy
      ? { ...(legacy as Record<string, unknown>), nickname: null }
      : null;
  }
  if (existing) return NextResponse.json(existing, { status: 200 });

  let created: unknown;
  try {
    created = await deckClient.create({
      data: {
        groupId: body.groupId,
        formatCode,
        key,
        pokemon1,
        pokemon2: pokemon2 || null,
        nickname: nickname || null,
        displayName
      },
      select: {
        id: true,
        key: true,
        pokemon1: true,
        pokemon2: true,
        nickname: true,
        displayName: true,
        formatCode: true
      }
    });
  } catch (error) {
    if (!isMissingNicknameColumn(error)) throw error;
    const legacy = await deckClient.create({
      data: {
        groupId: body.groupId,
        formatCode,
        key,
        pokemon1,
        pokemon2: pokemon2 || null,
        displayName
      },
      select: {
        id: true,
        key: true,
        pokemon1: true,
        pokemon2: true,
        displayName: true,
        formatCode: true
      }
    });
    created = { ...(legacy as Record<string, unknown>), nickname: null };
  }
  return NextResponse.json(created, { status: 201 });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { groupId?: string; id?: string };
  if (!body.groupId || !body.id) {
    return NextResponse.json({ error: "groupId and id are required" }, { status: 400 });
  }

  const membership = await ensureMembership(body.groupId, session.user.id);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deckClient = getGroupDeckClient();
  if (!deckClient) {
    return NextResponse.json(
      { error: "Deck model not ready in Prisma client. Run `npm run db:generate` and restart dev." },
      { status: 500 }
    );
  }

  await deckClient.deleteMany({ where: { groupId: body.groupId, id: body.id } });
  return NextResponse.json({ ok: true });
}
