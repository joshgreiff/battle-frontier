import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createMatchSchema } from "@/lib/validation";

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
      loggedByUserId: session.user.id,
      loggedByName: session.user.name ?? session.user.email ?? "Member"
    }
  });
  return NextResponse.json(match, { status: 201 });
}
