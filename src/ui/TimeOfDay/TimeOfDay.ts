import html from "./TimeOfDay.html?raw";
import "./TimeOfDay.css";

interface WorldClock {
  getTimeOfDay(): number;
  isUsingRealTime(): boolean;
  setTimeOfDay(hour: number | null): void;
}

function formatHour(hour: number): string {
  const minutes = Math.min(1439, Math.max(0, Math.floor(hour * 60)));
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

export class TimeOfDay {
  private readonly root: HTMLDivElement;
  private readonly toggle: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private readonly current: HTMLElement;
  private readonly output: HTMLOutputElement;
  private readonly slider: HTMLInputElement;
  private readonly local: HTMLButtonElement;
  private readonly presets: HTMLButtonElement[];

  constructor(
    uiRoot: HTMLElement,
    private readonly clock: WorldClock,
  ) {
    this.root = document.createElement("div");
    this.root.className = "world-time";
    this.root.hidden = true;
    this.root.innerHTML = html;
    this.toggle =
      this.root.querySelector<HTMLButtonElement>("[data-time-toggle]")!;
    this.panel = this.root.querySelector<HTMLElement>("[data-time-panel]")!;
    this.current = this.root.querySelector<HTMLElement>("[data-time-current]")!;
    this.output =
      this.root.querySelector<HTMLOutputElement>("[data-time-output]")!;
    this.slider =
      this.root.querySelector<HTMLInputElement>("[data-time-slider]")!;
    this.local =
      this.root.querySelector<HTMLButtonElement>("[data-time-local]")!;
    this.presets = [
      ...this.root.querySelectorAll<HTMLButtonElement>("[data-time-hour]"),
    ];

    this.toggle.addEventListener("click", () => {
      this.setOpen(this.panel.hidden === true);
    });
    for (const preset of this.presets) {
      preset.addEventListener("click", () =>
        this.choose(Number(preset.dataset.timeHour)),
      );
    }
    this.slider.addEventListener("input", () =>
      this.choose(Number(this.slider.value)),
    );
    this.local.addEventListener("click", () => {
      this.clock.setTimeOfDay(null);
      this.sync();
    });

    this.root.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.key === "Escape" && !this.panel.hidden) {
        event.preventDefault();
        this.setOpen(false, true);
      }
    });
    this.root.addEventListener("focusout", (event) => {
      if (!this.root.contains(event.relatedTarget as Node | null))
        this.setOpen(false);
    });
    document.addEventListener("pointerdown", this.onOutsidePointer);
    uiRoot.appendChild(this.root);
    this.sync();
  }

  setVisible(visible: boolean): void {
    if (this.root.hidden === !visible) return;
    this.root.hidden = !visible;
    if (!visible) {
      this.setOpen(false);
      if (this.root.contains(document.activeElement))
        (document.activeElement as HTMLElement)?.blur();
    }
  }

  sync(): void {
    const hour = this.clock.getTimeOfDay();
    const realTime = this.clock.isUsingRealTime();
    const time = formatHour(hour);
    const preset =
      !realTime &&
      this.presets.find(
        (button) => Math.abs(Number(button.dataset.timeHour) - hour) < 0.005,
      );
    const caption = realTime
      ? `Local · ${time}`
      : preset
        ? `${preset.textContent?.trim()} · ${time}`
        : time;
    this.current.textContent = caption;
    this.toggle.setAttribute("aria-label", `Change world time, ${caption}`);
    this.output.textContent = time;
    this.slider.value = String(hour);
    this.slider.setAttribute("aria-valuetext", time);
    this.local.setAttribute("aria-pressed", String(realTime));
    for (const button of this.presets)
      button.setAttribute("aria-pressed", String(button === preset));
  }

  destroy(): void {
    document.removeEventListener("pointerdown", this.onOutsidePointer);
    this.root.remove();
  }

  private choose(hour: number): void {
    if (!Number.isFinite(hour)) return;
    this.clock.setTimeOfDay(hour);
    this.sync();
  }

  private setOpen(open: boolean, restoreFocus = false): void {
    this.panel.hidden = !open;
    this.toggle.setAttribute("aria-expanded", String(open));
    if (open) this.sync();
    if (restoreFocus) this.toggle.focus();
  }

  private readonly onOutsidePointer = (event: PointerEvent): void => {
    if (!this.root.contains(event.target as Node | null)) this.setOpen(false);
  };
}
