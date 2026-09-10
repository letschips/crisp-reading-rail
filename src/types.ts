export interface OutlineHeading {
  text: string;
  level: number;
  sourceLine: number;
}

export interface RenderedHeading {
  text: string;
  level: number;
  documentY: number;
  target: HTMLElement;
}

export interface OutlineEntry extends OutlineHeading {
  documentY: number;
  progress: number;
  labelY: number;
  target: HTMLElement | null;
  /**
   * Set by the view when collision avoidance had to move this entry's label away from
   * its own heading. Navigation follows the label so the orb lands under the label the
   * reader actually clicked; entries that sit on their heading leave this undefined.
   */
  labelProgress?: number;
}

export interface ReadingWaypoint {
  progress: number;
  headingText?: string;
  headingLevel?: number;
  headingSourceLine?: number;
  createdAt?: number;
}

export interface ReadingMemory extends ReadingWaypoint {
  updatedAt: number;
}
