import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid signup payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const email = parsed.data.email.toLowerCase().trim();
    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const user = await prisma.user.create({
      data: {
        email,
        displayName: parsed.data.displayName,
        passwordHash: await hash(parsed.data.password, 10)
      },
      select: { id: true, email: true, displayName: true }
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    console.error("Register route failure:", error);
    return NextResponse.json(
      {
        error:
          "Signup failed on server. Check DATABASE_URL and Prisma schema sync on deployment."
      },
      { status: 500 }
    );
  }
}
