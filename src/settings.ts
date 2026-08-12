import { normalizeOrbStyle, type OrbStyleSetting } from "./orb-styles";
import {
  normalizeSoundStyle,
  type ReadingRailSoundStyle,
} from "./sound-styles";
import type { ReadingMemory, ReadingWaypoint } from "./types";
import {
  normalizeOutlineMaxLevel,
  normalizeOutlineScope,
  type OutlineMaxLevel,
  type OutlineScope,
} from "./outline-preferences";

const MAX_WAYPOINTS_PER_NOTE = 50;
const MAX_WAYPOINT_NOTES = 500;
const WAYPOINT_PRECISION = 4;

export type ReadingWaypointMap = Record<string, ReadingWaypoint[]>;
export type ReadingMemoryMap = Record<string, ReadingMemory>;

export interface CrispReadingRailSettings {
  orbStyle: OrbStyleSetting;
  soundEnabled: boolean;
  soundStyle: ReadingRailSoundStyle;
  releaseSoundEnabled: boolean;
  waypoints: ReadingWaypointMap;
  readingMemory: ReadingMemoryMap;
  outlineMaxLevel: OutlineMaxLevel;
  outlineScope: OutlineScope;
  licenseCode: string;
}

export const DEFAULT_SETTINGS: CrispReadingRailSettings = {
  orbStyle: "default",
  soundEnabled: false,
  soundStyle: "followFileExplorer",
  releaseSoundEnabled: true,
  waypoints: {},
  readingMemory: {},
  outlineMaxLevel: 4,
  outlineScope: "all",
  licenseCode: "",
};

function normalizeProgress(value: unknown): number | null {
  if (
    typeof value !== "number"
    || !Number.isFinite(value)
    || value < 0
    || value > 1
  ) {
    return null;
  }
  return Number(value.toFixed(WAYPOINT_PRECISION));
}

function normalizeHeadingFields(
  source: Record<string, unknown>,
): Omit<ReadingWaypoint, "progress"> {
  const result: Omit<ReadingWaypoint, "progress"> = {};
  if (typeof source.headingText === "string" && source.headingText.trim()) {
    result.headingText = source.headingText.trim();
  }
  if (
    typeof source.headingLevel === "number"
    && Number.isInteger(source.headingLevel)
    && source.headingLevel >= 1
    && source.headingLevel <= 6
  ) {
    result.headingLevel = source.headingLevel;
  }
  if (
    typeof source.headingSourceLine === "number"
    && Number.isInteger(source.headingSourceLine)
    && source.headingSourceLine >= 0
  ) {
    result.headingSourceLine = source.headingSourceLine;
  }
  if (typeof source.createdAt === "number" && Number.isFinite(source.createdAt)) {
    result.createdAt = source.createdAt;
  }
  return result;
}

export function normalizeWaypoints(value: unknown): ReadingWaypoint[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const unique = new Map<number, ReadingWaypoint>();
  for (const candidate of value) {
    const source = candidate && typeof candidate === "object"
      ? candidate as Record<string, unknown>
      : null;
    const progress = normalizeProgress(source?.progress ?? candidate);
    if (progress === null || unique.has(progress)) {
      continue;
    }
    unique.set(progress, {
      progress,
      ...(source ? normalizeHeadingFields(source) : {}),
    });
  }
  return [...unique.values()]
    .sort((left, right) => left.progress - right.progress)
    .slice(0, MAX_WAYPOINTS_PER_NOTE);
}

export function normalizeWaypointMap(value: unknown): ReadingWaypointMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const normalized: ReadingWaypointMap = {};
  const entries = Object.entries(value as Record<string, unknown>)
    .slice(0, MAX_WAYPOINT_NOTES);
  for (const [path, waypoints] of entries) {
    if (path.trim().length === 0) {
      continue;
    }
    const noteWaypoints = normalizeWaypoints(waypoints);
    if (noteWaypoints.length > 0) {
      normalized[path] = noteWaypoints;
    }
  }
  return normalized;
}

export function updateWaypointMap(
  current: Record<string, readonly (ReadingWaypoint | number)[]>,
  filePath: string,
  waypoints: readonly (ReadingWaypoint | number)[],
): ReadingWaypointMap {
  const next = normalizeWaypointMap(current);
  const normalized = normalizeWaypoints(waypoints);
  if (normalized.length === 0) {
    delete next[filePath];
  } else {
    next[filePath] = normalized;
  }
  return next;
}

