import { GameLoadingManager } from "./GameLoadingManager";
import { STARTUP_ASSETS } from "./AssetManifest";
import { LoadingScreen } from "../ui/LoadingScreen/LoadingScreen";

export class StartupLoading {
  private readonly assetManager = new GameLoadingManager();

  private readonly screen = new LoadingScreen();

  private readonly expected = new Set<string>(STARTUP_ASSETS);

  private readonly completed = new Set<string>();

  private readonly failures = new Set<string>();

  readonly manager = this.assetManager.instance;

  constructor() {
    this.screen.setAssetProgress(0, this.expected.size);

    this.manager.onError = (url) => {
      this.failures.add(url);

      console.error("Asset loading failed:", url);
    };
  }

  assetReady = (url: string): void => {
    console.log("-----------", url);
    if (!this.expected.has(url)) {
      throw new Error(`Unregistered startup asset: ${url}`);
    }

    this.completed.add(url);

    this.screen.setAssetProgress(this.completed.size, this.expected.size);
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

  async complete(): Promise<void> {
    this.screen.complete();

    // Display the completed loading bar
    // before beginning the fade-out.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(resolve);
      });
    });

    // Wait until the overlay has disappeared.
    await this.screen.hide();
  }

  showError(error: unknown): void {
    console.error("Startup loading error:", error);

    this.screen.showError();
  }
}
