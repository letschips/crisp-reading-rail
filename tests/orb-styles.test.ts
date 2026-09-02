// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  INLINE_ORB_SVGS,
  ORB_IMAGE_DATA_URLS,
  ORB_STYLE_OPTIONS,
  RANDOM_DAILY_ORB_STYLES,
  STATIC_ORB_STYLES,
  normalizeOrbStyle,
  resolveOrbStyle,
} from "../src/orb-styles";

describe("orb styles", () => {
  it("normalizes unknown persisted values to default", () => {
    expect(normalizeOrbStyle("soccer")).toBe("soccer");
    expect(normalizeOrbStyle("followFileExplorer")).toBe("followFileExplorer");
    expect(normalizeOrbStyle("removed-style")).toBe("default");
    expect(normalizeOrbStyle(undefined)).toBe("default");
  });

  it("exposes the complete approved setting menu", () => {
    expect(ORB_STYLE_OPTIONS).toHaveLength(40);
    expect(ORB_STYLE_OPTIONS[0]).toEqual({
      value: "followFileExplorer",
      label: "跟随 Crisp File Explorer",
    });
    expect(ORB_STYLE_OPTIONS[ORB_STYLE_OPTIONS.length - 1]).toEqual({
      value: "vinyl",
      label: "Vinyl",
    });
    expect(ORB_STYLE_OPTIONS).toContainEqual({ value: "taiga", label: "Taiga" });
    expect(ORB_STYLE_OPTIONS).toContainEqual({ value: "dizzy", label: "Dizzy Emoji" });
    expect(ORB_STYLE_OPTIONS).toContainEqual({ value: "vinyl", label: "Vinyl" });
  });

  it("maps every material style to inline SVG or an owned asset", () => {
    expect(RANDOM_DAILY_ORB_STYLES).toHaveLength(37);

    for (const style of RANDOM_DAILY_ORB_STYLES) {
      expect(Boolean(INLINE_ORB_SVGS[style] ?? ORB_IMAGE_DATA_URLS[style]))
        .toBe(true);
    }

    expect(STATIC_ORB_STYLES).toEqual(
      new Set([
        "character1",
        "character2",
        "character3",
        "character4",
        "character5",
        "snorlax",
        "pikachu",
        "snorlaxface",
        "batman",
        "superman",
        "spiderman",
      ]),
    );
  });

  it("embeds every orb inline and keeps only character PNGs as data URLs", () => {
    expect(ORB_IMAGE_DATA_URLS).toMatchObject({
      character1: expect.stringMatching(/^data:image\/png;base64,/),
      character2: expect.stringMatching(/^data:image\/png;base64,/),
      character3: expect.stringMatching(/^data:image\/png;base64,/),
    });
    expect(ORB_IMAGE_DATA_URLS.character1?.length).toBeGreaterThan(1000);

    for (const style of ["snorlax", "pikachu", "snorlaxface", "batman", "superman", "spiderman", "character4", "character5"] as const) {
      expect(STATIC_ORB_STYLES.has(style)).toBe(true);
    }
    for (const style of ["soccer", "basketball", "tennis", "shutup", "pokeball", "bracelet", "angry", "squint", "facemask", "pokerface", "captainshield", "dizzy", "vinyl"] as const) {
      expect(STATIC_ORB_STYLES.has(style)).toBe(false);
    }
  });

  it("resolves random per day deterministically from the local date", () => {
    const date = new Date(2026, 6, 15, 9, 30);
    const first = resolveOrbStyle("randomDaily", document, date);
    const second = resolveOrbStyle("randomDaily", document, date);

    expect(first).toBe(second);
    expect(RANDOM_DAILY_ORB_STYLES).toContain(first);
  });

  it("follows only a valid companion orb in the supplied document", () => {
    document.body.innerHTML = '<div class="crisp-fe-orb" data-orb-style="gear"></div>';
    const otherDocument = document.implementation.createHTMLDocument("secondary");
    otherDocument.body.innerHTML =
      '<div class="crisp-fe-orb" data-orb-style="tennis"></div>';

    expect(resolveOrbStyle("followFileExplorer", document)).toBe("gear");
    expect(resolveOrbStyle("followFileExplorer", otherDocument)).toBe("tennis");
  });

  it("falls back to default when the companion orb is absent or invalid", () => {
    document.body.innerHTML = "";
    expect(resolveOrbStyle("followFileExplorer", document)).toBe("default");

    document.body.innerHTML =
      '<div class="crisp-fe-orb" data-orb-style="randomDaily"></div>';
    expect(resolveOrbStyle("followFileExplorer", document)).toBe("default");
  });
});
