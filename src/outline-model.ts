import { clamp01 } from "./progress";
import type {
  OutlineEntry,
  OutlineHeading,
  RenderedHeading,
} from "./types";

const MIN_LEVEL = 2;
const MAX_LEVEL = 4;

export function buildOutlineEntries(
  headings: readonly OutlineHeading[],
  rendered: readonly RenderedHeading[],
  contentTop: number,
  maxScroll: number,
  sourceLineCount?: number,
  knownDocumentY?: ReadonlyMap<number, number>,
): OutlineEntry[] {
  const eligible = headings.filter(
    (heading) => heading.level >= MIN_LEVEL && heading.level <= MAX_LEVEL,
  );
  const virtualized = sourceLineCount !== undefined
    && sourceLineCount > 1
    && rendered.length < eligible.length;
  if (virtualized) {
    const lastSourceLine = sourceLineCount - 1;
    let renderedIndex = 0;
    const matched = eligible.map((source) => {
      const candidate = rendered[renderedIndex];
      const target = candidate
        && candidate.text === source.text
        && candidate.level === source.level
        ? candidate.target
        : null;
      if (target) {
        renderedIndex += 1;
      }
      return {
        source,
        target,
        documentY: target ? candidate.documentY : null,
      };
    });
    const positions = resolveVirtualizedDocumentY(matched, knownDocumentY);
    return matched.map((entry, index) => {
      const measured = positions[index];
      if (measured === null) {
        // Nothing has ever been seen on screen for this heading, so the source-line
        // ratio is the only signal left.
        const progress = clamp01(entry.source.sourceLine / lastSourceLine);
        return {
          ...entry.source,
          documentY: contentTop + progress * maxScroll,
          progress,
          labelY: 0,
          target: entry.target,
        };
      }
      return {
        ...entry.source,
        documentY: measured,
        progress: maxScroll > 0 ? clamp01((measured - contentTop) / maxScroll) : 0,
        labelY: 0,
        target: entry.target,
      };
    });
  }

  const count = Math.min(eligible.length, rendered.length);
  const entries: OutlineEntry[] = [];

  for (let index = 0; index < count; index += 1) {
    const source = eligible[index];
    const target = rendered[index];
    if (source.text !== target.text || source.level !== target.level) {
      continue;
    }

    entries.push({
      ...source,
      ...target,
      progress: maxScroll <= 0
        ? 0
        : clamp01((target.documentY - contentTop) / maxScroll),
      labelY: 0,
    });
  }

  return entries;
}

/**
 * Where to draw a heading Obsidian is not currently rendering. A remembered measurement
 * always wins; between two remembered anchors a linear interpolation is close enough to
 * keep the outline in order. Headings with no anchor on either side stay null, and the
 * caller falls back to the source-line ratio for those.
 *
 * Without this, every heading flips between its measured position and the ratio estimate
 * as the render window moves, so the labels visibly slide around while the reader scrolls.
 */
function resolveVirtualizedDocumentY(
  matched: readonly { source: OutlineHeading; documentY: number | null }[],
  knownDocumentY?: ReadonlyMap<number, number>,
): Array<number | null> {
  const positions = matched.map((entry) => {
    if (entry.documentY !== null) {
      return entry.documentY;
    }
    const remembered = knownDocumentY?.get(entry.source.sourceLine);
    return remembered === undefined ? null : remembered;
  });

  for (let index = 0; index < positions.length; index += 1) {
    if (positions[index] !== null) {
      continue;
    }
    let lower = -1;
    for (let scan = index - 1; scan >= 0; scan -= 1) {
      if (positions[scan] !== null) {
        lower = scan;
        break;
      }
    }
    let upper = -1;
    for (let scan = index + 1; scan < positions.length; scan += 1) {
      if (positions[scan] !== null) {
        upper = scan;
        break;
      }
    }
    if (lower < 0 || upper < 0) {
      continue;
    }
    const lowerY = positions[lower];
    const upperY = positions[upper];
    if (lowerY === null || upperY === null) {
      continue;
    }
    const lowerLine = matched[lower].source.sourceLine;
    const upperLine = matched[upper].source.sourceLine;
    const span = upperLine - lowerLine;
    const ratio = span === 0
      ? 0
      : (matched[index].source.sourceLine - lowerLine) / span;
    positions[index] = lowerY + (upperY - lowerY) * ratio;
  }

  return positions;
}

