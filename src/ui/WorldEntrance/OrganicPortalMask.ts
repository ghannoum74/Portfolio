type Point = readonly [number, number];

interface ShapeKeyframe {
  at: number;
  points: readonly Point[];
}

/**
 * Reference-guided SVG outlines.
 *
 * Coordinates are normalized relative to
 * the viewport:
 *
 * x: 0 = left, 1 = right
 * y: 0 = top,  1 = bottom
 *
 * Every shape has 18 corresponding points,
 * starting on the upper-left boundary
 * and continuing clockwise.
 */
const SHAPES: readonly ShapeKeyframe[] = [
  // 0%: Tiny opening.
  {
    at: 0,
    points: [
      [0.608, 0.485],
      [0.621, 0.476],
      [0.632, 0.472],
      [0.641, 0.47],
      [0.65, 0.47],
      [0.659, 0.471],
      [0.671, 0.473],
      [0.689, 0.482],
      [0.699, 0.507],
      [0.689, 0.536],
      [0.673, 0.551],
      [0.66, 0.557],
      [0.649, 0.56],
      [0.64, 0.56],
      [0.628, 0.56],
      [0.614, 0.556],
      [0.596, 0.541],
      [0.596, 0.504],
    ],
  },

  // 24%: Initial reference opening.
  {
    at: 0.24,
    points: [
      [0.512, 0.418],
      [0.558, 0.389],
      [0.599, 0.377],
      [0.631, 0.372],
      [0.663, 0.372],
      [0.695, 0.373],
      [0.737, 0.382],
      [0.799, 0.41],
      [0.835, 0.486],
      [0.802, 0.578],
      [0.743, 0.624],
      [0.697, 0.643],
      [0.659, 0.652],
      [0.626, 0.654],
      [0.585, 0.652],
      [0.533, 0.641],
      [0.468, 0.595],
      [0.467, 0.479],
    ],
  },

  // 48%: Broad asymmetric opening.
  // The upper-right curve rises noticeably.
  {
    at: 0.48,
    points: [
      [0.533, 0.365],
      [0.601, 0.348],
      [0.647, 0.341],
      [0.679, 0.335],
      [0.714, 0.327],
      [0.759, 0.301],
      [0.856, 0.252],
      [0.94, 0.318],
      [0.954, 0.445],
      [0.881, 0.558],
      [0.813, 0.615],
      [0.759, 0.644],
      [0.713, 0.661],
      [0.668, 0.674],
      [0.609, 0.678],
      [0.529, 0.669],
      [0.428, 0.604],
      [0.449, 0.434],
    ],
  },

  // 67%: The opening spreads toward
  // the viewport's right edge.
  {
    at: 0.67,
    points: [
      [0.463, 0.302],
      [0.573, 0.298],
      [0.628, 0.282],
      [0.67, 0.259],
      [0.722, 0.221],
      [0.796, 0.179],
      [0.907, 0.162],
      [0.996, 0.264],
      [0.999, 0.423],
      [0.999, 0.593],
      [0.868, 0.666],
      [0.778, 0.685],
      [0.716, 0.703],
      [0.657, 0.715],
      [0.582, 0.719],
      [0.479, 0.709],
      [0.354, 0.623],
      [0.36, 0.403],
    ],
  },

  // 84%: Two large upper waves develop.
  // The left edge spreads significantly.
  {
    at: 0.84,
    points: [
      [0.168, 0.161],
      [0.339, 0.124],
      [0.478, 0.19],
      [0.539, 0.195],
      [0.599, 0.172],
      [0.684, 0.116],
      [0.857, 0.034],
      [0.999, 0.158],
      [0.999, 0.385],
      [0.999, 0.625],
      [0.862, 0.78],
      [0.699, 0.782],
      [0.601, 0.791],
      [0.518, 0.789],
      [0.414, 0.796],
      [0.254, 0.802],
      [0.172, 0.628],
      [0.024, 0.342],
    ],
  },

  // 100%: The entire viewport is covered.
  // All boundaries extend beyond the screen.
  {
    at: 1,
    points: [
      [-0.3, -0.4],
      [0.2, -0.5],
      [0.4, -0.43],
      [0.6, -0.48],
      [0.85, -0.62],
      [1.15, -0.65],
      [1.52, -0.48],
      [1.62, -0.18],
      [1.65, 0.34],
      [1.65, 0.82],
      [1.4, 1.3],
      [1.13, 1.41],
      [0.86, 1.42],
      [0.58, 1.44],
      [0.27, 1.48],
      [-0.06, 1.44],
      [-0.4, 1.08],
      [-0.52, 0.28],
    ],
  },
];

export class OrganicPortalMask {
  private readonly path: SVGPathElement;

  private static readonly REFERENCE_ASPECT = 1398 / 906;

