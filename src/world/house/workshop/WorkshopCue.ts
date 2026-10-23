export type WorkshopCue = "enter" | "select" | "close" | "exit";

const SAMPLE_RATE = 22050;
export const WORKSHOP_CUE_VOLUME = 0.02;
const NOTES = [392, 330, 294, 440];

/** Render the existing short sine cues as PCM. Playback can reuse the browser's
 * media pipeline instead of synchronously opening a separate AudioContext.
 */
export function createWorkshopCue(cue: WorkshopCue, index = 0): ArrayBuffer {
  const base = NOTES[Number.isFinite(index) ? Math.max(0, Math.min(3, Math.trunc(index))) : 0];
  const notes = cue === "enter"
    ? [[base / 2, 0, 0.22, 0.010], [base, 0.09, 0.23, 0.008]]
    : cue === "select"
      ? [[base, 0, 0.17, 0.010], [base * 1.5, 0.085, 0.23, 0.007]]
      : cue === "close" ? [[base * 0.75, 0, 0.13, 0.006]]
        : [[base / 2, 0, 0.18, 0.006]];
  const lead = 0.012;
  const duration = Math.max(...notes.map(([, offset, length]) => lead + offset + length + 0.008));
  const frames = Math.ceil(duration * SAMPLE_RATE);
  const samples = new Float32Array(frames);
  const drift = Math.log(0.996);
  for (const [frequency, offset, length, volume] of notes) {
    const start = lead + offset;
    const first = Math.ceil(start * SAMPLE_RATE);
    const last = Math.min(frames, Math.ceil((start + length + 0.008) * SAMPLE_RATE));
    for (let frame = first; frame < last; frame++) {
      const elapsed = frame / SAMPLE_RATE - start;
      const envelope = elapsed < 0.02
        ? 0.0001 * Math.pow(volume / 0.0001, elapsed / 0.02)
        : elapsed < length
          ? volume * Math.pow(0.0001 / volume, (elapsed - 0.02) / (length - 0.02))
          : 0.0001;
      const phase = frequency * length / drift * Math.expm1(drift * Math.min(elapsed, length) / length)
        + frequency * 0.996 * Math.max(0, elapsed - length);
      samples[frame] += Math.sin(2 * Math.PI * phase) * envelope / WORKSHOP_CUE_VOLUME;
    }
  }

  const buffer = new ArrayBuffer(44 + frames * 2);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, buffer.byteLength - 8, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, frames * 2, true);
  for (let frame = 0; frame < frames; frame++) {
    view.setInt16(44 + frame * 2, Math.round(Math.max(-1, Math.min(1, samples[frame])) * 32767), true);
  }
  return buffer;
}
