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
  const query = searchParams.get("query")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json([]);
  }

  const groups = await prisma.group.findMany({
    where: {
      name: { contains: query, mode: "insensitive" },
      members: { none: { userId: session.user.id } }
    },
    select: { id: true, name: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 8
  });

  return NextResponse.json(groups);
}
