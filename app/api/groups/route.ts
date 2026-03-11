import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createGroupSchema } from "@/lib/validation";

function generateInviteCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const groups = await prisma.groupMember.findMany({
    where: { userId: session.user.id },
    include: {
      group: {
        select: { id: true, name: true, inviteCode: true, ownerId: true, createdAt: true }
      }
    },
    orderBy: { joinedAt: "desc" }
  });

  return NextResponse.json(groups.map((membership) => membership.group));
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = createGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid group payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const inviteCode = parsed.data.inviteCode.toUpperCase();
  const existingGroup = await prisma.group.findUnique({ where: { inviteCode } });
  if (existingGroup) {
    return NextResponse.json(
      { error: "Invite code already in use. Try another code." },
      { status: 409 }
    );
  }

  const group = await prisma.group.create({
    data: {
      name: parsed.data.name,
      ownerId: session.user.id,
      inviteCode: inviteCode || generateInviteCode(),
      // Compatibility: DB still has non-null legacy group passwordHash.
      passwordHash: "",
      members: {
        create: [{ userId: session.user.id, role: "owner" }]
      }
    }
  });

  return NextResponse.json(
    { id: group.id, name: group.name, inviteCode: group.inviteCode, createdAt: group.createdAt },
    { status: 201 }
  );
}