export function resolveLabelPositions(
  entries: readonly OutlineEntry[],
  trackHeight: number,
  labelHeight: number,
  minGap: number,
): OutlineEntry[] {
  return resolveVariableLabelPositions(
    entries,
    trackHeight,
    entries.map(() => labelHeight),
    minGap,
  );
}

export function resolveVariableLabelPositions(
  entries: readonly OutlineEntry[],
  trackHeight: number,
  labelHeights: readonly number[],
  minGap: number,
): OutlineEntry[] {
  if (entries.length === 0) {
    return [];
  }

  const availableHeight = Math.max(0, trackHeight);
  const gap = Math.max(0, minGap);
  const heights = entries.map((_, index) => (
    Math.min(availableHeight, Math.max(0, labelHeights[index] ?? 0))
  ));
  const requestedHeight = heights.reduce((sum, height) => sum + height, 0)
    + gap * Math.max(0, entries.length - 1);

  if (requestedHeight > availableHeight) {
    const sharedMaxY = heights.reduce(
      (maximum, height) => Math.min(maximum, availableHeight - height),
      availableHeight,
    );
    const positions = entries.map((_, index) => (
      entries.length === 1 ? 0 : sharedMaxY * index / (entries.length - 1)
    ));
    return withLabelPositions(entries, positions);
  }

  const positions = entries.map((entry, index) => {
    const height = heights[index];
    const maxY = Math.max(0, availableHeight - height);
    return Math.min(
      maxY,
      Math.max(0, entry.progress * availableHeight - height / 2),
    );
  });

  for (let index = 1; index < positions.length; index += 1) {
    positions[index] = Math.max(
      positions[index],
      positions[index - 1] + heights[index - 1] + gap,
    );
  }

  const lastIndex = positions.length - 1;
  const lastMaxY = Math.max(0, availableHeight - heights[lastIndex]);
  if (positions[lastIndex] > lastMaxY) {
    positions[lastIndex] = lastMaxY;
    for (let index = positions.length - 2; index >= 0; index -= 1) {
      positions[index] = Math.min(
        positions[index],
        positions[index + 1] - heights[index] - gap,
      );
    }
  }

  if (positions[0] < 0) {
    const shift = -positions[0];
    positions.forEach((position, index) => {
      positions[index] = position + shift;
    });
  }

  return withLabelPositions(entries, positions);
}

export function labelListOverflows(
  entries: readonly OutlineEntry[],
  trackHeight: number,
  labelHeights: readonly number[],
  minGap: number,
): boolean {
  if (entries.length === 0) {
    return false;
  }
  const availableHeight = Math.max(0, trackHeight);
  const gap = Math.max(0, minGap);
  const requestedHeight = entries.reduce((sum, _, index) => (
    sum + Math.min(availableHeight, Math.max(0, labelHeights[index] ?? 0))
  ), 0) + gap * Math.max(0, entries.length - 1);
  return requestedHeight > availableHeight;
}

function withLabelPositions(
  entries: readonly OutlineEntry[],
  positions: readonly number[],
): OutlineEntry[] {
  return entries.map((entry, index) => ({
    ...entry,
    labelY: positions[index],
  }));
}

export function activeHeadingIndex(
  entries: readonly OutlineEntry[],
  scrollTop: number,
  activationOffset: number,
): number {
  const threshold = scrollTop + activationOffset;
  let low = 0;
  let high = entries.length - 1;
  let active = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (entries[middle].documentY <= threshold) {
      active = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return active;
}
