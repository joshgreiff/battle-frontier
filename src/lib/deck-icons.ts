const aliasToDexId: Record<string, string> = {
  "charizard": "charizard",
  "charizard ex": "charizard",
  "pidgeot": "pidgeot",
  "noctowl": "noctowl",
  "dragapult": "dragapult",
  "dusknoir": "dusknoir",
  "gardevoir": "gardevoir",
  "gardevoir ex": "gardevoir",
  "jellicent": "jellicent",
  "mega absol": "absol-mega",
  "mega kangaskhan": "kangaskhan-mega",
  "ogerpon wellspring": "ogerpon-wellspring",
  "ogerpon wellspring mask": "ogerpon-wellspring",
  "ogerpon hearthflame": "ogerpon-hearthflame",
  "ogerpon hearthflame mask": "ogerpon-hearthflame",
  "ogerpon cornerstone": "ogerpon-cornerstone",
  "ogerpon cornerstone mask": "ogerpon-cornerstone",
  "ogerpon teal mask": "ogerpon",
  "other": "substitute"
};

function normalizeName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .replace(/^[a-z0-9 .-]+'s\s+/g, "")
    .replace(/’/g, "'")
    .replace(/\s+/g, " ");
}

function toDexId(raw: string): string {
  const normalized = normalizeName(raw).replace(/\b(ex|v|vmax)\b/g, "").trim();
  const byAlias = aliasToDexId[normalizeName(raw)] ?? aliasToDexId[normalized];
  if (byAlias) return byAlias;
  if (normalized.startsWith("mega ")) {
    const base = normalized.slice(5).trim().replace(/[^a-z0-9]/g, "");
    if (base) return `${base}-mega`;
  }
  return normalized.replace(/[^a-z0-9]/g, "");
}

export function getArchetypeIconIds(archetype: string): string[] {
  const pieces = archetype
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (pieces.length === 0) return ["substitute"];
  return pieces.map(toDexId);
}

export function getPokemonIconUrl(iconId: string): string {
  if (iconId === "pokeball") {
    return "https://play.pokemonshowdown.com/sprites/itemicons/pokeball.png";
  }
  if (iconId === "ogerpon") {
    return "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1017.png";
  }
  if (iconId === "ogerpon-wellspring") {
    return "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10273.png";
  }
  if (iconId === "ogerpon-hearthflame") {
    return "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10274.png";
  }
  if (iconId === "ogerpon-cornerstone") {
    return "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10275.png";
  }
  return `https://play.pokemonshowdown.com/sprites/gen5/${iconId}.png`;
}
