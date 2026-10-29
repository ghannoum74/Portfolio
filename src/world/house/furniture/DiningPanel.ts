import "./DiningPanel.css";

export type DiningPanelMode = "alchemy" | "bookshelf" | "recipe";
export type Potion = { name: string; description: string; color: number };

export const POTIONS: readonly Potion[] = [
  { name: "Verdant Elixir", description: "A bright green brew for a little imagined energy.", color: 0x85dd9e },
  { name: "Moonwater", description: "A cool blue brew inspired by a clear night sky.", color: 0x82c8ef },
  { name: "Sunfire", description: "A warm golden brew with a touch of daylight.", color: 0xe9ba70 },
];

const BOOKS = [
  { name: "Building Worlds", description: "This portfolio brings together Blender models, Three.js and interaction design to make a world to explore." },
  { name: "Thoughtful Interfaces", description: "A good interaction helps people understand what they can do, and gives them a clear way back." },
  { name: "A Traveler's Guide", description: "Visit the Projects book, the Workshop, the Journey map and the Awards to discover more of the portfolio." },
] as const;

type Callbacks = { onSelection: () => void; onBrew: (potion: Potion) => void; onClose: () => void };

/** A small, reusable panel; it has no global listeners or per-frame work. */
export class DiningPanel {
  private readonly root = document.createElement("section");
  private readonly eyebrow = document.createElement("div");
  private readonly title = document.createElement("h2");
  private readonly description = document.createElement("p");
  private readonly status = document.createElement("p");
  private readonly count = document.createElement("span");
  private readonly previous = document.createElement("button");
  private readonly next = document.createElement("button");
  private readonly brewButton = document.createElement("button");
  private readonly closeButton = document.createElement("button");
  private readonly controls = document.createElement("div");
  private readonly keys = document.createElement("small");
  private mode: DiningPanelMode | null = null;
  private index = 0;
  private brewing = false;

  constructor(private readonly callbacks: Callbacks) {
    this.root.className = "dining-panel";
    this.root.hidden = true;
    this.root.setAttribute("aria-label", "Dining and alchemy interaction");
    this.root.setAttribute("role", "region");
    this.eyebrow.className = "dining-panel__eyebrow";
    this.description.className = "dining-panel__description";
    this.status.className = "dining-panel__status";
    this.status.setAttribute("aria-live", "polite");
    this.count.className = "dining-panel__count";
    this.controls.className = "dining-panel__controls";
    this.keys.className = "dining-panel__keys";
    for (const button of [this.previous, this.next, this.brewButton, this.closeButton]) button.type = "button";
    this.previous.textContent = "← Previous";
    this.next.textContent = "Next →";
    this.brewButton.textContent = "Brew";
    this.closeButton.textContent = "Close";
    this.previous.addEventListener("click", () => this.selectRelative(-1));
    this.next.addEventListener("click", () => this.selectRelative(1));
    this.brewButton.addEventListener("click", () => this.brew());
    this.closeButton.addEventListener("click", () => this.callbacks.onClose());
    this.controls.appendChild(this.previous); this.controls.appendChild(this.count);
    this.controls.appendChild(this.next); this.controls.appendChild(this.brewButton); this.controls.appendChild(this.closeButton);
    this.root.appendChild(this.eyebrow); this.root.appendChild(this.title); this.root.appendChild(this.description);
    this.root.appendChild(this.status); this.root.appendChild(this.controls); this.root.appendChild(this.keys);
    document.body.appendChild(this.root);
  }

  open(mode: DiningPanelMode): void {
    this.mode = mode; this.index = 0; this.brewing = false;
    this.root.hidden = false;
    this.render();
  }

  selectRelative(direction: number): void {
    if (this.mode !== "alchemy" && this.mode !== "bookshelf") return;
    const length = this.mode === "alchemy" ? POTIONS.length : BOOKS.length;
    this.index = (this.index + direction % length + length) % length;
    this.brewing = false;
    this.callbacks.onSelection();
    this.render();
  }

  brew(): void {
    if (this.mode !== "alchemy") return;
    this.brewing = true;
    this.callbacks.onBrew(POTIONS[this.index]);
    this.render();
  }

  close(): void { this.mode = null; this.root.hidden = true; }
  destroy(): void { this.close(); this.root.remove(); }

  private render(): void {
    const isAlchemy = this.mode === "alchemy", isBookshelf = this.mode === "bookshelf";
    const item = isAlchemy ? POTIONS[this.index] : isBookshelf ? BOOKS[this.index] : null;
    this.eyebrow.textContent = isAlchemy ? "THE ALCHEMY CORNER" : isBookshelf ? "THE BOOKSHELF" : "A RECIPE FOR MOONWATER";
    this.title.textContent = item?.name ?? "A little moonlight";
    this.description.textContent = item?.description ??
      "At the cauldron, use the arrows to select the blue Moonwater, then press E to brew it.";
    this.status.textContent = isAlchemy ? (this.brewing ? `Brewing ${POTIONS[this.index].name}…` : "Choose a potion, then brew.") : "";
    this.count.textContent = item ? `${this.index + 1} / ${isAlchemy ? POTIONS.length : BOOKS.length}` : "";
    this.previous.hidden = this.next.hidden = !item;
    this.count.hidden = !item;
    this.brewButton.hidden = !isAlchemy;
    this.keys.textContent = isAlchemy ? "← / → Choose   ·   E Brew   ·   Esc Close" :
      isBookshelf ? "← / → Turn page   ·   Esc Close" : "E / Esc Close";
  }
}
