import { describe, expect, it } from "vitest";
import { resolveReadingMarkerProgress } from "../src/reading-memory";
import type { OutlineEntry, ReadingMemory } from "../src/types";

function entry(
  text: string,
  level: number,
  sourceLine: number,
  progress: number,
): OutlineEntry {
  return { text, level, sourceLine, progress, documentY: 0, labelY: 0, target: null };
}

describe("reading memory resolution", () => {
  it("reanchors to an exact source-line and heading match", () => {
    const marker: ReadingMemory = {
      progress: 0.7,
      headingText: "Methods",
      headingLevel: 2,
      headingSourceLine: 20,
      updatedAt: 100,
    };
    expect(resolveReadingMarkerProgress(marker, [
      entry("Methods", 2, 20, 0.35),
      entry("Results", 2, 50, 0.8),
    ])).toBe(0.35);
  });

  it("falls back to a unique heading and then stored progress", () => {
    const marker: ReadingMemory = {
      progress: 0.7,
      headingText: "Methods",
      headingLevel: 2,
      headingSourceLine: 20,
      updatedAt: 100,
    };
    expect(resolveReadingMarkerProgress(marker, [
      entry("Methods", 2, 30, 0.4),
    ])).toBe(0.4);
    expect(resolveReadingMarkerProgress(marker, [
      entry("Methods", 2, 30, 0.4),
      entry("Methods", 2, 60, 0.8),
    ])).toBe(0.7);
  });
});
