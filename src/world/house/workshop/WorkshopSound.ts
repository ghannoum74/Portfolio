/** Small procedural feedback sounds, triggered by user interaction only.
 * Respects the portfolio's existing global mute button through a callback.
 */
type Cue = "enter" | "select" | "close" | "exit";

export class WorkshopSound {
  private context: AudioContext | null = null;
  private readonly notes = [392, 330, 294, 440];

  constructor(private readonly isEnabled: () => boolean) {}

  play(cue: Cue, index = 0): void {
    if (!this.isEnabled() || typeof window.AudioContext === "undefined") return;

    try {
      this.context ??= new AudioContext({ latencyHint: "interactive" });
      const context = this.context;
      if (context.state === "suspended") void context.resume();

      const base = this.notes[Math.max(0, Math.min(3, index))];
      const start = context.currentTime + 0.012;

      if (cue === "enter") {
        this.note(base / 2, start, 0.22, 0.010);
        this.note(base, start + 0.09, 0.23, 0.008);
      } else if (cue === "select") {
        this.note(base, start, 0.17, 0.010);
        this.note(base * 1.5, start + 0.085, 0.23, 0.007);
      } else if (cue === "close") {
        this.note(base * 0.75, start, 0.13, 0.006);
      } else {
        this.note(base / 2, start, 0.18, 0.006);
      }
    } catch {
      // Audio is enhancement only; never block an interaction.
    }
  }

  private note(frequency: number, start: number, length: number, volume: number): void {
    const context = this.context;
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.996, start + length);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start);
    oscillator.stop(start + length + 0.008);
  }

  destroy(): void {
    if (this.context && this.context.state !== "closed") void this.context.close();
    this.context = null;
  }
}
