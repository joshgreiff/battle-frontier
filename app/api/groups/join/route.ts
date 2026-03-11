import { compare } from "bcryptjs";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { joinGroupSchema } from "@/lib/validation";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = joinGroupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid join payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const group = await prisma.group.findUnique({
    where: { inviteCode: parsed.data.inviteCode.toUpperCase() }
  });
  if (!group) {
    return NextResponse.json({ error: "Group not found" }, { status: 404 });
  }

  const passwordOk = await compare(parsed.data.password, group.passwordHash);
  if (!passwordOk) {
    return NextResponse.json({ error: "Incorrect group password" }, { status: 403 });
  }

  await prisma.groupMember.upsert({
    where: { groupId_userId: { groupId: group.id, userId: session.user.id } },
    create: { groupId: group.id, userId: session.user.id, role: "member" },
    update: {}
  });

  return NextResponse.json({ id: group.id, name: group.name, inviteCode: group.inviteCode });
}
