"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type GroupSummary = {
  id: string;
  name: string;
  inviteCode: string;
  ownerId: string;
  createdAt: string | Date;
};

export default function HomeLauncher({
  groups,
  userName
}: {
  groups: GroupSummary[];
  userName: string;
}) {
  const router = useRouter();
  const [createForm, setCreateForm] = useState({ name: "", password: "" });
  const [joinForm, setJoinForm] = useState({ inviteCode: "", password: "" });
  const [message, setMessage] = useState("");

  async function createGroup(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm)
    });
    const data = (await res.json()) as { id?: string; error?: string };
    if (!res.ok || !data.id) {
      setMessage(data.error ?? "Unable to create group.");
      return;
    }
    router.push(`/group/${data.id}`);
  }

  async function joinGroup(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    const res = await fetch("/api/groups/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inviteCode: joinForm.inviteCode.toUpperCase(),
        password: joinForm.password
      })
    });
    const data = (await res.json()) as { id?: string; error?: string };
    if (!res.ok || !data.id) {
      setMessage(data.error ?? "Unable to join group.");
      return;
    }
    router.push(`/group/${data.id}`);
  }

  return (
    <main className="container stack">
      <section className="card heroCard">
        <h1 className="title">Battle Frontier</h1>
        <p className="muted">
          Welcome back {userName}. Create a testing group or join via invite code
          + group password.
        </p>
        <button className="primaryAction" onClick={() => signOut({ callbackUrl: "/" })}>
          Sign Out
        </button>
      </section>

      <section className="card splitCards">
        <form className="stack" onSubmit={createGroup}>
          <h2>Create Group</h2>
          <input
            required
            placeholder="Group name"
            value={createForm.name}
            onChange={(e) => setCreateForm((v) => ({ ...v, name: e.target.value }))}
          />
          <input
            required
            type="password"
            placeholder="Group password"
            value={createForm.password}
            onChange={(e) =>
              setCreateForm((v) => ({ ...v, password: e.target.value }))
            }
          />
          <button className="actionBtn" type="submit">
            Create Group
          </button>
        </form>

        <form className="stack" onSubmit={joinGroup}>
          <h2>Join Group</h2>
          <input
            required
            placeholder="Invite code"
            value={joinForm.inviteCode}
            onChange={(e) =>
              setJoinForm((v) => ({ ...v, inviteCode: e.target.value.toUpperCase() }))
            }
          />
          <input
            required
            type="password"
            placeholder="Group password"
            value={joinForm.password}
            onChange={(e) => setJoinForm((v) => ({ ...v, password: e.target.value }))}
          />
          <button className="actionBtn" type="submit">
            Join Group
          </button>
        </form>
      </section>

      {message && (
        <section className="card">
          <p className="muted">{message}</p>
        </section>
      )}

      <section className="card">
        <h2>My Groups</h2>
        {groups.length === 0 ? (
          <p className="muted">No groups yet.</p>
        ) : (
          <ul className="rows">
            {groups.map((group) => (
              <li className="row" key={group.id}>
                <div>
                  <strong>{group.name}</strong>
                  <p className="mutedText">Invite code: {group.inviteCode}</p>
                </div>
                <Link className="primaryAction" href={`/group/${group.id}`}>
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
