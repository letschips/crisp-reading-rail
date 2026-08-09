import {
  normalizeResolvedSoundStyle,
  type ReadingRailSoundStyle,
} from "./sound-styles";

export interface RailSoundProvider {
  tick(progress?: number, window?: Window): void;
  settle(window?: Window): void;
  completionChime?(window?: Window): void;
}

export interface ReadingRailAudioEnvironment {
  now(): number;
  createContext(window: Window): AudioContext | null;
  debug(message: string, error: unknown): void;
}

interface ToneOptions {
  type: OscillatorType;
  start: number;
  end: number;
  duration: number;
  release: number;
  volume: number;
}

export interface ReadingRailAudioOptions {
  getStyle?(): ReadingRailSoundStyle;
  getCompanionStyle?(): unknown;
  isReleaseEnabled?(): boolean;
}

const TICK_THROTTLE_MS = 90;
const MIN_GAIN = 0.0001;
const ATTACK_SECONDS = 0.004;
const SCALE_FREQUENCIES = [
  523.25,
  587.33,
  659.25,
  783.99,
  880,
  1046.5,
  1174.66,
  1318.51,
  1567.98,
  1760,
] as const;

export function createReadingRailAudioEnvironment(
  window: Window,
): ReadingRailAudioEnvironment {
  return {
    now: () => window.performance.now(),
    createContext: (ownerWindow) => {
      const WindowWithAudio = ownerWindow as Window & {
        AudioContext?: typeof AudioContext;
        webkitAudioContext?: typeof AudioContext;
      };
      const Context = WindowWithAudio.AudioContext
        ?? WindowWithAudio.webkitAudioContext;
      return Context ? new Context() : null;
    },
    debug: (message, error) => console.debug(message, error),
  };
}

export class ReadingRailAudio implements RailSoundProvider {
  private readonly isEnabled: () => boolean;
  private readonly environment: ReadingRailAudioEnvironment;
  private readonly getStyle: () => ReadingRailSoundStyle;
  private readonly getCompanionStyle: () => unknown;
  private readonly isReleaseEnabled: () => boolean;
  private readonly contexts = new WeakMap<Window, AudioContext>();
  private readonly contextsToClose: AudioContext[] = [];
  private lastTickAt = Number.NEGATIVE_INFINITY;

  constructor(
    isEnabled: () => boolean,
    environment: ReadingRailAudioEnvironment,
    options: ReadingRailAudioOptions = {},
  ) {
    this.isEnabled = isEnabled;
    this.environment = environment;
    this.getStyle = options.getStyle ?? (() => "followFileExplorer");
    this.getCompanionStyle = options.getCompanionStyle ?? (() => undefined);
    this.isReleaseEnabled = options.isReleaseEnabled ?? (() => true);
  }

  tick(progress = 0.5, window?: Window): void {
    if (!this.isEnabled()) {
      return;
    }
    const now = this.environment.now();
    if (now - this.lastTickAt < TICK_THROTTLE_MS) {
      return;
    }
    this.lastTickAt = now;
    const style = this.resolveStyle();
    if (style === "scale") {
      const safeProgress = Math.min(1, Math.max(0, progress));
      const index = Math.floor(safeProgress * (SCALE_FREQUENCIES.length - 0.01));
      const frequency = SCALE_FREQUENCIES[index];
      this.play({
        type: "sine",
        start: frequency,
        end: frequency,
        duration: 0.038,
        release: 0.032,
        volume: 0.024,
      }, window);
      return;
    }
    this.play(this.getTickTone(style), window);
  }

  settle(window?: Window): void {
    if (!this.isEnabled() || !this.isReleaseEnabled()) {
      return;
    }
    this.play(this.getSettleTone(this.resolveStyle()), window);
  }

