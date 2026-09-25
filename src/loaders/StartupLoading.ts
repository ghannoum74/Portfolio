import { GameLoadingManager } from "./GameLoadingManager";
import { LoadingScreen } from "../ui/LoadingScreen";
import { STARTUP_ASSETS } from "./AssetManifest";

export class StartupLoading {
  private readonly assetManager = new GameLoadingManager();

  private readonly screen = new LoadingScreen();

  private readonly expected = new Set<string>(STARTUP_ASSETS);

  private readonly completed = new Set<string>();

  private readonly failures = new Set<string>();

  readonly manager = this.assetManager.instance;

  constructor() {
    this.screen.setAssetProgress(0, this.expected.size);

    // Track errors in the underlying loading system.
    this.manager.onError = (url) => {
      this.failures.add(url);
      console.error("Asset loading failed:", url);
    };
  }

  setStatus(message: string): void {
    this.screen.setStatus(message);
  }

  // Arrow property preserves `this` when passed
  // directly to AssetLoader as a callback.
  assetReady = (url: string): void => {
    if (!this.expected.has(url)) {
      throw new Error(`Unregistered startup asset: ${url}`);
    }

    // A Set prevents accidentally counting
    // the same asset twice.
    this.completed.add(url);

    this.screen.setAssetProgress(
      this.completed.size,
      this.expected.size,
      url.split("/").pop(),
    );
  };

  verify(): void {
    if (this.failures.size > 0) {
      throw new Error(`Failed resources: ${[...this.failures].join(", ")}`);
    }

    const missing = [...this.expected].filter(
      (url) => !this.completed.has(url),
    );

    if (missing.length > 0) {
      throw new Error(`Startup assets not loaded: ${missing.join(", ")}`);
    }
  }

  complete(): void {
    this.screen.complete();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.screen.hide();
      });
    });
  }

  showError(error: unknown): void {
    this.screen.showError(
      error instanceof Error
        ? error.message
        : "Unable to initialize the world.",
    );
  }
}
