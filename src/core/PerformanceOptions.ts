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
  const perfDiag = enabled("perfdiag");
  return {
    lowFx,
    perfDiag,
    // Experimental texture comparison: full-quality originals remain default.
    ktx2Textures: perfDiag && params.get("ktx2") === "1",
    outlines: !lowFx && params.get("outlines") !== "0",
    highlightMode: params.get("highlight") === "outline" ? "outline" : "border",
    shadows: !lowFx && params.get("shadows") !== "0",
    decorativeLights: params.get("decorativeLights") !== "0",
    workshopLights: params.get("workshopLights") === "all" ? "all"
      : params.get("workshopLights") === "focused" ? "focused" : "inspect",
    beamBatching: params.get("beamBatching") !== "0",
    staticBatching: params.get("staticBatching") !== "0",
    staticTransforms: params.get("staticTransforms") !== "0",
    // Retain authored close-ups; allow a direct full-detail comparison.
    exteriorLod: params.get("exteriorLod") !== "0",
    // Colorless depth isolation is available only in explicit diagnostics.
    waterShader: params.get("waterShader") === "vertex" ? "vertex" as const
      : perfDiag && params.get("waterShader") === "depth" ? "depth" as const : "original" as const,
    stoneLod: params.get("stoneLod") !== "0",
    surfaceCulling: params.get("surfaceCulling") !== "0",
    activeLightsOnly: params.get("activeLightsOnly") !== "0",
    pixelRatio,
    stats: enabled("stats") || gpuStats,
    gpuStats,
    gpuTiming: perfDiag && !gpuStats && enabled("gpuTiming"),
  };
}

export const performanceOptions = getPerformanceOptions(window.location.search, window.devicePixelRatio);
