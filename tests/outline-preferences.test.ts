import { describe, expect, it } from "vitest";
import { resolveOutlinePreferences } from "../src/outline-preferences";

describe("outline preferences", () => {
  it("uses global defaults and accepts safe per-note overrides", () => {
    const global = { enabled: true, maxLevel: 4 as const, scope: "all" as const };
    expect(resolveOutlinePreferences(global, undefined)).toEqual(global);
    expect(resolveOutlinePreferences(global, {
      "crisp-reading-rail": false,
      "crisp-reading-rail-levels": 3,
      "crisp-reading-rail-scope": "current-h2",
    })).toEqual({ enabled: false, maxLevel: 3, scope: "currentH2" });
  });

  it("ignores malformed frontmatter without disabling the rail", () => {
    expect(resolveOutlinePreferences(
      { enabled: true, maxLevel: 3, scope: "currentH2" },
      {
        "crisp-reading-rail": "no",
        "crisp-reading-rail-levels": 6,
        "crisp-reading-rail-scope": "nearby",
      },
    )).toEqual({ enabled: true, maxLevel: 3, scope: "currentH2" });
  });
});
