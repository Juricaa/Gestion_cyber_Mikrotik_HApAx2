import { NotificationSound } from "../types";

type OscillatorTypeSafe = OscillatorType;

type SoundHandle = {
  stop: () => void;
  isPlaying: () => boolean;
};

let audioContext: AudioContext | null = null;

const activeHandles = new Set<SoundHandle>();

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  if (!audioContext) {
    const AudioContextClass =
      window.AudioContext || (window as any).webkitAudioContext;

    if (!AudioContextClass) return null;

    audioContext = new AudioContextClass();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }

  return audioContext;
}

function createToneSequence(
  tones: Array<{
    frequency: number;
    startAfter: number;
    duration: number;
    type?: OscillatorTypeSafe;
    volume?: number;
  }>
): SoundHandle {
  const ctx = getAudioContext();

  if (!ctx) {
    return {
      stop: () => {},
      isPlaying: () => false,
    };
  }

  let stopped = false;

  const nodes: Array<{
    oscillator: OscillatorNode;
    gain: GainNode;
  }> = [];

  const timers: number[] = [];

  const handle: SoundHandle = {
    stop: () => {
      if (stopped) return;

      stopped = true;

      timers.forEach((timer) => window.clearTimeout(timer));

      nodes.forEach(({ oscillator, gain }) => {
        try {
          oscillator.stop();
        } catch {}

        try {
          oscillator.disconnect();
        } catch {}

        try {
          gain.disconnect();
        } catch {}
      });

      nodes.length = 0;
      activeHandles.delete(handle);
    },

    isPlaying: () => !stopped,
  };

  activeHandles.add(handle);

  tones.forEach((tone) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = tone.type || "sine";
    oscillator.frequency.setValueAtTime(tone.frequency, ctx.currentTime);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    const startTime = ctx.currentTime + tone.startAfter;
    const duration = tone.duration;
    const volume = tone.volume ?? 0.3;

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    try {
      oscillator.start(startTime);
      oscillator.stop(startTime + duration + 0.05);
    } catch {}

    nodes.push({ oscillator, gain });
  });

  const maxDuration =
    Math.max(...tones.map((tone) => tone.startAfter + tone.duration)) + 0.3;

  const cleanupTimer = window.setTimeout(() => {
    handle.stop();
  }, maxDuration * 1000);

  timers.push(cleanupTimer);

  return handle;
}

export function stopAllNotificationSounds() {
  activeHandles.forEach((handle) => handle.stop());
  activeHandles.clear();
}

export function playNotificationSound(
  sound: NotificationSound,
  volume: number = 100
): SoundHandle {
  const safeVolume = Math.max(0, Math.min(100, volume)) / 100;

  switch (sound) {
    case "beep":
      return createToneSequence([
        {
          frequency: 1000,
          startAfter: 0,
          duration: 0.25,
          type: "square",
          volume: 0.25 * safeVolume,
        },
      ]);

    case "chime":
      return createToneSequence([
        {
          frequency: 523.25,
          startAfter: 0,
          duration: 0.35,
          type: "sine",
          volume: 0.22 * safeVolume,
        },
        {
          frequency: 659.25,
          startAfter: 0.15,
          duration: 0.35,
          type: "sine",
          volume: 0.2 * safeVolume,
        },
        {
          frequency: 783.99,
          startAfter: 0.3,
          duration: 0.45,
          type: "sine",
          volume: 0.18 * safeVolume,
        },
      ]);

    case "bell":
      return createToneSequence([
        {
          frequency: 1200,
          startAfter: 0,
          duration: 1.1,
          type: "sine",
          volume: 0.35 * safeVolume,
        },
        {
          frequency: 600,
          startAfter: 0.05,
          duration: 1.2,
          type: "sine",
          volume: 0.12 * safeVolume,
        },
      ]);

    case "alert":
      return createToneSequence([
        {
          frequency: 880,
          startAfter: 0,
          duration: 0.2,
          type: "square",
          volume: 0.3 * safeVolume,
        },
        {
          frequency: 880,
          startAfter: 0.3,
          duration: 0.2,
          type: "square",
          volume: 0.3 * safeVolume,
        },
      ]);

    case "digital":
      return createToneSequence([
        {
          frequency: 700,
          startAfter: 0,
          duration: 0.12,
          type: "square",
          volume: 0.25 * safeVolume,
        },
        {
          frequency: 950,
          startAfter: 0.16,
          duration: 0.12,
          type: "square",
          volume: 0.25 * safeVolume,
        },
        {
          frequency: 1200,
          startAfter: 0.32,
          duration: 0.12,
          type: "square",
          volume: 0.25 * safeVolume,
        },
      ]);

    case "success":
      return createToneSequence([
        {
          frequency: 523.25,
          startAfter: 0,
          duration: 0.18,
          type: "sine",
          volume: 0.22 * safeVolume,
        },
        {
          frequency: 783.99,
          startAfter: 0.18,
          duration: 0.28,
          type: "sine",
          volume: 0.22 * safeVolume,
        },
      ]);

    case "default":
    default:
      return createToneSequence([
        {
          frequency: 800,
          startAfter: 0,
          duration: 0.45,
          type: "sine",
          volume: 0.3 * safeVolume,
        },
      ]);
  }
}

export class NotificationPlayer {
  private intervalId: number | null = null;
  private handles = new Set<SoundHandle>();

  start(sound: NotificationSound, volume: number, interval: number = 2000) {
    this.stop();

    this.playOnce(sound, volume);

    this.intervalId = window.setInterval(() => {
      this.playOnce(sound, volume);
    }, interval);
  }

  private playOnce(sound: NotificationSound, volume: number) {
    const handle = playNotificationSound(sound, volume);

    this.handles.add(handle);

    window.setTimeout(() => {
      this.handles.delete(handle);
    }, 5000);
  }

  stop() {
    if (this.intervalId !== null) {
      window.clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.handles.forEach((handle) => handle.stop());
    this.handles.clear();
  }

  isPlaying() {
    return this.intervalId !== null;
  }
}