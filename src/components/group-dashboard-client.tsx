"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { buildMatchupCells } from "@/lib/analytics/matchup";
import { recommendDecks } from "@/lib/analytics/recommendation";
import FormatSelect from "@/components/format-select";
import { formatOptions } from "@/lib/formats";
import { getArchetypeIconIds, getPokemonIconUrl } from "@/lib/deck-icons";

type GameType =
  | "in_person_testing"
  | "cup"
  | "challenge"
  | "regional"
  | "international"
  | "tcg_live_ladder"
  | "other";

type LogEntryMode = "manual" | "tcg_live";

type LoggedGame = {
  id: string;
  source: "manual" | "import";
  loggedByUserId: string;
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

type SavedDeck = {
  id: string;
  key: string;
  formatCode: string;
  pokemon1: string;
  pokemon2?: string | null;
  nickname?: string | null;
  displayName: string;
};

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

function normalizeArchetypePiece(value: string): string {
  const withoutCode = value
    .trim()
    .replace(/’/g, "'")
    .replace(/^(\([^)]*\)\s*)+/g, "")
    .replace(/\s+/g, " ");
  return withoutCode.trim();
}

function normalizeArchetypeLabel(value: string): string {
  const parts = value
    .split("/")
    .map((piece) => normalizeArchetypePiece(piece))
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "Other";
  return parts.join(" / ");
}

async function parseErrorResponse(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string; details?: string };
    if (data.error) return data.error;
    if (data.details) return data.details;
  } catch {
    // Ignore parse failures and fall back to generic text.
  }
  return fallback;
}

function ArchetypeIcons({ archetype }: { archetype: string }) {
  const ids = getArchetypeIconIds(archetype);
  return (
    <span className="deckIcons" aria-label={archetype}>
      {ids.map((id) => (
          <Image
            className={id === "substitute" ? "deckIcon deckIconSubstitute" : "deckIcon"}
            src={getPokemonIconUrl(id)}
            alt={id}
            width={id === "substitute" ? 30 : 22}
            height={id === "substitute" ? 30 : 22}
            key={`${archetype}-${id}`}
          />
      ))}
    </span>
  );
}

