import * as THREE from "three";

import { STRAIGHT_HALF, BOWL_BOTTOM_RADIUS } from "./config.js";

/**
 * StadiumPlan — the 2D FOOTPRINT layer of the seating-bowl refactor.
 *
 * It defines the trackside outline as a G1-continuous chain of four sectors —
 * two straights (Tribuna Tevere / Monte Mario) and two semicircular curves
 * (Curva Nord / Sud) — i.e. the classic "Olimpico" oval (a discorectangle).
 *
 * The whole point of this layer is to decouple SHAPE from everything built on
 * top of it. Instead of asking "give me a point at radius R", callers ask
 * {@link sample}(u) and get a local FRAME:
 *
 *     { point, tangent, normal (outward), sectorIndex, sectorId, sectorT }
 *
 * A back-of-bowl vertex is then `point + normal * depth` at some height — so the
 * rake, the stairs and the vomitories all march "outward" along the per-sector
 * normal (perpendicular on the straights, radial on the curves) rather than from
 * one global centre. That is what makes the bowl non-radial and lets us reshape
 * the oval (straight length / curve radius) without touching any generator.
 *
 * Winding matches utils/geometry.js `createDiscorectangleSampler` and the rest
 * of the stadium: right curve → top straight → left curve → bottom straight,
 * u ∈ [0,1) by ARC LENGTH.
 *
 * NOTE: per-sector independent radii / squareness are intentionally deferred —
 * a symmetric discorectangle keeps the chain trivially G1-closed (verified at
 * every joint: shared endpoint + matching tangent + matching outward normal).
 */

/**
 * The sector table — the single knob-board. Geometry of the oval itself is the
 * symmetric discorectangle (shared `straightHalf` + `radius`); these per-sector
 * fields carry IDENTITY + the metadata the later RakeProfile / generator phases
 * will consume (rows, blocks, tint). They are declared now so the data
 * structure is stable; only id/name/kind/tint matter for this footprint phase.
 */
export const SECTORS = [
  {
    id: "curva_nord",
    name: "Curva Nord",
    kind: "curve",
    tint: [0.86, 0.97, 1.08], // cool blue
    rows: 30,
    blocks: 5,
  },
  {
    id: "tevere",
    name: "Tribuna Tevere",
    kind: "straight",
    tint: [1.0, 1.0, 1.0], // neutral
    rows: 38,
    blocks: 7,
  },
  {
    id: "curva_sud",
    name: "Curva Sud",
    kind: "curve",
    tint: [1.08, 0.95, 0.93], // warm red
    rows: 30,
    blocks: 5,
  },
  {
    id: "monte_mario",
    name: "Tribuna Monte Mario",
    kind: "straight",
    tint: [1.04, 1.05, 0.9], // warm gold
    rows: 38,
    blocks: 7,
  },
];

/**
 * Builds a StadiumPlan for the discorectangle oval.
 *
 * @param {{ straightHalf?: number, radius?: number, sectors?: typeof SECTORS }} [opts]
 *   straightHalf — half-length of each straight; radius — curve radius (and the
 *   trackside inner radius of the bowl). Defaults match config.js so the plan
 *   sits exactly on the existing inner bowl edge.
 * @returns {ReturnType<typeof buildPlan>}
 */
export function createStadiumPlan(opts = {}) {
  const straightHalf = opts.straightHalf ?? STRAIGHT_HALF;
  const radius = opts.radius ?? BOWL_BOTTOM_RADIUS;
  const sectors = opts.sectors ?? SECTORS;
  return buildPlan(straightHalf, radius, sectors);
}

