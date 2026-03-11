"use client";

import { useEffect, useMemo, useState } from "react";
import { buildMatchupCells } from "@/lib/analytics/matchup";
import { recommendDecks } from "@/lib/analytics/recommendation";
import FormatSelect from "@/components/format-select";
import { formatOptions } from "@/lib/formats";

type GameType =
  | "in_person_testing"
  | "cup"
  | "challenge"
  | "regional"
  | "international"
  | "tcg_live_ladder"
  | "other";

type LoggedGame = {
  id: string;
  loggedByName: string;
  playerAName: string;
  playerBName: string;
  archetypeA: string;
  archetypeB: string;
  winnerSide: "A" | "B";
  formatCode: string;
  gameType: GameType;
  notes?: string;
  createdAt: string;
};

const players = ["Josh", "Alex", "Mia", "Sam", "Taylor", "Jordan"];
const archetypes = [
  "Dragapult / Dusknoir",
  "Gardevoir",
  "Gardevoir / Jellicent",
  "Charizard / Pidgeot",
  "Charizard / Noctowl"
];
const gameTypes: Array<{ value: GameType; label: string }> = [
  { value: "in_person_testing", label: "In Person Testing" },
  { value: "cup", label: "Cup" },
  { value: "challenge", label: "Challenge" },
  { value: "regional", label: "Regional" },
  { value: "international", label: "International" },
  { value: "tcg_live_ladder", label: "TCG Live Ladder" },
  { value: "other", label: "Other" }
];

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export default function GroupDashboardClient({
  groupId,
  groupName,
  inviteCode,
  userName
}: {
  groupId: string;
  groupName: string;
  inviteCode: string;
  userName: string;
}) {
  const [games, setGames] = useState<LoggedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"logs" | "stats">("logs");
  const [selectedFormatId, setSelectedFormatId] = useState("SVI-ASC");
  const [form, setForm] = useState({
    playerAName: "Josh",
    playerBName: "Alex",
    archetypeA: "Charizard / Pidgeot",
    archetypeB: "Dragapult / Dusknoir",
    winnerSide: "A" as "A" | "B",
    formatCode: "SVI-ASC",
    gameType: "in_person_testing" as GameType,
    notes: ""
  });

  useEffect(() => {
    async function loadMatches() {
      setLoading(true);
      setError("");
      const res = await fetch(`/api/matches?groupId=${groupId}`);
      if (!res.ok) {
        setError("Unable to load group logs.");
        setLoading(false);
        return;
      }
      const data = (await res.json()) as LoggedGame[];
      setGames(data);
      setLoading(false);
    }
    loadMatches();
  }, [groupId]);

  const filteredGames = games;
  const decksInUse = useMemo(() => {
    const set = new Set<string>();
    filteredGames.forEach((g) => {
      set.add(g.archetypeA);
      set.add(g.archetypeB);
    });
    return Array.from(set);
  }, [filteredGames]);

  const matchupCells = useMemo(() => {
    return buildMatchupCells(
      filteredGames.map((g) => ({
        archetypeAId: g.archetypeA,
        archetypeBId: g.archetypeB,
        winnerSide: g.winnerSide
      }))
    );
  }, [filteredGames]);

  const contributionLeaderboard = useMemo(() => {
    const counts = new Map<string, number>();
    filteredGames.forEach((g) => {
      counts.set(g.loggedByName, (counts.get(g.loggedByName) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [filteredGames]);

  const playerWinLeaderboard = useMemo(() => {
    const stats = new Map<string, { games: number; wins: number }>();
    filteredGames.forEach((g) => {
      const a = stats.get(g.playerAName) ?? { games: 0, wins: 0 };
      a.games += 1;
      if (g.winnerSide === "A") a.wins += 1;
      stats.set(g.playerAName, a);

      const b = stats.get(g.playerBName) ?? { games: 0, wins: 0 };
      b.games += 1;
      if (g.winnerSide === "B") b.wins += 1;
      stats.set(g.playerBName, b);
    });

    return Array.from(stats.entries())
      .map(([name, s]) => ({
        name,
        games: s.games,
        winRate: s.games ? s.wins / s.games : 0
      }))
      .filter((p) => p.games >= 10)
      .sort((a, b) => b.winRate - a.winRate);
  }, [filteredGames]);

  const [metaShares, setMetaShares] = useState<Record<string, number>>({
    "Charizard / Pidgeot": 28,
    "Dragapult / Dusknoir": 24,
    Gardevoir: 20,
    "Gardevoir / Jellicent": 14,
    "Charizard / Noctowl": 14
  });

  const recommendations = useMemo(() => {
    return recommendDecks(
      decksInUse,
      matchupCells,
      decksInUse.map((d) => ({
        archetypeId: d,
        sharePct: metaShares[d] ?? 0
      }))
    );
  }, [decksInUse, matchupCells, metaShares]);

  async function onSubmitGame(event: React.FormEvent) {
    event.preventDefault();
    const res = await fetch("/api/matches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId,
        source: "manual",
        playerAName: form.playerAName,
        playerBName: form.playerBName,
        archetypeA: form.archetypeA,
        archetypeB: form.archetypeB,
        winnerSide: form.winnerSide,
        formatCode: form.formatCode,
        gameType: form.gameType,
        notes: form.notes || undefined
      })
    });
    if (!res.ok) {
      setError("Unable to save log.");
      return;
    }
    const created = (await res.json()) as LoggedGame;
    setGames((current) => [created, ...current]);
    setForm((current) => ({ ...current, notes: "" }));
  }

  function onChangeFormat(nextId: string) {
    setSelectedFormatId(nextId);
    setForm((current) => ({ ...current, formatCode: nextId }));
  }

  const deckRows = useMemo(() => {
    const byDeck = new Map<string, { wins: number; losses: number; total: number }>();
    for (const game of filteredGames) {
      const a = byDeck.get(game.archetypeA) ?? { wins: 0, losses: 0, total: 0 };
      a.total += 1;
      if (game.winnerSide === "A") a.wins += 1;
      else a.losses += 1;
      byDeck.set(game.archetypeA, a);

      const b = byDeck.get(game.archetypeB) ?? { wins: 0, losses: 0, total: 0 };
      b.total += 1;
      if (game.winnerSide === "B") b.wins += 1;
      else b.losses += 1;
      byDeck.set(game.archetypeB, b);
    }
    return Array.from(byDeck.entries())
      .map(([deck, stats]) => ({ deck, ...stats }))
      .sort((a, b) => b.total - a.total);
  }, [filteredGames]);

  return (
    <main className="appShell">
      <aside className="sideNav">
        <h2 className="brand">Battle Frontier</h2>
        <p className="groupRef">{groupName}</p>
        <p className="groupRef">Invite: {inviteCode}</p>
        <p className="groupRef">Signed in: {userName}</p>
        <nav>
          <button
            className={activeTab === "logs" ? "navBtn active" : "navBtn"}
            onClick={() => setActiveTab("logs")}
            type="button"
          >
            PTCG Logs
          </button>
          <button
            className={activeTab === "stats" ? "navBtn active" : "navBtn"}
            onClick={() => setActiveTab("stats")}
            type="button"
          >
            Stats
          </button>
        </nav>
      </aside>

      <section className="contentPane">
        <header className="pageHeader">
          <h1>{activeTab === "logs" ? "PTCG Logs" : "PTCG Stats"}</h1>
          <p className="mutedText">Track games and sharpen your event prep.</p>
        </header>

        <article className="panel">
          <form className="gridForm" onSubmit={onSubmitGame}>
            <label>
              Logged by
              <select
                value={userName}
                disabled
              >
                <option>{userName}</option>
              </select>
            </label>
            <label>
              Player A
              <select
                value={form.playerAName}
                onChange={(e) =>
                  setForm((v) => ({ ...v, playerAName: e.target.value }))
                }
              >
                {players.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Deck A
              <select
                value={form.archetypeA}
                onChange={(e) =>
                  setForm((v) => ({ ...v, archetypeA: e.target.value }))
                }
              >
                {archetypes.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              Player B
              <select
                value={form.playerBName}
                onChange={(e) =>
                  setForm((v) => ({ ...v, playerBName: e.target.value }))
                }
              >
                {players.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label>
              Deck B
              <select
                value={form.archetypeB}
                onChange={(e) =>
                  setForm((v) => ({ ...v, archetypeB: e.target.value }))
                }
              >
                {archetypes.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
            <label>
              Winner
              <select
                value={form.winnerSide}
                onChange={(e) =>
                  setForm((v) => ({ ...v, winnerSide: e.target.value as "A" | "B" }))
                }
              >
                <option value="A">Player A</option>
                <option value="B">Player B</option>
              </select>
            </label>
            <label>
              Format
              <FormatSelect
                value={selectedFormatId}
                options={formatOptions}
                onChange={onChangeFormat}
              />
            </label>
            <label>
              Game Type
              <select
                value={form.gameType}
                onChange={(e) =>
                  setForm((v) => ({ ...v, gameType: e.target.value as GameType }))
                }
              >
                {gameTypes.map((t) => (
                  <option value={t.value} key={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="fullWidth">
              Notes
              <textarea
                value={form.notes}
                onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))}
                placeholder="Optional notes"
              />
            </label>
            <button className="actionBtn" type="submit">
              Add Log
            </button>
          </form>
        </article>

        {error && (
          <article className="panel">
            <p className="mutedText">{error}</p>
          </article>
        )}
        {loading && (
          <article className="panel">
            <p className="mutedText">Loading logs...</p>
          </article>
        )}

        {activeTab === "logs" ? (
          <article className="panel">
            <h2 className="panelTitle">Deck Logs</h2>
            {deckRows.length === 0 ? (
              <p className="mutedText">No logs yet for this group.</p>
            ) : (
              <ul className="rows">
                {deckRows.map((row) => (
                  <li key={row.deck} className="row">
                    <div>
                      <strong>{row.deck}</strong>
                      <p className="mutedText">{row.total} total</p>
                    </div>
                    <p className="score">
                      {row.wins}-{row.losses}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ) : (
          <div className="statsGrid">
            <article className="panel">
              <h2 className="panelTitle">Contribution Leaderboard</h2>
              <ul className="rows">
                {contributionLeaderboard.map((entry) => (
                  <li key={entry.name} className="row">
                    <span>{entry.name}</span>
                    <strong>{entry.total} logged</strong>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <h2 className="panelTitle">Highest Win% (10+ Games)</h2>
              {playerWinLeaderboard.length === 0 ? (
                <p className="mutedText">No one has reached 10 games yet.</p>
              ) : (
                <ul className="rows">
                  {playerWinLeaderboard.map((entry) => (
                    <li key={entry.name} className="row">
                      <span>{entry.name}</span>
                      <strong>
                        {pct(entry.winRate)} ({entry.games})
                      </strong>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="panel">
              <h2 className="panelTitle">Matchup Matrix</h2>
              <ul className="rows">
                {matchupCells.map((cell) => (
                  <li key={`${cell.deckId}-${cell.oppId}`} className="row">
                    <span>
                      {cell.deckId} vs {cell.oppId}
                    </span>
                    <strong>
                      {pct(cell.smoothedWinRate)} ({cell.games})
                    </strong>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel">
              <h2 className="panelTitle">Best Play By Meta Share</h2>
              <div className="shareGrid">
                {decksInUse.map((deck) => (
                  <label key={deck}>
                    {deck}
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={metaShares[deck] ?? 0}
                      onChange={(e) =>
                        setMetaShares((current) => ({
                          ...current,
                          [deck]: Number(e.target.value || 0)
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <ul className="rows">
                {recommendations.map((entry) => (
                  <li key={entry.archetypeId} className="row">
                    <span>{entry.archetypeId}</span>
                    <strong>{pct(entry.expectedWinRate)}</strong>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        )}
      </section>
    </main>
  );
}
