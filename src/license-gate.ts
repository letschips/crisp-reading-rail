import type { LicenseVerifyResult } from "./license";

export type LicenseVerifier = (
  licenseCode: string,
  skipOnline: boolean,
) => Promise<LicenseVerifyResult>;

/**
 * Every feature requires activation. The local signature check decides
 * immediately; the online device check can still revoke it. Network outages
 * keep the local result (the verifier already fails open for them).
 */
export class LicenseGate {
  licensed = false;
  private readonly getCode: () => string;
  private readonly verify: LicenseVerifier;
  private readonly onChange: (licensed: boolean) => void;
  private sequence = 0;

  constructor(
    getCode: () => string,
    verify: LicenseVerifier,
    onChange: (licensed: boolean) => void,
  ) {
    this.getCode = getCode;
    this.verify = verify;
    this.onChange = onChange;
  }

  async refresh(online = true): Promise<LicenseVerifyResult> {
    const sequence = ++this.sequence;
    const code = this.getCode().trim();
    const local: LicenseVerifyResult = code
      ? await this.verify(code, true)
      : { valid: false, reason: "授权码为空" };
    if (sequence !== this.sequence) {
      return local;
    }
    if (!local.valid) {
      this.set(false);
      return local;
    }
    this.set(true);
    if (!online) {
      return local;
    }

    const remote = await this.verify(code, false);
    if (sequence !== this.sequence) {
      return remote;
    }
    if (!remote.valid) {
      this.set(false);
    }
    return remote;
  }

  /** Drops any in-flight check, e.g. when the plugin unloads. */
  cancel(): void {
    this.sequence += 1;
  }

  private set(licensed: boolean): void {
    if (this.licensed === licensed) {
      return;
    }
    this.licensed = licensed;
    this.onChange(licensed);
  }
}
