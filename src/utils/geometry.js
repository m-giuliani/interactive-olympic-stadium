import * as THREE from "three";

/**
 * Geometry helpers for the "discorectangle" (stadium) outline used by the track
 * and the seating bowl: two straights joined by two semicircles.
 *
 * The 2D outline lives in the XY plane; callers map it onto the ground with
 * world.x = point.x and world.z = point.y (Y is up).
 */

/**
 * Ordered points tracing a discorectangle outline.
 *
 * @param {number} straightHalf half-length of each straight.
 * @param {number} radius semicircle radius (distance from the straight to edge).
 * @param {number} arcSegments samples per semicircular arc.
 * @returns {THREE.Vector2[]} closed loop (last point connects back to the first).
 */
export function discorectanglePoints(straightHalf, radius, arcSegments = 64) {
  const pts = [];

  // Right semicircle: centre (+straightHalf, 0), sweeping -90° → +90°
  // (i.e. (s,-r) up the right side to (s,+r)).
  for (let i = 0; i <= arcSegments; i++) {
    const a = -Math.PI / 2 + (i / arcSegments) * Math.PI;
    pts.push(
      new THREE.Vector2(
        straightHalf + radius * Math.cos(a),
        radius * Math.sin(a),
      ),
    );
  }

  // The implied edge from (s,+r) to (-s,+r) is the top straight.

  // Left semicircle: centre (-straightHalf, 0), sweeping +90° → +270°
  // ((-s,+r) over the left side down to (-s,-r)).
  for (let i = 0; i <= arcSegments; i++) {
    const a = Math.PI / 2 + (i / arcSegments) * Math.PI;
    pts.push(
      new THREE.Vector2(
        -straightHalf + radius * Math.cos(a),
        radius * Math.sin(a),
      ),
    );
  }

  // The implied closing edge from (-s,-r) back to (s,-r) is the bottom straight.
  return pts;
}

/**
 * A filled THREE.Shape for the discorectangle (e.g. the infield grass).
 */
export function discorectangleShape(straightHalf, radius, arcSegments = 64) {
  const pts = discorectanglePoints(straightHalf, radius, arcSegments);
  const shape = new THREE.Shape();
  shape.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i].x, pts[i].y);
  shape.closePath();
  return shape;
}

/**
 * Returns a sampler for the discorectangle perimeter, parametrised by ARC LENGTH
 * on a single reference radius. Because both the inner and outer rings are read
 * through the SAME parametrisation, a given `u` yields radially-aligned points at
 * any radius `R` — essential for stitching clean raked segments (the seating
 * blocks) whose inner-low and outer-high edges must line up.
 *
 * `u ∈ [0,1)` walks the whole oval once: right semicircle → top straight → left
 * semicircle → bottom straight (matching discorectanglePoints' winding).
 *
 * @param {number} straightHalf half-length of each straight.
 * @param {number} referenceRadius radius whose arc lengths set the parametrisation.
 * @returns {(R: number, u: number, out?: THREE.Vector2) => THREE.Vector2}
 */
export function createDiscorectangleSampler(straightHalf, referenceRadius) {
  const s = straightHalf;
  const arcLen = Math.PI * referenceRadius;
  const straightLen = 2 * s;
  const P = 2 * arcLen + 2 * straightLen;

  return function sample(R, u, out = new THREE.Vector2()) {
    let d = (((u % 1) + 1) % 1) * P; // wrap u into [0,1) then to arc length

    if (d <= arcLen) {
      // Right semicircle, centre (+s, 0), sweeping -90° → +90°.
      const a = -Math.PI / 2 + (d / arcLen) * Math.PI;
      return out.set(s + R * Math.cos(a), R * Math.sin(a));
    }
    d -= arcLen;
    if (d <= straightLen) {
      // Top straight, from (+s, +R) to (-s, +R).
      const t = d / straightLen;
      return out.set(s - t * 2 * s, R);
    }
    d -= straightLen;
    if (d <= arcLen) {
      // Left semicircle, centre (-s, 0), sweeping +90° → +270°.
      const a = Math.PI / 2 + (d / arcLen) * Math.PI;
      return out.set(-s + R * Math.cos(a), R * Math.sin(a));
    }
    d -= arcLen;
    // Bottom straight, from (-s, -R) back to (+s, -R).
    const t = d / straightLen;
    return out.set(-s + t * 2 * s, -R);
  };
}

/**
 * Builds a "ribbon" surface between two corresponding discorectangle loops —
 * used for the flat track ring (both loops on the ground) and the raked seating
 * bowl (inner loop low, outer loop high).
 *
 * Both loops must have the same number of points (same arcSegments) so vertices
 * correspond one-to-one. UVs run u = 0..1 along the loop and v = 0..1 across
 * the ribbon (loopA → loopB); set `.repeat` on the texture to tile.
 *
 * @param {THREE.Vector2[]} loopA inner/lower loop (2D, world XZ).
 * @param {number} yA world height of loopA.
 * @param {THREE.Vector2[]} loopB outer/upper loop (2D, world XZ).
 * @param {number} yB world height of loopB.
 * @returns {THREE.BufferGeometry}
 */
export function buildRibbon(loopA, yA, loopB, yB) {
  const n = loopA.length;

  // Cumulative perimeter distance along loopA, for evenly spaced u.
  const dist = new Array(n + 1);
  dist[0] = 0;
  for (let i = 1; i <= n; i++) {
    dist[i] = dist[i - 1] + loopA[i % n].distanceTo(loopA[i - 1]);
  }
  const total = dist[n] || 1;

  const positions = [];
  const uvs = [];
  for (let i = 0; i <= n; i++) {
    const idx = i % n;
    const a = loopA[idx];
    const b = loopB[idx];
    const u = dist[i] / total;
    positions.push(a.x, yA, a.y);
    uvs.push(u, 0);
    positions.push(b.x, yB, b.y);
    uvs.push(u, 1);
  }

  const indices = [];
  for (let i = 0; i < n; i++) {
    const a0 = i * 2;
    const b0 = i * 2 + 1;
    const a1 = i * 2 + 2;
    const b1 = i * 2 + 3;
    indices.push(a0, b0, a1);
    indices.push(b0, b1, a1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}
