import type { LicenseVerifyResult } from "./license";
import { applyEntitlement, onEntitlementChange, readingRailEntitled } from "./entitlement";

export type LicenseVerifier = (
  licenseCode: string,
  skipOnline: boolean,
) => Promise<LicenseVerifyResult>;

interface GateInternals {
  owner: object;
  getCode: () => string;
  verify: LicenseVerifier;
  onChange: (licensed: boolean) => void;
  sequence: number;
}

// The verifier, owner and sequence live outside the instance, so swapping a field on the gate
// cannot feed it a fake result. Access is recorded per owner in ./entitlement.
const INTERNALS = new WeakMap<LicenseGate, GateInternals>();

/**
 * Every feature requires activation. The local signature check decides
 * immediately; the online device check can still revoke it. Network outages
 * keep the local result (the verifier already fails open for them).
 */
export class LicenseGate {
  constructor(
    getCode: () => string,
    verify: LicenseVerifier,
    onChange: (licensed: boolean) => void,
    owner?: object,
  ) {
    const internals: GateInternals = { owner: owner ?? this, getCode, verify, onChange, sequence: 0 };
    INTERNALS.set(this, internals);
    // An expiry passing mid-session reaches the plugin like any other change.
    onEntitlementChange(internals.owner, (licensed) => internals.onChange(licensed));
  }

  /** Read-only view for settings and tests; features gate on readingRailEntitled(owner). */
  get licensed(): boolean {
    const internals = INTERNALS.get(this);
    return !!internals && readingRailEntitled(internals.owner);
  }

  async refresh(online = true): Promise<LicenseVerifyResult> {
    const internals = INTERNALS.get(this);
    if (!internals) return { valid: false, reason: "授权码为空" };
    const sequence = ++internals.sequence;
    const code = internals.getCode().trim();
    const local: LicenseVerifyResult = code
      ? await internals.verify(code, true)
      : { valid: false, reason: "授权码为空" };
    if (sequence !== internals.sequence) {
      return local;
    }
    if (!local.valid) {
      applyEntitlement(internals.owner, local);
      return local;
    }
    applyEntitlement(internals.owner, local);
    if (!online) {
      return local;
    }

    const remote = await internals.verify(code, false);
    if (sequence !== internals.sequence) {
      return remote;
    }
    if (!remote.valid) {
      applyEntitlement(internals.owner, remote);
    }
    return remote;
  }

  /** Drops any in-flight check, e.g. when the plugin unloads. */
  cancel(): void {
    const internals = INTERNALS.get(this);
    if (internals) internals.sequence += 1;
  }
}