export default function GroupDashboardClient({
  groupId,
  groupName,
  inviteCode,
  currentUserId,
  userName,
  memberNames
}: {
  groupId: string;
  groupName: string;
  inviteCode: string;
  currentUserId: string;
  userName: string;
  memberNames: string[];
}) {
  const [games, setGames] = useState<LoggedGame[]>([]);
  const [savedDecks, setSavedDecks] = useState<SavedDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"logs" | "stats" | "decks" | "profile">("logs");
  const [logEntryMode, setLogEntryMode] = useState<LogEntryMode>("manual");
  const [selectedFormatId, setSelectedFormatId] = useState("SVI-ASC");
  const [newDeckPokemon1, setNewDeckPokemon1] = useState("");
  const [newDeckPokemon2, setNewDeckPokemon2] = useState("");
  const [newDeckNickname, setNewDeckNickname] = useState("");
  const [pokemonSuggestionsA, setPokemonSuggestionsA] = useState<string[]>([]);
  const [pokemonSuggestionsB, setPokemonSuggestionsB] = useState<string[]>([]);
  const playerList = useMemo(() => {
    const fromGroup = memberNames.filter(Boolean);
    const base = fromGroup.length > 0 ? fromGroup : [userName];
    return base.includes("Other") ? base : [...base, "Other"];
  }, [memberNames, userName]);
  const [form, setForm] = useState({
    playerAName: playerList[0] ?? userName,
    playerBName: playerList[1] ?? playerList[0] ?? userName,
    archetypeA: "Other",
    archetypeB: "Other",
    winnerSide: "A" as "A" | "B",
    formatCode: "SVI-ASC",
    gameType: "in_person_testing" as GameType,
    notes: ""
  });
  const [liveLogText, setLiveLogText] = useState("");
  const [importFormatCode, setImportFormatCode] = useState("SVI-ASC");
  const [importFallbackDeckA, setImportFallbackDeckA] = useState("Other");
  const [importFallbackDeckB, setImportFallbackDeckB] = useState("Other");
  const [parsedImportRows, setParsedImportRows] = useState<ParsedImportRow[]>([]);
  const [failedImportRows, setFailedImportRows] = useState<FailedImportRow[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [lastSavedImportId, setLastSavedImportId] = useState<string | null>(null);
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);
  const [parseMessage, setParseMessage] = useState("");
  const [selectedArchetype, setSelectedArchetype] = useState<string>("");
  const [editingImportedMatchId, setEditingImportedMatchId] = useState<string | null>(null);
  const [editImportedA, setEditImportedA] = useState("Other");
  const [editImportedB, setEditImportedB] = useState("Other");
  const [editWinnerSide, setEditWinnerSide] = useState<"A" | "B">("A");
  const [savingImportedEdit, setSavingImportedEdit] = useState(false);

  const deckOptions = useMemo(() => {
    const seen = new Set<string>();
    const combined = ["Other", ...savedDecks.map((d) => d.displayName)].filter((d) => {
      const normalized = d.trim().toLowerCase();
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
    return combined;
  }, [savedDecks]);

  const savedDeckByName = useMemo(() => {
    const byName = new Map<string, SavedDeck>();
    for (const deck of savedDecks) {
      byName.set(deck.displayName, deck);
    }
    return byName;
  }, [savedDecks]);

  function deckOptionLabel(displayName: string): string {
    const saved = savedDeckByName.get(displayName);
    if (!saved?.nickname?.trim()) return displayName;
    return `${displayName} (${saved.nickname.trim()})`;
  }

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

  useEffect(() => {
    async function loadDecks() {
      const res = await fetch(
        `/api/decks?groupId=${groupId}&formatCode=${encodeURIComponent(selectedFormatId)}`
      );
      if (!res.ok) return;
      setSavedDecks((await res.json()) as SavedDeck[]);
    }
    loadDecks();
  }, [groupId, selectedFormatId]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const query = newDeckPokemon1.trim();
      if (!query) {
        setPokemonSuggestionsA([]);
        return;
      }
      try {
        const res = await fetch(`/api/pokemon/search?q=${encodeURIComponent(query)}&limit=25`, {
          signal: controller.signal
        });
        if (!res.ok) return;
        const data = (await res.json()) as { results?: string[] };
        setPokemonSuggestionsA(data.results ?? []);
      } catch {
        // Ignore aborted and transient network errors.
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [newDeckPokemon1]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const query = newDeckPokemon2.trim();
      if (!query) {
        setPokemonSuggestionsB([]);
        return;
      }
      try {
        const res = await fetch(`/api/pokemon/search?q=${encodeURIComponent(query)}&limit=25`, {
          signal: controller.signal
        });
        if (!res.ok) return;
        const data = (await res.json()) as { results?: string[] };
        setPokemonSuggestionsB(data.results ?? []);
      } catch {
        // Ignore aborted and transient network errors.
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [newDeckPokemon2]);

  const resolvedImportFallbackDeckA = deckOptions.includes(importFallbackDeckA)
    ? importFallbackDeckA
    : (deckOptions[0] ?? "Other");
  const resolvedImportFallbackDeckB = deckOptions.includes(importFallbackDeckB)
    ? importFallbackDeckB
    : (deckOptions[0] ?? "Other");

  const filteredGames = games;
  const normalizedGames = useMemo(
    () =>
      filteredGames.map((g) => ({
        ...g,
        archetypeA: normalizeArchetypeLabel(g.archetypeA),
        archetypeB: normalizeArchetypeLabel(g.archetypeB)
      })),
    [filteredGames]
  );
  const decksInUse = useMemo(() => {
    const set = new Set<string>();
    deckOptions.forEach((deck) => set.add(deck));
    normalizedGames.forEach((g) => {
      set.add(g.archetypeA);
      set.add(g.archetypeB);
    });
    return Array.from(set);
  }, [deckOptions, normalizedGames]);

  const matchupCells = useMemo(() => {
    return buildMatchupCells(
      normalizedGames.map((g) => ({
        archetypeAId: g.archetypeA,
        archetypeBId: g.archetypeB,
        winnerSide: g.winnerSide
      }))
    );
  }, [normalizedGames]);

  const contributionLeaderboard = useMemo(() => {
    const counts = new Map<string, number>();
    filteredGames.forEach((g) => {
      counts.set(g.loggedByName, (counts.get(g.loggedByName) ?? 0) + 1);
    });
    return Array.from(counts.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [filteredGames]);

  const archetypeOverview = useMemo(() => {
    const byDeck = new Map<string, { wins: number; losses: number; games: number }>();
    for (const game of normalizedGames) {
      const a = byDeck.get(game.archetypeA) ?? { wins: 0, losses: 0, games: 0 };
      a.games += 1;
      if (game.winnerSide === "A") a.wins += 1;
      else a.losses += 1;
      byDeck.set(game.archetypeA, a);

      const b = byDeck.get(game.archetypeB) ?? { wins: 0, losses: 0, games: 0 };
      b.games += 1;
      if (game.winnerSide === "B") b.wins += 1;
      else b.losses += 1;
      byDeck.set(game.archetypeB, b);
    }

    return Array.from(byDeck.entries())
      .map(([archetype, stats]) => ({
        archetype,
        games: stats.games,
        wins: stats.wins,
        losses: stats.losses,
        winRate: stats.games ? stats.wins / stats.games : 0
      }))
      .sort((a, b) => b.games - a.games || b.winRate - a.winRate);
  }, [normalizedGames]);

  const topArchetypeSummary = useMemo(
    () => archetypeOverview.slice(0, 8),
    [archetypeOverview]
  );

  const activeSelectedArchetype = useMemo(() => {
    if (!selectedArchetype) return "";
    return archetypeOverview.some((entry) => entry.archetype === selectedArchetype)
      ? selectedArchetype
      : "";
  }, [archetypeOverview, selectedArchetype]);

  const activeSelectedArchetypeSummary = useMemo(() => {
    if (!activeSelectedArchetype) return null;
    return archetypeOverview.find((entry) => entry.archetype === activeSelectedArchetype) ?? null;
  }, [activeSelectedArchetype, archetypeOverview]);

  const activeSelectedArchetypeMatchups = useMemo(() => {
    if (!activeSelectedArchetype) return [];
    const byOpponent = new Map<string, { wins: number; losses: number; games: number }>();
    for (const game of normalizedGames) {
      let opponent: string | null = null;
      let win = false;
      if (game.archetypeA === activeSelectedArchetype) {
        opponent = game.archetypeB;
        win = game.winnerSide === "A";
      } else if (game.archetypeB === activeSelectedArchetype) {
        opponent = game.archetypeA;
        win = game.winnerSide === "B";
      }
      if (!opponent) continue;
      const current = byOpponent.get(opponent) ?? { wins: 0, losses: 0, games: 0 };
      current.games += 1;
      if (win) current.wins += 1;
      else current.losses += 1;
      byOpponent.set(opponent, current);
    }
    return Array.from(byOpponent.entries())
      .map(([opponent, stats]) => ({
        opponent,
        games: stats.games,
        wins: stats.wins,
        losses: stats.losses,
        winRate: stats.games ? stats.wins / stats.games : 0
      }))
      .sort((a, b) => b.games - a.games || b.winRate - a.winRate);
  }, [normalizedGames, activeSelectedArchetype]);

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
    setError("");
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
      setError(await parseErrorResponse(res, "Unable to save manual log."));
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
      setError(await parseErrorResponse(res, "Unable to parse TCG Live logs."));
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
          archetypeA: row.archetypeA || resolvedImportFallbackDeckA,
          archetypeB: row.archetypeB || resolvedImportFallbackDeckB,
          winnerSide,
          formatCode: row.formatCode || importFormatCode,
          gameType: "tcg_live_ladder",
          notes: form.notes || undefined
        })
      });
      if (!res.ok) {
        setImportLoading(false);
        setError(await parseErrorResponse(res, "Some logs failed to import. Check row formatting."));
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
    for (const game of normalizedGames) {
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
  }, [normalizedGames]);

  const myGames = useMemo(
    () => normalizedGames.filter((g) => g.loggedByUserId === currentUserId).slice(0, 50),
    [normalizedGames, currentUserId]
  );

  function normalizePokemonInput(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";
    return `${trimmed[0].toUpperCase()}${trimmed.slice(1).toLowerCase()}`;
  }

  function toDeckDisplayName(pokemon1: string, pokemon2?: string): string {
    return pokemon2 ? `${pokemon1} / ${pokemon2}` : pokemon1;
  }

  async function addDeckOption() {
    const pokemon1 = normalizePokemonInput(newDeckPokemon1);
    const pokemon2 = normalizePokemonInput(newDeckPokemon2);
    if (!pokemon1) {
      setError("Choose at least one Pokemon.");
      return;
    }
    setError("");
    const res = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId,
        formatCode: selectedFormatId,
        pokemon1,
        pokemon2: pokemon2 || undefined,
        nickname: newDeckNickname || undefined
      })
    });
    if (!res.ok) {
      setError(await parseErrorResponse(res, "Unable to save deck."));
      return;
    }
    const created = (await res.json()) as SavedDeck;
    setSavedDecks((current) => {
      if (current.some((d) => d.key === created.key)) return current;
      return [...current, created];
    });
    const displayName = toDeckDisplayName(pokemon1, pokemon2 || undefined);
    setForm((current) => ({
      ...current,
      archetypeA: current.archetypeA === "Other" ? displayName : current.archetypeA,
      archetypeB: current.archetypeB === "Other" ? displayName : current.archetypeB
    }));
    setNewDeckPokemon1("");
    setNewDeckPokemon2("");
    setNewDeckNickname("");
  }

  async function removeDeckOption(deck: string) {
    if (deck === "Other") return;
    const saved = savedDecks.find((d) => d.displayName === deck);
    if (!saved) return;
    const res = await fetch("/api/decks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groupId, id: saved.id })
    });
    if (!res.ok) {
      setError(await parseErrorResponse(res, "Unable to remove deck."));
      return;
    }
    setSavedDecks((current) => current.filter((d) => d.key !== saved.key));
    setForm((current) => ({
      ...current,
      archetypeA: current.archetypeA === deck ? "Other" : current.archetypeA,
      archetypeB: current.archetypeB === deck ? "Other" : current.archetypeB
    }));
  }

  function startImportedEdit(game: LoggedGame) {
    setEditingImportedMatchId(game.id);
    setEditImportedA(game.archetypeA);
    setEditImportedB(game.archetypeB);
    setEditWinnerSide(game.winnerSide);
  }

  async function saveImportedEdit(matchId: string) {
    setSavingImportedEdit(true);
    setError("");
    const res = await fetch("/api/matches", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId,
        matchId,
        archetypeA: editImportedA,
        archetypeB: editImportedB,
        winnerSide: editWinnerSide
      })
    });
    if (!res.ok) {
      setSavingImportedEdit(false);
      setError(await parseErrorResponse(res, "Unable to update imported match archetypes."));
      return;
    }
    const updated = (await res.json()) as LoggedGame;
    setGames((current) => current.map((g) => (g.id === updated.id ? updated : g)));
    setSavingImportedEdit(false);
    setEditingImportedMatchId(null);
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
          <button
            className={activeTab === "profile" ? "navBtn active" : "navBtn"}
            onClick={() => setActiveTab("profile")}
            type="button"
          >
            Profile
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
                : activeTab === "decks"
                  ? "Deck Editor"
                  : "My Games"}
          </h1>
          <p className="mutedText">Track games and sharpen your event prep.</p>
          <p className="routeHint">Frontier Route: Group Testing Grounds</p>
        </header>

        {activeTab === "logs" ? (
          <article className="panel">
            <h2 className="panelTitle">Log Entry Mode</h2>
            <div className="inlineActions">
              <button
                className={logEntryMode === "manual" ? "actionBtn" : "secondaryBtn"}
                type="button"
                onClick={() => setLogEntryMode("manual")}
              >
                Manual Entry
              </button>
              <button
                className={logEntryMode === "tcg_live" ? "actionBtn" : "secondaryBtn"}
                type="button"
                onClick={() => setLogEntryMode("tcg_live")}
              >
                TCG Live Import
              </button>
            </div>
            <p className="mutedText">
              If you are pasting a TCG Live log, use <strong>TCG Live Import</strong>. You do not
              need to fill the manual form.
            </p>
          </article>
        ) : null}

        {activeTab === "logs" && logEntryMode === "manual" ? (
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
                    <option key={d} value={d}>
                      {deckOptionLabel(d)}
                    </option>
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
                    <option key={d} value={d}>
                      {deckOptionLabel(d)}
                    </option>
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

        {activeTab === "logs" && logEntryMode === "tcg_live" ? (
          <article className="panel">
            <h2 className="panelTitle">TCG Live Paste Import</h2>
            <p className="mutedText">
              Paste the full raw TCG Live match log below. We will try to auto-detect players,
              winner, and archetypes.
            </p>
            <div className="gridForm">
              <label>
                Fallback Format
                <FormatSelect
                  value={importFormatCode}
                  options={formatOptions}
                  onChange={setImportFormatCode}
                />
              </label>
              <label>
                Fallback Deck A
                <select
                  value={resolvedImportFallbackDeckA}
                  onChange={(e) => setImportFallbackDeckA(e.target.value)}
                >
                  {deckOptions.map((d) => (
                    <option key={d} value={d}>
                      {deckOptionLabel(d)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Fallback Deck B
                <select
                  value={resolvedImportFallbackDeckB}
                  onChange={(e) => setImportFallbackDeckB(e.target.value)}
                >
                  {deckOptions.map((d) => (
                    <option key={d} value={d}>
                      {deckOptionLabel(d)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <textarea
              value={liveLogText}
              onChange={(e) => setLiveLogText(e.target.value)}
              placeholder="Paste the full TCG Live log text (Setup... turns... winner...)"
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
              Optional line-by-line format also supported:
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
                    <strong>{row.formatCode || importFormatCode}</strong>
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
                      <strong className="deckLabel">
                        <ArchetypeIcons archetype={row.deck} />
                        {row.deck}
                      </strong>
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
              <h2 className="panelTitle">Most Tested Archetypes</h2>
              {topArchetypeSummary.length === 0 ? (
                <p className="mutedText">No archetype data yet.</p>
              ) : (
                <ul className="rows">
                  {topArchetypeSummary.map((entry) => (
                    <li key={entry.archetype} className="row">
                      <span className="deckLabel">
                        <ArchetypeIcons archetype={entry.archetype} />
                        {entry.archetype}
                      </span>
                      <strong>
                        {entry.games} games ({pct(entry.winRate)})
                      </strong>
                    </li>
                  ))}
                </ul>
              )}
            </article>

            <article className="panel">
              <h2 className="panelTitle">Matchup Matrix</h2>
              {archetypeOverview.length === 0 ? (
                <p className="mutedText">No matchup data yet.</p>
              ) : activeSelectedArchetype ? (
                <>
                  <div className="inlineActions">
                    <button
                      className="secondaryBtn"
                      type="button"
                      onClick={() => setSelectedArchetype("")}
                    >
                      Back to Overall
                    </button>
                  </div>
                  {activeSelectedArchetypeSummary ? (
                    <p className="mutedText">
                      {activeSelectedArchetypeSummary.archetype}: {pct(activeSelectedArchetypeSummary.winRate)} (
                      {activeSelectedArchetypeSummary.wins}-{activeSelectedArchetypeSummary.losses},{" "}
                      {activeSelectedArchetypeSummary.games})
                    </p>
                  ) : null}
                  <h3 className="panelTitle">{activeSelectedArchetype} Matchups</h3>
                  {activeSelectedArchetypeMatchups.length === 0 ? (
                    <p className="mutedText">No matchup rows for this archetype yet.</p>
                  ) : (
                    <ul className="rows">
                      {activeSelectedArchetypeMatchups.map((entry) => (
                        <li key={`${activeSelectedArchetype}-${entry.opponent}`} className="row">
                          <span className="deckLabel">
                            <ArchetypeIcons archetype={entry.opponent} />
                            vs {entry.opponent}
                          </span>
                          <strong>
                            {pct(entry.winRate)} ({entry.wins}-{entry.losses}, {entry.games})
                          </strong>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <>
                  <p className="mutedText">
                    Overall archetype performance sorted by games. Click one to drill into full
                    matchup breakdown.
                  </p>
                  <ul className="rows matrixScrollable">
                    {archetypeOverview.map((entry) => (
                      <li key={entry.archetype} className="row">
                        <button
                          className="matrixPickBtn"
                          type="button"
                          onClick={() => setSelectedArchetype(entry.archetype)}
                        >
                          <span className="deckLabel">
                            <ArchetypeIcons archetype={entry.archetype} />
                            {entry.archetype}
                          </span>
                        </button>
                        <strong>
                          {pct(entry.winRate)} ({entry.wins}-{entry.losses}, {entry.games})
                        </strong>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </article>

            <article className="panel">
              <h2 className="panelTitle">Best Play By Meta Share</h2>
              <div className="shareGrid">
                {decksInUse.map((deck) => (
                  <label key={deck}>
                    <span className="deckLabel">
                      <ArchetypeIcons archetype={deck} />
                      {deck}
                    </span>
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
                    <span className="deckLabel">
                      <ArchetypeIcons archetype={entry.archetypeId} />
                      {entry.archetypeId}
                    </span>
                    <strong>{pct(entry.expectedWinRate)}</strong>
                  </li>
                ))}
              </ul>
            </article>
          </div>
        ) : activeTab === "decks" ? (
          <article className="panel">
            <h2 className="panelTitle">Manage Group Decks</h2>
            <div className="gridForm">
              <label>
                Deck format
                <FormatSelect
                  value={selectedFormatId}
                  options={formatOptions}
                  onChange={onChangeFormat}
                />
              </label>
            </div>
            <div className="gridForm">
              <label>
                Pokemon 1
                <input
                  list="pokemon-options-a"
                  value={newDeckPokemon1}
                  placeholder="Start typing (e.g. Gardevoir)"
                  onChange={(e) => setNewDeckPokemon1(e.target.value)}
                />
              </label>
              <label>
                Pokemon 2 (optional)
                <input
                  list="pokemon-options-b"
                  value={newDeckPokemon2}
                  placeholder="Optional second Pokemon"
                  onChange={(e) => setNewDeckPokemon2(e.target.value)}
                />
              </label>
              <label>
                Deck nickname (optional)
                <input
                  value={newDeckNickname}
                  placeholder="e.g. Tera Box, LAIC list"
                  onChange={(e) => setNewDeckNickname(e.target.value)}
                />
              </label>
            </div>
            <div className="inlineActions">
              <button className="actionBtn" type="button" onClick={addDeckOption}>
                Save Deck Archetype
              </button>
            </div>
            <datalist id="pokemon-options-a">
              {pokemonSuggestionsA.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <datalist id="pokemon-options-b">
              {pokemonSuggestionsB.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <ul className="rows">
              {deckOptions.map((deck) => (
                <li className="row" key={deck}>
                  <span className="deckLabel">
                    <ArchetypeIcons archetype={deck} />
                    {deckOptionLabel(deck)}
                  </span>
                  <button
                    className="dangerBtn"
                    type="button"
                    disabled={deck === "Other" || !savedDecks.some((d) => d.displayName === deck)}
                    onClick={() => removeDeckOption(deck)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <p className="mutedText">
              Decks are saved per format so you can keep old rotation data. `Other` stays available
              with a Substitute icon.
            </p>
          </article>
        ) : (
          <article className="panel">
            <h2 className="panelTitle">My Logged Games</h2>
            <p className="mutedText">
              Edit your own matches here (winner + deck archetypes). This keeps shared logs view clean.
            </p>
            {myGames.length === 0 ? (
              <p className="mutedText">You have not logged any games yet.</p>
            ) : (
              <ul className="rows">
                {myGames.map((game) => (
                  <li key={game.id} className="row">
                    <div>
                      <strong>
                        {game.playerAName} vs {game.playerBName}
                      </strong>
                      {editingImportedMatchId === game.id ? (
                        <div className="inlineActions">
                          <select value={editImportedA} onChange={(e) => setEditImportedA(e.target.value)}>
                            {decksInUse.map((deck) => (
                              <option key={`${game.id}-a-${deck}`} value={deck}>
                                {deckOptionLabel(deck)}
                              </option>
                            ))}
                          </select>
                          <select value={editImportedB} onChange={(e) => setEditImportedB(e.target.value)}>
                            {decksInUse.map((deck) => (
                              <option key={`${game.id}-b-${deck}`} value={deck}>
                                {deckOptionLabel(deck)}
                              </option>
                            ))}
                          </select>
                          <select
                            value={editWinnerSide}
                            onChange={(e) => setEditWinnerSide(e.target.value as "A" | "B")}
                          >
                            <option value="A">Winner: {game.playerAName}</option>
                            <option value="B">Winner: {game.playerBName}</option>
                          </select>
                        </div>
                      ) : (
                        <p className="mutedText">
                          {game.archetypeA} vs {game.archetypeB} | Winner:{" "}
                          {game.winnerSide === "A" ? game.playerAName : game.playerBName}
                        </p>
                      )}
                    </div>
                    {editingImportedMatchId === game.id ? (
                      <div className="inlineActions">
                        <button
                          className="actionBtn"
                          type="button"
                          disabled={savingImportedEdit}
                          onClick={() => void saveImportedEdit(game.id)}
                        >
                          {savingImportedEdit ? "Saving..." : "Save"}
                        </button>
                        <button
                          className="secondaryBtn"
                          type="button"
                          onClick={() => setEditingImportedMatchId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button className="secondaryBtn" type="button" onClick={() => startImportedEdit(game)}>
                        Edit Match
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </article>
        )}
      </section>
    </main>
  );
}
