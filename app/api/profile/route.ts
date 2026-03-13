import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateProfileSchema } from "@/lib/validation";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, displayName: true, tcgLiveUsername: true }
  });
  if (!profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(profile);
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid profile payload", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      displayName: parsed.data.displayName ?? null,
      tcgLiveUsername: parsed.data.tcgLiveUsername ?? null
    },
    select: { id: true, email: true, displayName: true, tcgLiveUsername: true }
  });

  return NextResponse.json(updated);
}
