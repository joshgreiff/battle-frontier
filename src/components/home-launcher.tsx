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

type DiscoverGroup = Pick<GroupSummary, "id" | "name" | "createdAt">;

export default function HomeLauncher({
  groups,
  userName
}: {
  groups: GroupSummary[];
  userName: string;
}) {
  const router = useRouter();
  const [createForm, setCreateForm] = useState({ name: "", inviteCode: "" });
  const [joinForm, setJoinForm] = useState({ inviteCode: "", groupNameQuery: "" });
  const [searchResults, setSearchResults] = useState<DiscoverGroup[]>([]);
  const [selectedGroupForJoin, setSelectedGroupForJoin] = useState<DiscoverGroup | null>(null);
  const [searching, setSearching] = useState(false);
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

  async function performJoin(inviteCodeRaw: string) {
    setMessage("");
    const inviteCode = inviteCodeRaw.toUpperCase();
    const res = await fetch("/api/groups/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        inviteCode
      })
    });
    const data = (await res.json()) as { id?: string; error?: string };
    if (!res.ok || !data.id) {
      setMessage(data.error ?? "Unable to join group.");
      return;
    }
    router.push(`/group/${data.id}`);
  }

  async function joinGroup() {
    await performJoin(joinForm.inviteCode);
  }

  async function searchGroups(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setSearching(true);
    const res = await fetch(
      `/api/groups/discover?query=${encodeURIComponent(joinForm.groupNameQuery.trim())}`
    );
    if (!res.ok) {
      setSearching(false);
      setMessage("Unable to search groups.");
      return;
    }
    const data = (await res.json()) as DiscoverGroup[];
    setSearchResults(data);
    setSearching(false);
  }

  return (
    <main className="container stack">
      <section className="card heroCard">
        <h1 className="title">Battle Frontier</h1>
        <p className="muted">
          Welcome back {userName}. Create a testing group or join instantly via
          group search.
        </p>
        <p className="routeHint">Adventure Mode: Regional Prep</p>
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
            placeholder="Invite code (e.g. DONPHAN)"
            value={createForm.inviteCode}
            onChange={(e) =>
              setCreateForm((v) => ({ ...v, inviteCode: e.target.value.toUpperCase() }))
            }
          />
          <button className="actionBtn" type="submit">
            Create Group
          </button>
        </form>

        <form className="stack" onSubmit={searchGroups}>
          <h2>Join Group</h2>
          <input
            required
            placeholder="Search group name"
            value={joinForm.groupNameQuery}
            onChange={(e) =>
              setJoinForm((v) => ({ ...v, groupNameQuery: e.target.value }))
            }
          />
          <button className="actionBtn" type="submit">
            {searching ? "Searching..." : "Search"}
          </button>
        </form>
      </section>

      {searchResults.length > 0 ? (
        <section className="card">
          <h2>Search Results</h2>
          <ul className="rows">
            {searchResults.map((group) => (
              <li className="row" key={group.id}>
                <div>
                  <strong>{group.name}</strong>
                  <p className="mutedText">Use your group invite code to join.</p>
                </div>
                <button
                  className="secondaryBtn"
                  type="button"
                  onClick={() => {
                    setSelectedGroupForJoin(group);
                    setJoinForm((v) => ({ ...v, inviteCode: "" }));
                    setMessage("");
                  }}
                >
                  Join
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {selectedGroupForJoin ? (
        <section className="card">
          <h2>Join {selectedGroupForJoin.name}</h2>
          <div className="stack">
            <input
              required
              placeholder="Enter invite code"
              value={joinForm.inviteCode}
              onChange={(e) =>
                setJoinForm((v) => ({ ...v, inviteCode: e.target.value.toUpperCase() }))
              }
            />
            <div className="inlineActions">
              <button className="actionBtn" type="button" onClick={() => void joinGroup()}>
                Join Group
              </button>
              <button
                className="secondaryBtn"
                type="button"
                onClick={() => {
                  setSelectedGroupForJoin(null);
                  setJoinForm((v) => ({ ...v, inviteCode: "" }));
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </section>
      ) : null}

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
