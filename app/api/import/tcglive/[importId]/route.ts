import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ importId: string }> };

export async function GET(_: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { importId } = await params;
  const importEntry = await prisma.tcgLiveImport.findUnique({
    where: { id: importId },
    include: { group: { select: { id: true } } }
  });
  if (!importEntry) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  }

  const membership = await prisma.groupMember.findUnique({
    where: {
      groupId_userId: { groupId: importEntry.group.id, userId: session.user.id }
    }
  });
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({
    id: importEntry.id,
    rawText: importEntry.rawText,
    parsedRows: importEntry.parsedRows,
    failedRows: importEntry.failedRows,
    totalLines: importEntry.totalLines,
    parsedLines: importEntry.parsedLines,
    createdAt: importEntry.createdAt
  });
}
