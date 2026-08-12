import { describe, expect, it, vi } from "vitest";
import { createLicenseVerificationCache } from "../src/license";

describe("license verification cache", () => {
  it("deduplicates concurrent verification for the same license and product", async () => {
    const cache = createLicenseVerificationCache(15 * 60 * 1000, () => 1000);
    const verify = vi.fn(async () => ({ valid: true as const }));

    const [first, second] = await Promise.all([
      cache.verify("code", "crisp-reading-rail", verify),
      cache.verify("code", "crisp-reading-rail", verify),
    ]);

    expect(first.valid).toBe(true);
    expect(second.valid).toBe(true);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("reuses recent results and expires them after the ttl", async () => {
    let now = 1000;
    const cache = createLicenseVerificationCache(500, () => now);
    const verify = vi.fn(async () => ({ valid: true as const }));

    await cache.verify("code", "crisp-reading-rail", verify);
    now = 1499;
    await cache.verify("code", "crisp-reading-rail", verify);
    now = 1501;
    await cache.verify("code", "crisp-reading-rail", verify);

    expect(verify).toHaveBeenCalledTimes(2);
  });

  it("separates products and can be cleared when the code changes", async () => {
    const cache = createLicenseVerificationCache(500, () => 1000);
    const verify = vi.fn(async () => ({ valid: true as const }));

    await cache.verify("code", "crisp-reading-rail", verify);
    await cache.verify("code", "crisp-file-explorer", verify);
    cache.clear();
    await cache.verify("code", "crisp-reading-rail", verify);

    expect(verify).toHaveBeenCalledTimes(3);
  });
});