export function rewriteWaypointMapPaths(
  current: Record<string, readonly (ReadingWaypoint | number)[]>,
  oldPath: string,
  newPath: string | null,
): ReadingWaypointMap {
  const sourcePath = oldPath.replace(/\/+$/, "");
  const destinationPath = newPath?.replace(/\/+$/, "") ?? null;
  if (sourcePath.length === 0 || destinationPath === sourcePath) {
    return normalizeWaypointMap(current);
  }

  const next: ReadingWaypointMap = {};
  for (const [path, waypoints] of Object.entries(current)) {
    const matches = path === sourcePath || path.startsWith(`${sourcePath}/`);
    if (matches && destinationPath === null) {
      continue;
    }
    const rewrittenPath = matches
      ? `${destinationPath}${path.slice(sourcePath.length)}`
      : path;
    next[rewrittenPath] = normalizeWaypoints([
      ...(next[rewrittenPath] ?? []),
      ...waypoints,
    ]);
  }
  return normalizeWaypointMap(next);
}

function normalizeReadingMemory(value: unknown): ReadingMemory | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const source = value as Record<string, unknown>;
  const progress = normalizeProgress(source.progress);
  if (
    progress === null
    || typeof source.updatedAt !== "number"
    || !Number.isFinite(source.updatedAt)
  ) {
    return null;
  }
  const heading = normalizeHeadingFields(source);
  delete heading.createdAt;
  return { progress, ...heading, updatedAt: source.updatedAt };
}

export function normalizeReadingMemoryMap(value: unknown): ReadingMemoryMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const normalized: ReadingMemoryMap = {};
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([path, memory]) => [path, normalizeReadingMemory(memory)] as const)
    .filter((entry): entry is readonly [string, ReadingMemory] => (
      entry[0].trim().length > 0 && entry[1] !== null
    ))
    .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
    .slice(0, MAX_WAYPOINT_NOTES);
  for (const [path, memory] of entries) {
    normalized[path] = memory;
  }
  return normalized;
}

export function updateReadingMemoryMap(
  current: ReadingMemoryMap,
  filePath: string,
  memory: ReadingMemory,
  limit = MAX_WAYPOINT_NOTES,
): ReadingMemoryMap {
  const normalized = normalizeReadingMemory(memory);
  if (!normalized || !filePath.trim()) {
    return normalizeReadingMemoryMap(current);
  }
  const entries = Object.entries({ ...current, [filePath]: normalized })
    .sort((left, right) => right[1].updatedAt - left[1].updatedAt)
    .slice(0, Math.max(1, Math.floor(limit)));
  return Object.fromEntries(entries);
}

export function rewriteReadingMemoryMapPaths(
  current: ReadingMemoryMap,
  oldPath: string,
  newPath: string | null,
): ReadingMemoryMap {
  const sourcePath = oldPath.replace(/\/+$/, "");
  const destinationPath = newPath?.replace(/\/+$/, "") ?? null;
  if (!sourcePath || destinationPath === sourcePath) {
    return normalizeReadingMemoryMap(current);
  }
  const next: ReadingMemoryMap = {};
  for (const [path, memory] of Object.entries(current)) {
    const matches = path === sourcePath || path.startsWith(`${sourcePath}/`);
    if (matches && destinationPath === null) {
      continue;
    }
    const rewrittenPath = matches
      ? `${destinationPath}${path.slice(sourcePath.length)}`
      : path;
    const previous = next[rewrittenPath];
    if (!previous || memory.updatedAt >= previous.updatedAt) {
      next[rewrittenPath] = memory;
    }
  }
  return normalizeReadingMemoryMap(next);
}

export function normalizeSettings(value: unknown): CrispReadingRailSettings {
  const candidate = value && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
  return {
    orbStyle: normalizeOrbStyle(candidate.orbStyle),
    soundEnabled: candidate.soundEnabled === true,
    soundStyle: normalizeSoundStyle(candidate.soundStyle),
    releaseSoundEnabled: candidate.releaseSoundEnabled !== false,
    waypoints: normalizeWaypointMap(candidate.waypoints),
    readingMemory: normalizeReadingMemoryMap(candidate.readingMemory),
    outlineMaxLevel: normalizeOutlineMaxLevel(candidate.outlineMaxLevel),
    outlineScope: normalizeOutlineScope(candidate.outlineScope),
    licenseCode: typeof candidate.licenseCode === "string" ? candidate.licenseCode.trim() : "",
  };
}