function buildPlan(s, R, sectors) {
  // Expected canonical order: curve, straight, curve, straight.
  const kinds = sectors.map((x) => x.kind).join(",");
  if (kinds !== "curve,straight,curve,straight") {
    throw new Error(
      `StadiumPlan expects sectors curve,straight,curve,straight — got ${kinds}`,
    );
  }

  // Four segments in discorectangle winding (see header). Each carries enough to
  // evaluate point / tangent / outward-normal at a local parameter t ∈ [0,1].
  const segments = [
    // 0: right semicircle, centre (+s, 0), a: -90° → +90°  ((s,-R) → (s,+R))
    arcSegment(0, new THREE.Vector2(s, 0), R, -Math.PI / 2, Math.PI / 2),
    // 1: top straight, (s,+R) → (-s,+R), outward +Y
    lineSegment(1, new THREE.Vector2(s, R), new THREE.Vector2(-s, R)),
    // 2: left semicircle, centre (-s, 0), a: +90° → +270°  ((-s,+R) → (-s,-R))
    arcSegment(2, new THREE.Vector2(-s, 0), R, Math.PI / 2, (3 * Math.PI) / 2),
    // 3: bottom straight, (-s,-R) → (s,-R), outward -Y
    lineSegment(3, new THREE.Vector2(-s, -R), new THREE.Vector2(s, -R)),
  ];

  // Cumulative arc length → total perimeter, and per-sector u boundaries.
  let cum = 0;
  for (const seg of segments) {
    seg.cumStart = cum;
    cum += seg.length;
    seg.cumEnd = cum;
  }
  const perimeter = cum;

  // Enriched sector descriptors (id/kind + u-range), handy for callers/debug.
  const sectorInfo = segments.map((seg, i) => ({
    ...sectors[i],
    sectorIndex: i,
    u0: seg.cumStart / perimeter,
    u1: seg.cumEnd / perimeter,
  }));

  const segAt = (u) => {
    const d = (((u % 1) + 1) % 1) * perimeter;
    // Linear scan over 4 segments — trivially cheap.
    let seg = segments[segments.length - 1];
    for (const s2 of segments) {
      if (d <= s2.cumEnd) {
        seg = s2;
        break;
      }
    }
    const t = seg.length > 0 ? (d - seg.cumStart) / seg.length : 0;
    return { seg, t };
  };

  /**
   * Local frame at perimeter parameter u ∈ [0,1).
   * @param {number} u
   * @returns {{ point: THREE.Vector2, tangent: THREE.Vector2,
   *             normal: THREE.Vector2, sectorIndex: number, sectorId: string,
   *             sectorT: number }}
   */
  const sample = (u) => {
    const { seg, t } = segAt(u);
    const f = seg.frame(t);
    return {
      point: f.point,
      tangent: f.tangent,
      normal: f.normal,
      sectorIndex: seg.sectorIndex,
      sectorId: sectors[seg.sectorIndex].id,
      sectorT: t,
    };
  };

  /**
   * A point pushed `depth` outward from the footprint along the local normal —
   * the primitive every later generator uses to build back rows.
   * @returns {THREE.Vector2}
   */
  const offset = (u, depth, out = new THREE.Vector2()) => {
    const { point, normal } = sample(u);
    return out.set(point.x + normal.x * depth, point.y + normal.y * depth);
  };

  return {
    sectors: sectorInfo,
    straightHalf: s,
    radius: R,
    perimeter,
    sample,
    offset,
  };
}

// --- Segment factories -------------------------------------------------------

function arcSegment(sectorIndex, center, radius, a0, a1) {
  const dir = Math.sign(a1 - a0) || 1; // sweep direction for the tangent
  return {
    type: "arc",
    sectorIndex,
    length: Math.abs(a1 - a0) * radius,
    cumStart: 0,
    cumEnd: 0,
    frame(t) {
      const a = a0 + (a1 - a0) * t;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      return {
        point: new THREE.Vector2(center.x + radius * cos, center.y + radius * sin),
        // Outward normal = radial from the arc's own centre.
        normal: new THREE.Vector2(cos, sin),
        // Tangent follows the sweep direction.
        tangent: new THREE.Vector2(-sin * dir, cos * dir),
      };
    },
  };
}

function lineSegment(sectorIndex, start, end) {
  const dir = end.clone().sub(start).normalize();
  // Outward normal: perpendicular to dir, sign chosen to point away from origin
  // (the oval centre), evaluated at the segment midpoint.
  const mid = start.clone().add(end).multiplyScalar(0.5);
  let normal = new THREE.Vector2(-dir.y, dir.x);
  if (normal.dot(mid) < 0) normal.negate();
  return {
    type: "line",
    sectorIndex,
    length: end.distanceTo(start),
    cumStart: 0,
    cumEnd: 0,
    frame(t) {
      return {
        point: start.clone().lerp(end, t),
        normal: normal.clone(),
        tangent: dir.clone(),
      };
    },
  };
}
