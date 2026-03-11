import { getServerSession } from "next-auth";
import AuthPanel from "@/components/auth-panel";
import HomeLauncher from "@/components/home-launcher";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return <AuthPanel />;

  const groups = await prisma.groupMember.findMany({
    where: { userId: session.user.id },
    include: {
      group: {
        select: { id: true, name: true, inviteCode: true, ownerId: true, createdAt: true }
      }
    },
    orderBy: { joinedAt: "desc" }
  });

  return (
    <HomeLauncher
      groups={groups.map((membership) => membership.group)}
      userName={session.user.name ?? session.user.email ?? "Trainer"}
    />
  );
}
