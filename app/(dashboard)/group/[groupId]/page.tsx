import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import GroupDashboardClient from "@/components/group-dashboard-client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type GroupPageProps = {
  params: Promise<{ groupId: string }>;
};

export default async function GroupDashboardPage({ params }: GroupPageProps) {
  const { groupId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/");
  }

  const membership = await prisma.groupMember.findUnique({
    where: { groupId_userId: { groupId, userId: session.user.id } },
    include: { group: { select: { name: true, inviteCode: true } } }
  });
  if (!membership) {
    redirect("/");
  }

  return (
    <GroupDashboardClient
      groupId={groupId}
      groupName={membership.group.name}
      inviteCode={membership.group.inviteCode}
      userName={session.user.name ?? session.user.email ?? "Member"}
    />
  );
}