  constructor(path: SVGPathElement) {
    this.path = path;

    const pointCount = SHAPES[0].points.length;

    for (let i = 0; i < SHAPES.length; i++) {
      const shape = SHAPES[i];

      if (shape.points.length !== pointCount) {
        throw new Error("Portal keyframes must have equal point counts");
      }

      if (i > 0 && shape.at <= SHAPES[i - 1].at) {
        throw new Error("Portal keyframe times must increase");
      }
    }

    // Clear transforms left over from
    // the previous scaling implementation.
    this.path.removeAttribute("transform");

    this.setProgress(0);
  }

  setProgress(progress: number): void {
    const p = this.clamp(progress);

    // Find the two surrounding keyframes.
    let upperIndex = 1;

    while (upperIndex < SHAPES.length - 1 && p > SHAPES[upperIndex].at) {
      upperIndex++;
    }

    const from = SHAPES[upperIndex - 1];
    const to = SHAPES[upperIndex];

    const previous = SHAPES[Math.max(0, upperIndex - 2)];

    const following = SHAPES[Math.min(SHAPES.length - 1, upperIndex + 1)];

    const duration = to.at - from.at;

    const t = this.clamp((p - from.at) / duration);

    // Interpolate all corresponding points.
    const points: Point[] = from.points.map((point, index) => {
      const next = to.points[index];

      return [
        this.interpolate(
          previous.points[index][0],
          point[0],
          next[0],
          following.points[index][0],
          previous.at,
          from.at,
          to.at,
          following.at,
          t,
        ),

        this.interpolate(
          previous.points[index][1],
          point[1],
          next[1],
          following.points[index][1],
          previous.at,
          from.at,
          to.at,
          following.at,
          t,
        ),
      ];
    });

    // Preserve physical proportions across
    // different viewport aspect ratios.
    const fittedPoints = this.fitViewport(points, p);

    // Update one SVG attribute.
    this.path.setAttribute("d", this.createPath(fittedPoints));
  }

  /**
   * Viewport fitting.
   *
   * The reference was captured on a landscape
   * viewport. Without correction, its shape
   * would become too tall on portrait screens
   * or too wide on ultrawide monitors.
   *
   * The correction gradually disappears
   * near the end so the entire screen can
   * always be revealed.
   */
  private fitViewport(points: readonly Point[], progress: number): Point[] {
    const aspect = window.innerWidth / Math.max(window.innerHeight, 1);

    const referenceAspect = OrganicPortalMask.REFERENCE_ASPECT;

    const xFit = Math.min(1, referenceAspect / aspect);

    const yFit = Math.min(1, aspect / referenceAspect);

    // Gradually remove aspect correction
    // during the final expansion.
    const restoreProgress = this.clamp((progress - 0.62) / 0.38);

    const eased = restoreProgress * restoreProgress * (3 - 2 * restoreProgress);

    const influence = 1 - eased;

    const scaleX = 1 + (xFit - 1) * influence;

    const scaleY = 1 + (yFit - 1) * influence;

    // Approximate center of the reference's
    // small and medium-sized openings.
    const centerX = 0.1;
    const centerY = 0.3;

    return points.map(([x, y]) => [
      centerX + (x - centerX) * scaleX,
      centerY + (y - centerY) * scaleY,
    ]);
  }

  /**
   * Cubic Hermite interpolation.
   *
   * Each point follows a smooth trajectory
   * through the shape keyframes.
   */
  private interpolate(
    previous: number,
    start: number,
    end: number,
    following: number,
    previousTime: number,
    startTime: number,
    endTime: number,
    followingTime: number,
    t: number,
  ): number {
    const duration = endTime - startTime;

    const startSlope =
      previousTime === startTime
        ? (end - start) / duration
        : (end - previous) / (endTime - previousTime);

    const endSlope =
      followingTime === endTime
        ? (end - start) / duration
        : (following - start) / (followingTime - startTime);

    const t2 = t * t;
    const t3 = t2 * t;

    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    return (
      h00 * start +
      h10 * duration * startSlope +
      h01 * end +
      h11 * duration * endSlope
    );
  }

  /**
   * Build a smooth closed SVG path.
   *
   * Convert neighboring points to
   * cubic Bézier control points.
   */
  private createPath(points: readonly Point[]): string {
    const count = points.length;

    const format = (value: number): string => value.toFixed(5);

    let d = `M ${format(points[0][0])} ` + `${format(points[0][1])}`;

    for (let i = 0; i < count; i++) {
      const previous = points[(i - 1 + count) % count];

      const current = points[i];

      const next = points[(i + 1) % count];

      const following = points[(i + 2) % count];

      const control1X = current[0] + (next[0] - previous[0]) / 6;

      const control1Y = current[1] + (next[1] - previous[1]) / 6;

      const control2X = next[0] - (following[0] - current[0]) / 6;

      const control2Y = next[1] - (following[1] - current[1]) / 6;

      d +=
        ` C ${format(control1X)} ` +
        `${format(control1Y)} ` +
        `${format(control2X)} ` +
        `${format(control2Y)} ` +
        `${format(next[0])} ` +
        `${format(next[1])}`;
    }

    return `${d} Z`;
  }

  private clamp(value: number): number {
    return Math.min(1, Math.max(0, value));
  }
}
