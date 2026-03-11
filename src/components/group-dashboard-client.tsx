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

type ParsedImportRow = {
  playerA: string;
  playerB: string;
  winner: string;
  archetypeA?: string;
  archetypeB?: string;
  formatCode?: string;
};

type FailedImportRow = {
  lineNumber: number;
  rawLine: string;
  reason: string;
};

type ImportHistoryItem = {
  id: string;
  createdAt: string;
  totalLines: number;
  parsedLines: number;
  loggedBy: string;
};

const defaultDecks = [
  "Dragapult / Dusknoir",
  "Gardevoir",
  "Gardevoir / Jellicent",
  "Charizard / Pidgeot",
  "Charizard / Noctowl",
  "Other"
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
  userName,
  memberNames
}: {
  groupId: string;
  groupName: string;
  inviteCode: string;
  userName: string;
  memberNames: string[];
}) {
  const [games, setGames] = useState<LoggedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"logs" | "stats" | "decks">("logs");
  const [selectedFormatId, setSelectedFormatId] = useState("SVI-ASC");
  const [deckOptions, setDeckOptions] = useState<string[]>(defaultDecks);
  const [newDeckName, setNewDeckName] = useState("");
  const playerList = useMemo(() => {
    const fromGroup = memberNames.filter(Boolean);
    const base = fromGroup.length > 0 ? fromGroup : [userName];
    return base.includes("Other") ? base : [...base, "Other"];
  }, [memberNames, userName]);
  const [form, setForm] = useState({
    playerAName: playerList[0] ?? userName,
    playerBName: playerList[1] ?? playerList[0] ?? userName,
    archetypeA: "Charizard / Pidgeot",
    archetypeB: "Dragapult / Dusknoir",
    winnerSide: "A" as "A" | "B",
    formatCode: "SVI-ASC",
    gameType: "in_person_testing" as GameType,
    notes: ""
  });
  const [liveLogText, setLiveLogText] = useState("");
  const [parsedImportRows, setParsedImportRows] = useState<ParsedImportRow[]>([]);
  const [failedImportRows, setFailedImportRows] = useState<FailedImportRow[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [lastSavedImportId, setLastSavedImportId] = useState<string | null>(null);
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);
  const [parseMessage, setParseMessage] = useState("");

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

  useEffect(() => {
    async function loadImportHistory() {
      const res = await fetch(`/api/import/tcglive/history?groupId=${groupId}`);
      if (!res.ok) return;
      setImportHistory((await res.json()) as ImportHistoryItem[]);
    }
    loadImportHistory();
  }, [groupId]);

  const filteredGames = games;
  const decksInUse = useMemo(() => {
    const set = new Set<string>();
    deckOptions.forEach((deck) => set.add(deck));
    filteredGames.forEach((g) => {
      set.add(g.archetypeA);
      set.add(g.archetypeB);
    });
    return Array.from(set);
  }, [deckOptions, filteredGames]);

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

  async function parseLiveLogs() {
    if (!liveLogText.trim()) {
      setError("Paste at least one TCG Live log line first.");
      return;
    }
    setError("");
    setImportLoading(true);
    const res = await fetch("/api/import/tcglive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ logText: liveLogText, groupId, persist: true })
    });
    if (!res.ok) {
      setImportLoading(false);
      setError("Unable to parse TCG Live logs.");
      return;
    }
    const data = (await res.json()) as {
      rows: ParsedImportRow[];
      failedRows?: FailedImportRow[];
      parseMessage?: string;
      savedImportId?: string | null;
    };
    setParsedImportRows(data.rows ?? []);
    setFailedImportRows(data.failedRows ?? []);
    setParseMessage(data.parseMessage ?? "");
    setLastSavedImportId(data.savedImportId ?? null);
    const historyRes = await fetch(`/api/import/tcglive/history?groupId=${groupId}`);
    if (historyRes.ok) setImportHistory((await historyRes.json()) as ImportHistoryItem[]);
    setImportLoading(false);
  }

  async function importParsedLogs() {
    if (parsedImportRows.length === 0) {
      setError("No parsed rows to import yet.");
      return;
    }
    setError("");
    setImportLoading(true);
    const createdRows: LoggedGame[] = [];
    for (const row of parsedImportRows) {
      const winnerSide = row.winner.toLowerCase() === row.playerB.toLowerCase() ? "B" : "A";
      const res = await fetch("/api/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupId,
          source: "import",
          playerAName: row.playerA,
          playerBName: row.playerB,
          archetypeA: row.archetypeA || form.archetypeA,
          archetypeB: row.archetypeB || form.archetypeB,
          winnerSide,
          formatCode: row.formatCode || form.formatCode,
          gameType: "tcg_live_ladder",
          notes: form.notes || undefined
        })
      });
      if (!res.ok) {
        setImportLoading(false);
        setError("Some logs failed to import. Check row formatting.");
        return;
      }
      createdRows.push((await res.json()) as LoggedGame);
    }
    setGames((current) => [...createdRows, ...current]);
    setParsedImportRows([]);
    setFailedImportRows([]);
    setLiveLogText("");
    setParseMessage(`Imported ${createdRows.length} game(s) from parsed rows.`);
    setImportLoading(false);
  }

  function retryFailedRows() {
    if (failedImportRows.length === 0) return;
    setLiveLogText(failedImportRows.map((row) => row.rawLine).join("\n"));
  }

  async function loadImportHistoryItem(importId: string) {
    setImportLoading(true);
    const res = await fetch(`/api/import/tcglive/${importId}`);
    if (!res.ok) {
      setImportLoading(false);
      setError("Unable to load selected import.");
      return;
    }
    const data = (await res.json()) as {
      rawText: string;
      parsedRows: ParsedImportRow[];
      failedRows?: FailedImportRow[];
      totalLines: number;
      parsedLines: number;
    };
    setLiveLogText(data.rawText);
    setParsedImportRows(data.parsedRows ?? []);
    setFailedImportRows(data.failedRows ?? []);
    setParseMessage(
      `Loaded saved import: ${data.parsedLines}/${data.totalLines} lines parsed.`
    );
    setImportLoading(false);
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

  function addDeckOption() {
    const next = newDeckName.trim();
    if (!next) return;
    if (deckOptions.some((d) => d.toLowerCase() === next.toLowerCase())) {
      setNewDeckName("");
      return;
    }
    setDeckOptions((current) => [...current, next]);
    setNewDeckName("");
  }

  function removeDeckOption(deck: string) {
    if (deck === "Other") return;
    setDeckOptions((current) => current.filter((d) => d !== deck));
    setForm((current) => ({
      ...current,
      archetypeA: current.archetypeA === deck ? "Other" : current.archetypeA,
      archetypeB: current.archetypeB === deck ? "Other" : current.archetypeB
    }));
  }

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
          <button
            className={activeTab === "decks" ? "navBtn active" : "navBtn"}
            onClick={() => setActiveTab("decks")}
            type="button"
          >
            Decks
          </button>
        </nav>
      </aside>

      <section className="contentPane">
        <header className="pageHeader">
          <h1>
            {activeTab === "logs"
              ? "PTCG Logs"
              : activeTab === "stats"
                ? "PTCG Stats"
                : "Deck Editor"}
          </h1>
          <p className="mutedText">Track games and sharpen your event prep.</p>
          <p className="routeHint">Frontier Route: Group Testing Grounds</p>
        </header>

        {activeTab === "logs" ? (
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
                  {playerList.map((p) => (
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
                  {deckOptions.map((d) => (
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
                  {playerList.map((p) => (
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
                  {deckOptions.map((d) => (
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
        ) : null}

        {activeTab === "logs" && form.gameType === "tcg_live_ladder" ? (
          <article className="panel">
            <h2 className="panelTitle">TCG Live Paste Import</h2>
            <textarea
              value={liveLogText}
              onChange={(e) => setLiveLogText(e.target.value)}
              placeholder="Paste one per line: PlayerA vs PlayerB - winner: PlayerA"
            />
            <div className="inlineActions">
              <button className="actionBtn" type="button" onClick={parseLiveLogs} disabled={importLoading}>
                Parse Logs
              </button>
              <button className="actionBtn" type="button" onClick={importParsedLogs} disabled={importLoading}>
                Import Parsed
              </button>
            </div>
            <p className="mutedText">
              Optional detailed row format:
              {" "}
              <code>
                A vs B - winner: A - decks: Deck1 vs Deck2 - format: SVI-ASC
              </code>
            </p>
            {parsedImportRows.length > 0 ? (
              <ul className="rows">
                {parsedImportRows.map((row, idx) => (
                  <li key={`${row.playerA}-${row.playerB}-${idx}`} className="row">
                    <span>
                      {row.playerA} vs {row.playerB} ({row.winner})
                    </span>
                    <strong>{row.formatCode || form.formatCode}</strong>
                  </li>
                ))}
              </ul>
            ) : null}
            {parseMessage ? <p className="mutedText">{parseMessage}</p> : null}
            {failedImportRows.length > 0 ? (
              <>
                <h3 className="panelTitle">Failed Rows</h3>
                <ul className="rows">
                  {failedImportRows.map((row) => (
                    <li key={`${row.lineNumber}-${row.rawLine}`} className="row">
                      <span>
                        Line {row.lineNumber}: {row.rawLine}
                      </span>
                      <strong>{row.reason}</strong>
                    </li>
                  ))}
                </ul>
                <button className="actionBtn" type="button" onClick={retryFailedRows}>
                  Retry Failed Rows
                </button>
              </>
            ) : null}
            {lastSavedImportId ? (
              <p className="mutedText">Saved raw import: {lastSavedImportId}</p>
            ) : null}
            <h3 className="panelTitle">Import History</h3>
            {importHistory.length === 0 ? (
              <p className="mutedText">No saved imports yet.</p>
            ) : (
              <ul className="rows">
                {importHistory.map((item) => (
                  <li key={item.id} className="row">
                    <span>
                      {new Date(item.createdAt).toLocaleString()} - {item.parsedLines}/
                      {item.totalLines} parsed ({item.loggedBy})
                    </span>
                    <button
                      className="actionBtn"
                      type="button"
                      onClick={() => loadImportHistoryItem(item.id)}
                    >
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ) : null}

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
        ) : activeTab === "stats" ? (
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
                      {pct(cell.rawWinRate)} ({cell.games})
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
        ) : (
          <article className="panel">
            <h2 className="panelTitle">Manage Group Decks</h2>
            <div className="inlineActions">
              <input
                value={newDeckName}
                placeholder="Add deck archetype"
                onChange={(e) => setNewDeckName(e.target.value)}
              />
              <button className="actionBtn" type="button" onClick={addDeckOption}>
                Add Deck
              </button>
            </div>
            <ul className="rows">
              {deckOptions.map((deck) => (
                <li className="row" key={deck}>
                  <span>{deck}</span>
                  <button
                    className="dangerBtn"
                    type="button"
                    disabled={deck === "Other"}
                    onClick={() => removeDeckOption(deck)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <p className="mutedText">
              `Other` stays available so unusual lists are always trackable.
            </p>
          </article>
        )}
      </section>
    </main>
  );
}
