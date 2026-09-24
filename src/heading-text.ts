function findClosingDelimiter(
  text: string,
  start: number,
  open: string,
  close: string,
): number {
  let depth = 0;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\\") {
      index += 1;
      continue;
    }
    if (character === open) {
      depth += 1;
    } else if (character === close) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

interface CrispAnnotation {
  target: string;
  end: number;
}

function findAnnotationDirectiveEnd(text: string, start: number): number {
  let quoted = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\n") {
      return -1;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quoted && character === "\\") {
      escaped = true;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && character === "}") {
      return index;
    }
  }

  return -1;
}

function crispAnnotationAt(text: string, start: number): CrispAnnotation | null {
  if (!text.startsWith("==", start)) {
    return null;
  }
  const targetEnd = text.indexOf("==", start + 2);
  if (targetEnd < 0) {
    return null;
  }
  const target = text.slice(start + 2, targetEnd);
  if (target.length === 0 || target !== target.trim() || target.includes("\n")) {
    return null;
  }

  const directiveStart = targetEnd + 2;
  if (
    !text.startsWith("{ann", directiveStart)
    || !/\s/.test(text[directiveStart + 4] ?? "")
  ) {
    return null;
  }
  const directiveEnd = findAnnotationDirectiveEnd(text, directiveStart + 5);
  if (directiveEnd < 0) {
    return null;
  }
  const attributes = text.slice(directiveStart + 5, directiveEnd);
  const note = /(?:^|\s)note=(?:"((?:\\.|[^"\\])+)"|([^\s}]+))/.exec(attributes);
  if (!note || !(note[1] ?? note[2] ?? "").trim()) {
    return null;
  }

  return {
    target,
    end: directiveEnd + 1,
  };
}

export function headingTextFromMarkdown(markdown: string): string {
  let result = "";

  for (let index = 0; index < markdown.length; index += 1) {
    const annotation = crispAnnotationAt(markdown, index);
    if (annotation) {
      result += headingTextFromMarkdown(annotation.target);
      index = annotation.end - 1;
      continue;
    }

    if (markdown.startsWith("[[", index)) {
      const linkEnd = markdown.indexOf("]]", index + 2);
      if (linkEnd >= 0) {
        const linkText = markdown.slice(index + 2, linkEnd);
        const aliasSeparator = linkText.lastIndexOf("|");
        result += aliasSeparator >= 0
          ? linkText.slice(aliasSeparator + 1)
          : linkText;
        index = linkEnd + 1;
        continue;
      }
    }

    if (markdown[index] !== "[") {
      result += markdown[index];
      continue;
    }

    const labelEnd = findClosingDelimiter(markdown, index, "[", "]");
    const destinationStart = labelEnd + 1;
    if (
      labelEnd < 0
      || markdown[destinationStart] !== "("
    ) {
      result += markdown[index];
      continue;
    }

    const destinationEnd = findClosingDelimiter(
      markdown,
      destinationStart,
      "(",
      ")",
    );
    if (destinationEnd < 0) {
      result += markdown[index];
      continue;
    }

    result += headingTextFromMarkdown(markdown.slice(index + 1, labelEnd));
    index = destinationEnd;
  }

  return stripInlineMarkdown(result);
}

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/%%[\s\S]*?%%/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1$2")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|[^\w])_([^_]+)_(?![\w])/g, "$1$2")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/==([^=]+)==/g, "$1")
    .replace(/^#{1,6}\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}
