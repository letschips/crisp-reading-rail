import type { RenderedHeading } from "./types";

function renderedHeadingText(heading: HTMLElement): string {
  const clone = heading.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(
    ".heading-collapse-indicator, .crisp-ann__label, .crisp-ann-margin-connectors",
  ).forEach((element) => element.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function collectRenderedHeadings(container: HTMLElement): RenderedHeading[] {
  const containerTop = container.getBoundingClientRect().top;
  return Array.from(container.querySelectorAll<HTMLElement>("h1, h2, h3, h4"))
    .filter((heading) => !heading.closest(".internal-embed, .markdown-embed"))
    .map((heading) => ({
      text: renderedHeadingText(heading),
      level: Number(heading.tagName.slice(1)),
      documentY: heading.getBoundingClientRect().top - containerTop + container.scrollTop,
      target: heading,
    }))
    .filter((heading) => heading.text.length > 0);
}
