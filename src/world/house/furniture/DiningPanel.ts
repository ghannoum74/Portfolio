import "./DiningPanel.css";
import { SCOPE_CREEP_STEPS } from "./ScopeCreepEnding";
import { PROJECTS } from "../../../data/projects";

export type DiningPanelMode = "alchemy" | "bookshelf";
export type Potion = { name: string; description: string; color: number };

const BOOKS = [
  { name: "Building Worlds", description: "This portfolio brings together Blender models, Three.js and interaction design to make a world to explore." },
  { name: "Thoughtful Interfaces", description: "A good interaction helps people understand what they can do, and gives them a clear way back." },
  { name: "A Traveler's Guide", description: "Visit the Projects book, the Workshop, the Journey map and the Learning Milestones to discover more of the portfolio." },
] as const;

type Callbacks = { onSelection: () => void; onBrew: (potion: Potion) => void; onClose: () => void; onContact?: () => void };

/** A small, reusable panel; it has no global listeners or per-frame work. */
export class DiningPanel {
  private readonly root = document.createElement("section");
  private readonly art = document.createElement("div");
  private readonly story = document.createElement("div");
  private readonly endingActions = document.createElement("div");
  private readonly contact = document.createElement("button");
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
  private previousFocus: HTMLElement | null = null;