  completionChime(window?: Window): void {
    if (!this.isEnabled()) {
      return;
    }
    try {
      const context = this.ensureContext(window);
      if (!context) {
        return;
      }
      const now = context.currentTime;
      [659.25, 830.61, 987.77, 1318.51].forEach((frequency, index) => {
        const startAt = now + index * 0.05;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, startAt);
        gain.gain.setValueAtTime(MIN_GAIN, startAt);
        gain.gain.exponentialRampToValueAtTime(0.016, startAt + ATTACK_SECONDS);
        gain.gain.exponentialRampToValueAtTime(MIN_GAIN, startAt + 0.16);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + 0.18);
      });
    } catch (error) {
      this.environment.debug("Crisp Reading Rail completion chime failed", error);
    }
  }

  async destroy(): Promise<void> {
    const contexts = this.contextsToClose.splice(0);
    await Promise.all(contexts.map(async (context) => {
      if (context.state !== "closed") {
        await context.close();
      }
    }));
  }

  private ensureContext(window?: Window): AudioContext | null {
    if (window) {
      const existing = this.contexts.get(window);
      if (existing) {
        this.resumeIfSuspended(existing);
        return existing;
      }
    }
    const context = this.environment.createContext(
      window ?? ({} as Window),
    );
    if (context) {
      this.resumeIfSuspended(context);
      if (window) {
        this.contexts.set(window, context);
        this.contextsToClose.push(context);
      }
    }
    return context;
  }

  private resumeIfSuspended(context: AudioContext): void {
    if (context.state === "suspended") {
      void context.resume().catch(() => undefined);
    }
  }

  private resolveStyle(): Exclude<ReadingRailSoundStyle, "followFileExplorer"> {
    const selected = this.getStyle();
    return normalizeResolvedSoundStyle(
      selected === "followFileExplorer" ? this.getCompanionStyle() : selected,
    );
  }

  private getTickTone(
    style: Exclude<ReadingRailSoundStyle, "followFileExplorer" | "scale">,
  ): ToneOptions {
    const tones: Record<typeof style, ToneOptions> = {
      soft: {
        type: "triangle",
        start: 560,
        end: 480,
        duration: 0.025,
        release: 0.045,
        volume: 0.008,
      },
      wooden: {
        type: "sine",
        start: 720,
        end: 360,
        duration: 0.022,
        release: 0.02,
        volume: 0.03,
      },
      mechanical: {
        type: "square",
        start: 2600,
        end: 1800,
        duration: 0.01,
        release: 0.012,
        volume: 0.016,
      },
      raindrop: {
        type: "sine",
        start: 1850,
        end: 620,
        duration: 0.035,
        release: 0.028,
        volume: 0.026,
      },
      retro8bit: {
        type: "square",
        start: 987,
        end: 1318,
        duration: 0.02,
        release: 0.018,
        volume: 0.018,
      },
      watchgear: {
        type: "triangle",
        start: 3200,
        end: 2400,
        duration: 0.008,
        release: 0.008,
        volume: 0.022,
      },
      bubble: {
        type: "sine",
        start: 350,
        end: 920,
        duration: 0.045,
        release: 0.035,
        volume: 0.024,
      },
    };
    return tones[style];
  }

  private getSettleTone(
    style: Exclude<ReadingRailSoundStyle, "followFileExplorer">,
  ): ToneOptions {
    const tones: Record<typeof style, ToneOptions> = {
      soft: {
        type: "sine",
        start: 440,
        end: 560,
        duration: 0.04,
        release: 0.06,
        volume: 0.01,
      },
      scale: {
        type: "sine",
        start: 659.25,
        end: 1046.5,
        duration: 0.08,
        release: 0.06,
        volume: 0.025,
      },
      wooden: {
        type: "sine",
        start: 540,
        end: 260,
        duration: 0.05,
        release: 0.04,
        volume: 0.032,
      },
      mechanical: {
        type: "square",
        start: 2200,
        end: 950,
        duration: 0.035,
        release: 0.025,
        volume: 0.018,
      },
      raindrop: {
        type: "sine",
        start: 850,
        end: 1450,
        duration: 0.065,
        release: 0.05,
        volume: 0.028,
      },
      retro8bit: {
        type: "square",
        start: 1318,
        end: 1760,
        duration: 0.06,
        release: 0.04,
        volume: 0.02,
      },
      watchgear: {
        type: "triangle",
        start: 2400,
        end: 1200,
        duration: 0.03,
        release: 0.02,
        volume: 0.024,
      },
      bubble: {
        type: "sine",
        start: 280,
        end: 720,
        duration: 0.08,
        release: 0.05,
        volume: 0.028,
      },
    };
    return tones[style];
  }

  private play(options: ToneOptions, window?: Window): void {
    try {
      const context = this.ensureContext(window);
      if (!context) {
        return;
      }
      const now = context.currentTime;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const releaseAt = now + options.duration + options.release;

      oscillator.type = options.type;
      oscillator.frequency.setValueAtTime(options.start, now);
      oscillator.frequency.exponentialRampToValueAtTime(
        options.end,
        now + options.duration,
      );
      gain.gain.setValueAtTime(MIN_GAIN, now);
      gain.gain.exponentialRampToValueAtTime(
        options.volume,
        now + ATTACK_SECONDS,
      );
      gain.gain.exponentialRampToValueAtTime(MIN_GAIN, releaseAt);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(releaseAt + 0.01);
    } catch (error) {
      this.environment.debug("Crisp Reading Rail sound failed", error);
    }
  }
}
