export class HelpButton {
  private readonly button: HTMLButtonElement;

  constructor(onClick: () => void) {
    const uiRoot = document.getElementById("ui-root");

    if (!uiRoot) {
      throw new Error("Missing entry point #ui-root");
    }

    this.button = document.createElement("button");

    this.button.type = "button";

    this.button.className = "help-button";

    this.button.setAttribute("aria-label", "Open world controls");

    this.button.innerHTML = `
      <span aria-hidden="true">?</span>
    `;

    this.button.addEventListener("click", onClick);

    uiRoot.appendChild(this.button);
  }

  setVisible(visible: boolean): void {
    this.button.hidden = !visible;
    console.log(visible);
  }
}
