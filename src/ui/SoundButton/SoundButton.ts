import "./SoundButton.css";

export class SoundButton {
  private readonly button: HTMLButtonElement;

  constructor(private readonly onToggle: () => boolean) {
    const uiRoot = document.getElementById("ui-root");

    if (!uiRoot) {
      throw new Error("Missing entry point #ui-root");
    }

    this.button = document.createElement("button");

    this.button.type = "button";

    this.button.className = "sound-button";

    this.button.addEventListener("click", this.handleClick);

    this.updateState(false);

    uiRoot.appendChild(this.button);
  }

  setVisible(visible: boolean): void {
    this.button.hidden = !visible;
  }

  private handleClick = (): void => {
    const muted = this.onToggle();

    this.updateState(muted);
  };

  private updateState(muted: boolean): void {
    this.button.setAttribute(
      "aria-label",
      muted ? "Turn sound on" : "Turn sound off",
    );

    this.button.title = muted ? "Sound on" : "Sound off";

    this.button.innerHTML = muted
      ? this.createMutedIcon()
      : this.createSoundIcon();
  }

  private createSoundIcon(): string {
    return `
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
      >
        <path
          d="
            M5 13
            H10
            L17 7
            V25
            L10 19
            H5
            Z
          "
        />

        <path
          d="
            M21 12
            C24 14 24 18 21 20
          "
        />

        <path
          d="
            M24 8
            C30 12 30 20 24 24
          "
        />
      </svg>
    `;
  }

  private createMutedIcon(): string {
    return `
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
      >
        <path
          d="
            M5 13
            H10
            L17 7
            V25
            L10 19
            H5
            Z
          "
        />

        <path
          d="M21 12 L28 20"
        />

        <path
          d="M28 12 L21 20"
        />
      </svg>
    `;
  }
}
