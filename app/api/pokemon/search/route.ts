import { NextResponse } from "next/server";

type PokeApiList = {
  results: Array<{ name: string }>;
};

let cachedNames: string[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

function toDisplayName(apiName: string): string {
  const parts = apiName
    .split("-")
    .filter((part) => part !== "male" && part !== "female");
  if (parts.includes("mega")) {
    const megaIndex = parts.indexOf("mega");
    const base = parts.slice(0, megaIndex).map(capWord).join(" ");
    const suffix = parts.slice(megaIndex + 1).map(capWord).join(" ");
    return suffix ? `Mega ${base} ${suffix}` : `Mega ${base}`;
  }
  return parts.map(capWord).join(" ");
}

function capWord(value: string): string {
  if (!value) return value;
  return `${value[0].toUpperCase()}${value.slice(1).toLowerCase()}`;
}

async function getAllPokemonNames(): Promise<string[]> {
  const now = Date.now();
  if (cachedNames && now - cachedAt < CACHE_TTL_MS) return cachedNames;

  const res = await fetch("https://pokeapi.co/api/v2/pokemon?limit=2000&offset=0", {
    next: { revalidate: 21600 }
  });
  if (!res.ok) {
    throw new Error("Failed to load pokemon list");
  }
  const json = (await res.json()) as PokeApiList;
  const names = new Set<string>();
  for (const entry of json.results) {
    const display = toDisplayName(entry.name);
    if (!display) continue;
    names.add(display);
  }
  cachedNames = Array.from(names).sort((a, b) => a.localeCompare(b));
  cachedAt = now;
  return cachedNames;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim().toLowerCase();
    const limit = Number(searchParams.get("limit") ?? "25");
    const safeLimit = Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 50) : 25;

    const names = await getAllPokemonNames();
    const filtered = q
      ? names.filter((name) => name.toLowerCase().includes(q))
      : names;

    return NextResponse.json({ results: filtered.slice(0, safeLimit) });
  } catch (error) {
    console.error("Pokemon search failure:", error);
    return NextResponse.json({ error: "Unable to load pokemon list right now." }, { status: 500 });
  }
}
