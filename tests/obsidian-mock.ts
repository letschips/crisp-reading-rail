export class MarkdownView {}

export const Platform = { isMobile: false };

export function requestUrl(): Promise<never> {
  throw new Error("requestUrl is unavailable in unit tests");
}
