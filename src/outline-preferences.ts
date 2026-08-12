export type OutlineMaxLevel = 2 | 3 | 4;
export type OutlineScope = "all" | "currentH2";

export interface OutlinePreferences {
  enabled: boolean;
  maxLevel: OutlineMaxLevel;
  scope: OutlineScope;
}

function normalizeMaxLevel(value: unknown, fallback: OutlineMaxLevel): OutlineMaxLevel {
  const numeric = typeof value === "string" ? Number(value) : value;
  return numeric === 2 || numeric === 3 || numeric === 4 ? numeric : fallback;
}

function normalizeScope(value: unknown, fallback: OutlineScope): OutlineScope {
  if (value === "all") {
    return "all";
  }
  if (value === "current-h2" || value === "currentH2") {
    return "currentH2";
  }
  return fallback;
}

export function resolveOutlinePreferences(
  global: OutlinePreferences,
  frontmatter: Record<string, unknown> | undefined,
): OutlinePreferences {
  return {
    enabled: frontmatter?.["crisp-reading-rail"] === false ? false : global.enabled,
    maxLevel: normalizeMaxLevel(
      frontmatter?.["crisp-reading-rail-levels"],
      global.maxLevel,
    ),
    scope: normalizeScope(
      frontmatter?.["crisp-reading-rail-scope"],
      global.scope,
    ),
  };
}

export function normalizeOutlineMaxLevel(value: unknown): OutlineMaxLevel {
  return normalizeMaxLevel(value, 4);
}

export function normalizeOutlineScope(value: unknown): OutlineScope {
  return normalizeScope(value, "all");
}
