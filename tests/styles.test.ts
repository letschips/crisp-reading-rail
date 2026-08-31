// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "styles.css"), "utf8");

describe("Crisp Reading Rail styles", () => {
  it("keeps the interactive rail below the native view header", () => {
    const rootBlock = css.match(/\.crisp-reading-rail\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(rootBlock).toMatch(
      /top:\s*calc\(var\(--header-height, 45px\) \+ 18px\);/,
    );
    expect(rootBlock).toMatch(/z-index:\s*0;/);
  });

  it("uses the companion rail's focus glow and mirrored tick proportions", () => {
    expect(css).toMatch(
      /\.crisp-reading-rail \.crisp-reading-rail__line-focus\s*{[\s\S]*?height: 192px;[\s\S]*?linear-gradient/,
    );
    expect(css).toMatch(
      /\.crisp-reading-rail \.crisp-reading-rail__tick\s*{[\s\S]*?width: 14px;/,
    );
    expect(css).toMatch(
      /\.crisp-reading-rail \.crisp-reading-rail__heading-tick\[data-level="2"\]\s*{\s*width: 24px;/,
    );
  });

  it("keeps only the orb-centered focus line instead of a full-height rule", () => {
    expect(css).toMatch(
      /\.crisp-reading-rail \.crisp-reading-rail__line::before\s*{[\s\S]*?content: none;/,
    );
    expect(css).not.toMatch(
      /focus-visible[\s\S]*?\.crisp-reading-rail__line::before/,
    );
    expect(css).toMatch(
      /focus-visible[\s\S]*?\.crisp-reading-rail__line-focus/,
    );
  });

  it("exposes a touch-safe grab affordance and restrained drag feedback", () => {
    expect(css).toMatch(
      /\.crisp-reading-rail \.crisp-reading-rail__orb\s*{[\s\S]*?cursor: grab;[\s\S]*?touch-action: none;/,
    );
    expect(css).toMatch(
      /\.crisp-reading-rail \.crisp-reading-rail__orb\.is-dragging\s*{[\s\S]*?cursor: grabbing;/,
    );
    expect(css).not.toContain("transition: all");
  });

  it("shows replacement sports SVGs without the legacy white ring", () => {
    const whiteRingBlock = css.match(
      /\.crisp-reading-rail__orb\[data-orb-style="redball"\]\s*\{([^}]*)\}/,
    );
    const transparentBlock = css.match(
      /\.crisp-reading-rail__orb\[data-orb-style="soccer"\][\s\S]*?\.crisp-reading-rail__orb\[data-orb-style="snorlaxface"\]\s*\{([^}]*)\}/,
    );

    expect(whiteRingBlock?.[1]).toMatch(/background:\s*#fff/);
    expect(transparentBlock?.[1]).toMatch(/background:\s*transparent/);
    expect(transparentBlock?.[1]).toMatch(/box-shadow:\s*none/);
    expect(transparentBlock?.[1]).not.toMatch(/background:\s*#fff/);
    for (const style of ["angry", "squint", "facemask", "pokerface", "captainshield", "batman", "superman", "spiderman"]) {
      expect(css).toMatch(new RegExp(`data-orb-style="${style}"\\]`));
    }
  });

  it("keeps static character orbs larger than the shared image orb size", () => {
    const staticBlock = css.match(
      /\.crisp-reading-rail__orb\[data-orb-style="character1"\][\s\S]*?\.crisp-reading-rail__orb\[data-orb-style="spiderman"\]\s*\{([^}]*)\}/,
    );

    expect(staticBlock?.[1]).toMatch(/width:\s*24px/);
    expect(staticBlock?.[1]).toMatch(/height:\s*24px/);
    expect(staticBlock?.[0]).toMatch(/data-orb-style="character4"/);
    expect(staticBlock?.[0]).toMatch(/data-orb-style="character5"/);
  });

  it("keeps label motion responsive without sticky touch hover", () => {
    expect(css).not.toContain(
      ".crisp-reading-rail:hover .crisp-reading-rail__label",
    );
    expect(css).toMatch(
      /\.crisp-reading-rail \.crisp-reading-rail__label\s*{[\s\S]*?transition:\s*opacity 120ms cubic-bezier\(0\.23, 1, 0\.32, 1\),\s*transform 120ms cubic-bezier\(0\.23, 1, 0\.32, 1\);/,
    );
  });

  it("starts wrapped dense labels on a new left-aligned line", () => {
    const styleElement = document.createElement("style");
    styleElement.textContent = css;
    const root = document.createElement("div");
    root.className = "crisp-reading-rail is-dense";
    const label = document.createElement("button");
    label.className = "crisp-reading-rail__label";
    label.textContent = "04. A long heading that wraps onto another line";
    root.append(label);
    document.head.append(styleElement);
    document.body.append(root);

    const computed = getComputedStyle(label);

    expect(computed.display).toBe("block");
    expect(computed.textAlign).toBe("left");
    styleElement.remove();
    root.remove();
  });

  it("uses compositor-safe settings groups without animated layout properties", () => {
    expect(css).toContain(".crisp-rr-setting-card");
    expect(css).not.toContain("grid-template-rows");
    expect(css).not.toMatch(/transition:[^;]*(?:padding|height|max-height)/);
    expect(css).toMatch(
      /\.crisp-rr-setting-card\[open\]\s+\.crisp-rr-setting-card__chevron::after/,
    );
  });

  it("keeps waypoint hover restrained and limited to hover-capable pointers", () => {
    expect(css).toMatch(
      /\.crisp-reading-rail__waypoint\s*{[\s\S]*?top:\s*calc\(var\(--crisp-reading-waypoint-progress\) \* 100%\);/,
    );
    expect(css).toMatch(
      /@media \(hover: hover\) and \(pointer: fine\)\s*{[\s\S]*?\.crisp-reading-rail__waypoint:hover[\s\S]*?scale:\s*1\.1;/,
    );
    expect(css).not.toContain("scale(1.45)");
  });

  it("celebrates with independent transform properties and honors reduced motion", () => {
    const celebration = css.match(
      /@keyframes crisp-orb-celebrate\s*{([\s\S]*?)\n}/,
    )?.[1] ?? "";
    expect(celebration).toContain("scale:");
    expect(celebration).toContain("rotate:");
    expect(celebration).not.toContain("transform:");
    expect(css).toMatch(
      /\.crisp-reading-rail \.crisp-reading-rail__orb\.is-celebrating\s*{[\s\S]*?animation: crisp-orb-celebrate 240ms/,
    );
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.crisp-reading-rail__orb\.is-celebrating[\s\S]*?animation: none;/,
    );
  });
});
