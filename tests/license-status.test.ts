import { describe, expect, it } from "vitest";
import { describeLicenseStatus } from "../src/license";

describe("license status", () => {
  it("describes licenses without an expiry date or user name", () => {
    expect(describeLicenseStatus({
      valid: true,
      payload: { product: "Crisp Suite", licenseId: "x", features: ["all"], userName: "A", expiresAt: "2027-01-02T00:00:00Z" },
    })).toBe("✅ 已激活（授权给: A，到期时间: 2027-01-02）");
    expect(describeLicenseStatus({
      valid: true,
      payload: { product: "Crisp Suite", licenseId: "x", features: ["all"] },
    })).toBe("✅ 已激活（到期时间: 长期有效）");
    expect(describeLicenseStatus({ valid: false, reason: "授权签名无效" })).toBe("❌ 未激活（授权签名无效）");
  });
});
