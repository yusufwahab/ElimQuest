import { prefs } from './storage';

/** Optional UI sounds, synthesised (no audio files, no autoplay). Silent unless the user switched sound on. */
let ctx: AudioContext | null = null;
export type Sfx = 'submit' | 'reveal' | 'up' | 'down' | 'finish';
const NOTES: Record<Sfx, [number, number][]> = {
  submit: [[660, 0.08]], reveal: [[440, 0.1], [550, 0.1]], up: [[523, 0.09], [659, 0.09], [784, 0.12]], down: [[392, 0.1], [330, 0.14]], finish: [[523, 0.12], [659, 0.12], [784, 0.12], [1046, 0.22]],
};
export function playSfx(kind: Sfx) {
  if (!prefs.get().sound) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    let t = ctx.currentTime;
    for (const [freq, dur] of NOTES[kind]) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02); t += dur;
    }
  } catch { /* audio is optional */ }
}
