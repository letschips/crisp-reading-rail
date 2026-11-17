import { describe, expect, it, vi } from "vitest";
import { LicenseGate } from "../src/license-gate";
import type { LicenseVerifyResult } from "../src/license";
import { readingRailEntitled } from "../src/entitlement";

function makeGate(code: string, local: LicenseVerifyResult, online: LicenseVerifyResult) {
  const changes: boolean[] = [];
  const verify = vi.fn(async (_code: string, skipOnline: boolean) => (skipOnline ? local : online));
  const gate = new LicenseGate(() => code, verify, (licensed) => changes.push(licensed));
  return { gate, verify, changes };
}

describe("LicenseGate", () => {
  it("keeps the plugin off without a license code and never calls the verifier", async () => {
    const { gate, verify, changes } = makeGate("", { valid: true }, { valid: true });
    const result = await gate.refresh();
    expect(result.valid).toBe(false);
    expect(gate.licensed).toBe(false);
    expect(verify).not.toHaveBeenCalled();
    expect(changes).toEqual([]);
  });

  it("keeps the plugin off when the local signature check fails", async () => {
    const { gate, verify } = makeGate("code", { valid: false, reason: "授权签名无效" }, { valid: true });
    expect((await gate.refresh()).reason).toBe("授权签名无效");
    expect(gate.licensed).toBe(false);
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("turns on after the local check and off again on an explicit online denial", async () => {
    const { gate, changes } = makeGate("code", { valid: true }, { valid: false, reason: "设备数已达上限" });
    const result = await gate.refresh();
    expect(result.valid).toBe(false);
    expect(changes).toEqual([true, false]);
    expect(gate.licensed).toBe(false);
  });

  it("stays on when the online check passes, and skips it for local-only refreshes", async () => {
    const { gate, verify, changes } = makeGate("code", { valid: true }, { valid: true });
    await gate.refresh(false);
    expect(verify).toHaveBeenCalledTimes(1);
    await gate.refresh(true);
    expect(verify).toHaveBeenCalledTimes(3);
    expect(changes).toEqual([true]);
    expect(gate.licensed).toBe(true);
  });

  it("ignores a stale check that finishes after a newer one", async () => {
    let releaseFirst: (value: LicenseVerifyResult) => void = () => undefined;
    const results: Array<Promise<LicenseVerifyResult>> = [
      new Promise((resolve) => { releaseFirst = resolve; }),
      Promise.resolve({ valid: true }),
    ];
    const changes: boolean[] = [];
    const gate = new LicenseGate(() => "code", () => results.shift() as Promise<LicenseVerifyResult>, (licensed) => changes.push(licensed));
    const stale = gate.refresh(false);
    await gate.refresh(false);
    releaseFirst({ valid: false, reason: "old" });
    await stale;
    expect(gate.licensed).toBe(true);
    expect(changes).toEqual([true]);
  });

  describe("hardening", () => {
    const VALID: LicenseVerifyResult = { valid: true, payload: { product: "Crisp Suite", licenseId: "T", userName: "t", expiresAt: "2999-01-01T00:00:00Z", features: ["all"] } };

    it("grants the owner only through a verified result", async () => {
      const owner = {};
      const gate = new LicenseGate(() => "code", async () => VALID, () => undefined, owner);
      expect(readingRailEntitled(owner)).toBe(false);
      await gate.refresh(false);
      expect(readingRailEntitled(owner)).toBe(true);
      expect(gate.licensed).toBe(true);
    });

    it("shadowing licensed or swapping the verifier on the instance does not grant the owner", async () => {
      const owner = {};
      const gate = new LicenseGate(() => "code", async () => ({ valid: false, reason: "bad" }), () => undefined, owner);
      Object.defineProperty(gate, "licensed", { value: true });
      (gate as unknown as { verify: unknown }).verify = async () => VALID;
      await gate.refresh(false);
      expect(readingRailEntitled(owner)).toBe(false);
    });

    it("locks again once the license payload expires", async () => {
      const owner = {};
      const soon: LicenseVerifyResult = { valid: true, payload: { ...VALID.payload!, expiresAt: new Date(Date.now() + 30).toISOString() } };
      const changes: boolean[] = [];
      const gate = new LicenseGate(() => "code", async () => soon, (licensed) => changes.push(licensed), owner);
      await gate.refresh(false);
      expect(readingRailEntitled(owner)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(readingRailEntitled(owner)).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(changes).toEqual([true, false]);
    });
  });
});
