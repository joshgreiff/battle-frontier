import { hash } from "bcryptjs";
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

  const passwordHash = await hash(parsed.data.password, 10);

  let inviteCode = generateInviteCode();
  for (let attempts = 0; attempts < 5; attempts += 1) {
    const exists = await prisma.group.findUnique({ where: { inviteCode } });
    if (!exists) break;
    inviteCode = generateInviteCode();
  }

  const group = await prisma.group.create({
    data: {
      name: parsed.data.name,
      ownerId: session.user.id,
      inviteCode,
      passwordHash,
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
