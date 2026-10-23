import { createWorkshopCue, WORKSHOP_CUE_VOLUME, type WorkshopCue } from "./WorkshopCue";

type Clip = { url: string; voices: HTMLAudioElement[]; nextVoice: number };

/** Cached procedural feedback, triggered by user interaction only. */
export class WorkshopSound {
  private readonly clips = new Map<string, Clip>();
  private destroyed = false;

  constructor(private readonly isEnabled: () => boolean) {}

  play(cue: WorkshopCue, index = 0): void {
    if (this.destroyed || !this.isEnabled() || typeof Audio === "undefined") return;

    try {
      const noteIndex = Number.isFinite(index) ? Math.max(0, Math.min(3, Math.trunc(index))) : 0;
      const key = `${cue}:${noteIndex}`;
      let clip = this.clips.get(key);
      if (!clip) {
        const url = URL.createObjectURL(new Blob([createWorkshopCue(cue, noteIndex)], { type: "audio/wav" }));
        const voices: HTMLAudioElement[] = [];
        try {
          // Allow two quick overlapping clicks without allocating more players.
          for (let voice = 0; voice < 2; voice++) {
            const audio = new Audio(url);
            voices.push(audio);
            audio.preload = "auto";
            audio.volume = WORKSHOP_CUE_VOLUME;
          }
        } catch (error) {
          for (const audio of voices) audio.pause();
          URL.revokeObjectURL(url);
          throw error;
        }
        clip = { url, voices, nextVoice: 0 };
        this.clips.set(key, clip);
      }
      const audio = clip.voices[clip.nextVoice];
      clip.nextVoice = (clip.nextVoice + 1) % clip.voices.length;
      audio.pause();
      if (audio.currentTime !== 0) audio.currentTime = 0;
      void audio.play().catch(() => {});
    } catch {
      // Audio is enhancement only; never block an interaction.
    }
  }

  destroy(): void {
    this.destroyed = true;
    for (const clip of this.clips.values()) {
      for (const audio of clip.voices) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      URL.revokeObjectURL(clip.url);
    }
    this.clips.clear();
  }
}
