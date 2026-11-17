import type { LicenseVerifyResult } from "./license";
import { applyEntitlement, claimEntitlement, readingRailEntitled } from "./entitlement";

export type LicenseVerifier = (
  licenseCode: string,
  skipOnline: boolean,
) => Promise<LicenseVerifyResult>;

interface GateInternals {
  /** null when another gate already reports for this owner: such a gate can grant nothing. */
  owner: object | null;
  getCode: () => string;
  verify: LicenseVerifier;
  onChange: (licensed: boolean) => void;
  sequence: number;
}

// The verifier, owner and sequence live outside the instance, so swapping a field on the gate
// cannot feed it a fake result. Access is recorded per owner in ./entitlement.
const INTERNALS = new WeakMap<LicenseGate, GateInternals>();

function grant(gate: LicenseGate, internals: GateInternals, result: LicenseVerifyResult): void {
  if (internals.owner) applyEntitlement(internals.owner, gate, result);
}

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
    const target = owner ?? this;
    // An expiry passing mid-session reaches the plugin like any other change.
    const claimed = claimEntitlement(target, this, (licensed) => onChange(licensed));
    INTERNALS.set(this, { owner: claimed ? target : null, getCode, verify, onChange, sequence: 0 });
  }

  /** Read-only view for settings and tests; features gate on readingRailEntitled(owner). */
  get licensed(): boolean {
    const internals = INTERNALS.get(this);
    return !!internals?.owner && readingRailEntitled(internals.owner);
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
      grant(this, internals, local);
      return local;
    }
    grant(this, internals, local);
    if (!online) {
      return local;
    }

    const remote = await internals.verify(code, false);
    if (sequence !== internals.sequence) {
      return remote;
    }
    if (!remote.valid) {
      grant(this, internals, remote);
    }
    return remote;
  }

  /** Drops any in-flight check, e.g. when the plugin unloads. */
  cancel(): void {
    const internals = INTERNALS.get(this);
    if (internals) internals.sequence += 1;
  }
}
