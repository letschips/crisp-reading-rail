import { clamp01 } from "./progress";
import type { OutlineEntry, ReadingMemory, ReadingWaypoint } from "./types";

export function resolveReadingMarkerProgress(
  marker: ReadingWaypoint | ReadingMemory,
  entries: readonly OutlineEntry[],
): number {
  const exact = entries.find((entry) => (
    marker.headingSourceLine !== undefined
    && marker.headingText !== undefined
    && entry.sourceLine === marker.headingSourceLine
    && entry.text === marker.headingText
    && (marker.headingLevel === undefined || entry.level === marker.headingLevel)
  ));
  if (exact) {
    return clamp01(exact.progress);
  }
  if (marker.headingText !== undefined) {
    const matches = entries.filter((entry) => (
      entry.text === marker.headingText
      && (marker.headingLevel === undefined || entry.level === marker.headingLevel)
    ));
    if (matches.length === 1) {
      return clamp01(matches[0].progress);
    }
  }
  return clamp01(marker.progress);
}

export function createSemanticMarker(
  progress: number,
  entries: readonly OutlineEntry[],
  timestamp: number,
): ReadingWaypoint {
  let active: OutlineEntry | undefined;
  for (const entry of entries) {
    if (entry.progress > progress) {
      break;
    }
    active = entry;
  }
  return {
    progress: clamp01(progress),
    ...(active ? {
      headingText: active.text,
      headingLevel: active.level,
      headingSourceLine: active.sourceLine,
    } : {}),
    createdAt: timestamp,
  };
}
