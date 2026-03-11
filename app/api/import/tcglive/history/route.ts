import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const imports = await prisma.tcgLiveImport.findMany({
    where: { groupId },
    select: {
      id: true,
      createdAt: true,
      totalLines: true,
      parsedLines: true,
      loggedBy: { select: { displayName: true, email: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 20
  });

  return NextResponse.json(
    imports.map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      totalLines: item.totalLines,
      parsedLines: item.parsedLines,
      loggedBy: item.loggedBy.displayName || item.loggedBy.email
    }))
  );
}
