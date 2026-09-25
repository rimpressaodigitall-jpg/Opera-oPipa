/**
 * Audio Notification Engine using Web Audio API
 * Generates an instantaneous, rich, positive acoustic chime when a delivery is completed.
 * Zero external audio assets, 100% offline-ready, responsive, zero latency.
 */

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    if (!sharedAudioCtx) {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtxClass) {
        sharedAudioCtx = new AudioCtxClass();
      }
    }
    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }
    return sharedAudioCtx;
  } catch (e) {
    console.warn('[Audio] Failed to initialize AudioContext:', e);
    return null;
  }
}

/**
 * Plays a bright, melodic ascending chime sequence
 * (C5 -> E5 -> G5 -> C6) with subtle harmonics
 */
export function playDeliveryCompletedChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Sequence notes frequencies (Hz):
    // C5 (523.25), E5 (659.25), G5 (783.99), C6 (1046.50)
    const notes = [
      { freq: 523.25, time: 0.0, duration: 0.28, type: 'sine' as OscillatorType, gain: 0.28 },
      { freq: 659.25, time: 0.09, duration: 0.32, type: 'sine' as OscillatorType, gain: 0.32 },
      { freq: 783.99, time: 0.18, duration: 0.38, type: 'sine' as OscillatorType, gain: 0.35 },
      { freq: 1046.50, time: 0.28, duration: 0.65, type: 'triangle' as OscillatorType, gain: 0.42 }
    ];

    notes.forEach(n => {
      const startTime = now + n.time;
      const endTime = startTime + n.duration;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = n.type;
      osc.frequency.setValueAtTime(n.freq, startTime);

      // Smooth attack & exponential natural decay
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(n.gain, startTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, endTime);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(endTime);
    });
  } catch (err) {
    console.warn('[Audio] Error playing notification chime:', err);
  }
}

export function playTestChime() {
  playDeliveryCompletedChime();
}
