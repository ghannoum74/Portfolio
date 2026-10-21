// Independent switches keep A/B captures attributable to one setting.
export function getPerformanceOptions(search: string, devicePixelRatio: number) {
  const params = new URLSearchParams(search);
  const lowFx = params.has("lowfx") && params.get("lowfx") !== "0";
  const enabled = (name: string) => params.has(name) && params.get(name) !== "0";
  const requestedRatio = Number(params.get("dpr"));
  const nativeRatio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? devicePixelRatio : 1;
  const pixelRatio = params.has("dpr") && Number.isFinite(requestedRatio) && requestedRatio > 0
    ? Math.min(nativeRatio, Math.max(0.5, Math.min(requestedRatio, 2)))
    : lowFx ? 1 : Math.min(nativeRatio, 2);
  const gpuStats = !lowFx && enabled("gpuStats");
  return {
    lowFx,
    perfDiag: enabled("perfdiag"),
    outlines: !lowFx && params.get("outlines") !== "0",
    highlightMode: params.get("highlight") === "outline" ? "outline" : "material",
    shadows: !lowFx && params.get("shadows") !== "0",
    decorativeLights: params.get("decorativeLights") !== "0",
    workshopLights: params.get("workshopLights") === "all" ? "all"
      : params.get("workshopLights") === "focused" ? "focused" : "inspect",
    beamBatching: params.get("beamBatching") !== "0",
    activeLightsOnly: params.get("activeLightsOnly") !== "0",
    pixelRatio,
    stats: enabled("stats") || gpuStats,
    gpuStats,
  };
}

export const performanceOptions = getPerformanceOptions(window.location.search, window.devicePixelRatio);