  constructor(private readonly callbacks: Callbacks) {
    this.root.className = "dining-panel";
    this.root.hidden = true;
    this.root.tabIndex = -1;
    this.root.setAttribute("aria-label", "Dining and alchemy interaction");
    this.root.setAttribute("role", "region");
    this.story.setAttribute("role", "status");
    this.story.setAttribute("aria-live", "polite");
    this.story.setAttribute("aria-atomic", "true");
    this.art.className = "scope-cauldron";
    this.art.setAttribute("aria-hidden", "true");
    this.art.innerHTML = `<svg viewBox="0 0 180 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path class="scope-cauldron__steam" d="M68 32c-18-14 13-15 0-28m24 26c18-13-12-15 0-26m25 29c-13-12 10-12 0-23"/>
      <path class="scope-cauldron__pot" d="M48 43c-9 18-6 40 13 43h58c19-3 22-25 13-43Z"/>
      <ellipse class="scope-cauldron__brew" cx="90" cy="43" rx="43" ry="10"/>
      <path d="M48 49c-21-8-23 20-5 18m90-18c21-8 23 20 5 18M60 85l-6 10m66-10 6 10"/>
      <circle class="scope-cauldron__bubble" cx="65" cy="34" r="4"/><circle class="scope-cauldron__bubble" cx="108" cy="28" r="5"/><circle class="scope-cauldron__bubble" cx="91" cy="36" r="3"/>
      <path class="scope-cauldron__spark" d="M27 19v12m-6-6h12m120-8v10m-5-5h10"/>
    </svg>`;
    this.endingActions.className = "dining-panel__ending-actions";
    this.contact.type = "button";
    this.contact.textContent = "Let’s build something →";
    this.contact.addEventListener("click", () => {
      if (this.mode !== "alchemy" || this.index !== SCOPE_CREEP_STEPS.length - 1) return;
      this.callbacks.onClose();
      this.callbacks.onContact?.();
    });
    this.contact.hidden = !callbacks.onContact;
    this.endingActions.appendChild(this.contact);
    const project = PROJECTS.find(project => project.id === "project-two") ?? PROJECTS[0];
    for (const [label, href] of [
      [`See a real build: ${project.title} ↗`, project.projectUrl],
      ["Check my CV ↗", "/assets/documents/abdel-rahman-ghannoum-cv.pdf"],
    ]) {
      const link = document.createElement("a");
      link.textContent = label; link.href = href; link.target = "_blank"; link.rel = "noopener noreferrer";
      this.endingActions.appendChild(link);
    }
    this.eyebrow.className = "dining-panel__eyebrow";
    this.description.className = "dining-panel__description";
    this.status.className = "dining-panel__status";
    this.count.className = "dining-panel__count";
    this.controls.className = "dining-panel__controls";
    this.keys.className = "dining-panel__keys";
    for (const button of [this.previous, this.next, this.brewButton, this.closeButton]) button.type = "button";
    this.previous.textContent = "← Previous";
    this.next.textContent = "Next →";
    this.brewButton.textContent = "Brew again";
    this.brewButton.className = "dining-panel__brew";
    this.closeButton.className = "dining-panel__close";
    this.closeButton.textContent = "Close";
    this.previous.addEventListener("click", () => this.selectRelative(-1));
    this.next.addEventListener("click", () => this.selectRelative(1));
    this.brewButton.addEventListener("click", () => this.brew());
    this.closeButton.addEventListener("click", () => this.callbacks.onClose());
    this.controls.appendChild(this.previous); this.controls.appendChild(this.count);
    this.controls.appendChild(this.next); this.controls.appendChild(this.brewButton); this.controls.appendChild(this.closeButton);
    this.story.appendChild(this.title); this.story.appendChild(this.description); this.story.appendChild(this.status);
    this.root.appendChild(this.eyebrow); this.root.appendChild(this.art); this.root.appendChild(this.story);
    this.root.appendChild(this.endingActions); this.root.appendChild(this.controls); this.root.appendChild(this.keys);
    this.root.addEventListener("keydown", event => {
      event.stopPropagation();
      if (event.code === "Escape") { event.preventDefault(); this.callbacks.onClose(); }
      else if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        event.preventDefault(); this.selectRelative(event.code === "ArrowRight" ? 1 : -1);
      } else if (event.code === "KeyE" || ((event.code === "Enter" || event.code === "Space") && event.target === this.root)) {
        event.preventDefault(); if (!event.repeat) this.brew();
      }
    });
    document.body.appendChild(this.root);
  }

  open(mode: DiningPanelMode): void {
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.mode = mode; this.index = 0;
    this.root.hidden = false;
    if (mode === "alchemy") this.callbacks.onBrew(SCOPE_CREEP_STEPS[0]);
    this.render();
    this.root.focus({ preventScroll: true });
  }

  selectRelative(direction: number): void {
    if (this.mode !== "alchemy" && this.mode !== "bookshelf") return;
    const length = this.mode === "alchemy" ? SCOPE_CREEP_STEPS.length : BOOKS.length;
    this.index = this.mode === "alchemy" ? Math.max(0, Math.min(length - 1, this.index + Math.sign(direction))) :
      (this.index + direction % length + length) % length;
    this.callbacks.onSelection();
    if (this.mode === "alchemy") this.callbacks.onBrew(SCOPE_CREEP_STEPS[this.index]);
    this.render();
  }

  brew(): void {
    if (this.mode !== "alchemy") return;
    this.index = (this.index + 1) % SCOPE_CREEP_STEPS.length;
    this.callbacks.onSelection();
    this.callbacks.onBrew(SCOPE_CREEP_STEPS[this.index]);
    this.render();
  }

  close(): void {
    this.mode = null; this.root.hidden = true;
    if (this.root.contains(document.activeElement) && this.previousFocus?.isConnected) this.previousFocus.focus({ preventScroll: true });
    this.previousFocus = null;
  }
  destroy(): void { this.close(); this.root.remove(); }

  private render(): void {
    const isAlchemy = this.mode === "alchemy";
    const item = isAlchemy ? SCOPE_CREEP_STEPS[this.index] : BOOKS[this.index];
    const finished = isAlchemy && this.index === SCOPE_CREEP_STEPS.length - 1;
    this.root.classList.toggle("dining-panel--ending", isAlchemy);
    this.root.dataset.stage = String(this.index);
    this.root.setAttribute("aria-label", isAlchemy ? "One last side quest: the Scope Creep Cauldron" : "The bookshelf");
    this.art.hidden = !isAlchemy;
    this.endingActions.hidden = !finished;
    this.eyebrow.textContent = isAlchemy ? `ONE LAST SIDE QUEST · ${this.index + 1} / ${SCOPE_CREEP_STEPS.length}` : "THE BOOKSHELF";
    this.title.textContent = item.name;
    this.description.textContent = item.description;
    this.status.textContent = isAlchemy ? SCOPE_CREEP_STEPS[this.index].status : "";
    if (isAlchemy) {
      this.root.style.setProperty("--brew-color", `#${SCOPE_CREEP_STEPS[this.index].color.toString(16).padStart(6, "0")}`);
      this.brewButton.textContent = SCOPE_CREEP_STEPS[this.index].action;
    }
    this.count.textContent = item ? `${this.index + 1} / ${isAlchemy ? SCOPE_CREEP_STEPS.length : BOOKS.length}` : "";
    this.previous.hidden = isAlchemy && this.index === 0;
    this.previous.textContent = isAlchemy ? "← Back" : "← Previous";
    this.next.hidden = isAlchemy;
    this.closeButton.textContent = isAlchemy ? "×" : "Close";
    this.closeButton.setAttribute("aria-label", isAlchemy ? (finished ? "Keep exploring" : "Leave the brew") : "Close bookshelf");
    if (isAlchemy) this.root.insertBefore(this.closeButton, this.eyebrow);
    else this.controls.appendChild(this.closeButton);
    this.count.hidden = isAlchemy || !item;
    this.brewButton.hidden = !isAlchemy;
    this.keys.textContent = isAlchemy ? "E Continue / replay   ·   ← / → Back / next   ·   Esc Leave" :
      "← / → Turn page   ·   Esc Close";
  }
}
