import * as THREE from "three";

import {
  STRAIGHT_HALF,
  BOWL_BOTTOM_RADIUS,
  BOWL_TOP_RADIUS,
  BOWL_TOP_HEIGHT,
} from "./config.js";

/**
 * The tensile roof (copertura) — a procedural recreation of the modern Stadio
 * Olimpico canopy, replacing the four standalone floodlight towers.
 *
 * Two pieces of procedural geometry:
 *  1. An UNDULATING / SCALLOPED membrane: a custom BufferGeometry ring whose Y is
 *     displaced by a sine wave in the perimeter angle, so it reads as a taut
 *     fabric stretched over radial cables — regular peaks and valleys, not a flat
 *     disc.
 *  2. An OUTER STEEL TRUSS ("inferriate"): a zig-zag of white tubular cylinders
 *     (one InstancedMesh) tying the top of the concrete facade out to the wavy
 *     outer eaves of the canopy.
 *
 * Floodlighting is a single unified LED matrix integrated into the inner rim
 * (`roofLeds`, see section 3) — emissive enclosures that read as the stadium's
 * main fixtures and are animated by the ceremony. `rimLights` is kept as an empty
 * array for backward compatibility with the lighting-rig wiring.
 *
 * @returns {{ group: THREE.Group, rimLights: THREE.Vector3[],
 *             roofLeds: THREE.InstancedMesh, dispose: () => void }}
 */

// Edge of the central opening (also the light-mount ring). Pushed far out into
// the bowl so the canopy is a narrow overhang covering only the upper stands,
// leaving the track and pitch wide open to the sky (like the real Olimpico).
const INNER_RADIUS =
  BOWL_BOTTOM_RADIUS + (BOWL_TOP_RADIUS - BOWL_BOTTOM_RADIUS) * 0.5;
// Eaves overhanging just beyond the facade / pillar ring.
const OUTER_RADIUS = BOWL_TOP_RADIUS + 6;
// Mean height of the membrane (+4 over the rim leaves room for the truss below).
const ROOF_Y = BOWL_TOP_HEIGHT + 4;

// A single reference path used to parameterise the ring. Using ONE radius for
// the arc-length maths (rather than each edge's own radius) is what keeps the
// inner and outer vertices aligned — see perimeterPoint().
const REFERENCE_RADIUS = INNER_RADIUS;

// Scalloping: SCALLOPS peaks around the ring, ±AMP metres of corrugation.
const SCALLOPS = 36;
const AMP = 2.2;
// Truss bays around the perimeter (2 per scallop).
const TRUSS_BAYS = 72;
const TUBE_RADIUS = 0.35;
// Floodlight fixtures evenly spaced along the inner rim. Fewer but larger and
// more powerful than a dense dot strip.
const LED_COUNT = 8;

/**
 * A point on the discorectangle outline at radius R, addressed by arc-length
 * fraction u ∈ [0,1).
 *
 * The section (which curve / straight) and the local parameter (angle on a
 * curve, x on a straight) are derived from a SINGLE REFERENCE path
 * (REFERENCE_RADIUS), then applied at the requested R. This is the fix for the
 * "crooked scallops" bug: if each edge used its own perimeter length, the same u
 * would land at different x along the straights for the inner vs outer edge
 * (because the curves' length scales with R while the straights' does not),
 * connecting the vertices diagonally. Sharing the reference guarantees inner and
 * outer share the exact same angle on curves and the exact same x on straights,
 * so the edges connect radially / orthogonally and the waves run straight.
 */
function perimeterPoint(R, u, out = new THREE.Vector2()) {
  const s = STRAIGHT_HALF;
  const arc = Math.PI * REFERENCE_RADIUS; // reference semicircle length
  const straight = 2 * s; // straight length (independent of radius)
  const P = 2 * arc + 2 * straight;
  let d = (((u % 1) + 1) % 1) * P; // distance along the REFERENCE path

  if (d <= arc) {
    // Right semicircle, centre (+s,0): (s,-R) up to (s,+R).
    const a = -Math.PI / 2 + (d / arc) * Math.PI;
    return out.set(s + R * Math.cos(a), R * Math.sin(a));
  }
  d -= arc;
  if (d <= straight) {
    // Top straight: same x for every R → radial inner/outer connection.
    return out.set(s - (d / straight) * 2 * s, R);
  }
  d -= straight;
  if (d <= arc) {
    // Left semicircle, centre (-s,0): (-s,+R) down to (-s,-R).
    const a = Math.PI / 2 + (d / arc) * Math.PI;
    return out.set(-s + R * Math.cos(a), R * Math.sin(a));
  }
  d -= arc;
  // Bottom straight: (-s,-R) → (s,-R).
  return out.set(-s + (d / straight) * 2 * s, -R);
}

// The corrugation profile. Periodic in u (SCALLOPS is an integer) so the ring
// closes seamlessly. Shared by the membrane, the eaves and the rim lights so
// every piece undulates together.
const heightAt = (u) => ROOF_Y + AMP * Math.sin(u * Math.PI * 2 * SCALLOPS);

export function createRoof() {
  const group = new THREE.Group();
  group.name = "Roof";
  const disposables = [];

  // ---------------------------------------------------------------------------
  // 1. Undulating scalloped membrane (custom BufferGeometry)
  // ---------------------------------------------------------------------------
  const SEGMENTS = 360; // samples around the ring → smooth scallops
  const inner = new THREE.Vector2();
  const outer = new THREE.Vector2();
  const positions = [];
  const indices = [];

  for (let i = 0; i <= SEGMENTS; i++) {
    const u = i / SEGMENTS;
    const y = heightAt(u); // inner & outer share Y → radial flutes, wavy edges
    perimeterPoint(INNER_RADIUS, u, inner);
    perimeterPoint(OUTER_RADIUS, u, outer);
    positions.push(inner.x, y, inner.y); // vertex 2i   (inner edge)
    positions.push(outer.x, y, outer.y); // vertex 2i+1 (outer edge)
  }
  for (let i = 0; i < SEGMENTS; i++) {
    const a0 = i * 2;
    const b0 = i * 2 + 1;
    const a1 = i * 2 + 2;
    const b1 = i * 2 + 3;
    indices.push(a0, b0, a1, b0, b1, a1);
  }

  const canopyGeo = new THREE.BufferGeometry();
  canopyGeo.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  canopyGeo.setIndex(indices);
  canopyGeo.computeVertexNormals();

  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, // taut bright-white membrane
    emissive: 0xffffff, // white self-glow so it stands out against the dusk sky
    emissiveIntensity: 0.3,
    roughness: 0.5,
    metalness: 0.0,
    transparent: true,
    opacity: 0.9, // translucent fabric — seats read faintly through it
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.name = "Canopy";
  group.add(canopy);
  disposables.push(canopyGeo, canopyMat);

  // ---------------------------------------------------------------------------
  // 2. Outer steel truss ("inferriate") — zig-zag of white tubes
  //    Bottom chord = facade rim (BOWL_TOP_RADIUS @ BOWL_TOP_HEIGHT)
  //    Top chord    = wavy outer eave (OUTER_RADIUS @ heightAt(u))
  //    Per bay: a vertical post, a diagonal (the zig-zag V), and a top-chord tie.
  // ---------------------------------------------------------------------------
  const trussGeo = new THREE.CylinderGeometry(1, 1, 1, 8); // unit tube, scaled per instance
  const trussMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, // bright white steel
    roughness: 0.4,
    metalness: 0.6, // slightly metallic
  });
  disposables.push(trussGeo, trussMat);

  const MEMBER_COUNT = TRUSS_BAYS * 3;
  const truss = new THREE.InstancedMesh(trussGeo, trussMat, MEMBER_COUNT);
  truss.name = "RoofTruss";

  // Scratch objects reused for every instance matrix.
  const p2 = new THREE.Vector2();
  const A = new THREE.Vector3();
  const B = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const mid = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const mat4 = new THREE.Matrix4();
  let m = 0;

  // Helper: pose the unit cylinder so it spans A→B with radius TUBE_RADIUS.
  const strut = (ax, ay, az, bx, by, bz) => {
    A.set(ax, ay, az);
    B.set(bx, by, bz);
    dir.subVectors(B, A);
    const len = dir.length() || 1e-3;
    mid.addVectors(A, B).multiplyScalar(0.5);
    quat.setFromUnitVectors(up, dir.divideScalar(len)); // dir now normalised
    scale.set(TUBE_RADIUS, len, TUBE_RADIUS);
    mat4.compose(mid, quat, scale);
    truss.setMatrixAt(m++, mat4);
  };

  // Bottom (facade) point and top (eave) point for a given perimeter fraction.
  const bottomAt = (u) => {
    perimeterPoint(BOWL_TOP_RADIUS, u, p2);
    return [p2.x, BOWL_TOP_HEIGHT, p2.y];
  };
  const topAt = (u) => {
    perimeterPoint(OUTER_RADIUS, u, p2);
    return [p2.x, heightAt(u), p2.y];
  };

  for (let k = 0; k < TRUSS_BAYS; k++) {
    const u0 = k / TRUSS_BAYS;
    const u1 = (k + 1) / TRUSS_BAYS;
    const b0 = bottomAt(u0);
    const t0 = topAt(u0);
    const b1 = bottomAt(u1);
    const t1 = topAt(u1);

    strut(b0[0], b0[1], b0[2], t0[0], t0[1], t0[2]); // post  (facade → eave)
    strut(t0[0], t0[1], t0[2], b1[0], b1[1], b1[2]); // diagonal (the zig-zag)
    strut(t0[0], t0[1], t0[2], t1[0], t1[1], t1[2]); // top-chord tie along eave
  }
  truss.instanceMatrix.needsUpdate = true;
  group.add(truss);

  // ---------------------------------------------------------------------------
  // 3. Unified roof LED floodlight matrix — the stadium's ONLY roof lighting now
  //    (the old corner floodlight housings have been removed). An ordered ring of
  //    LED_COUNT powerful fixtures on the inner rim, animated by the ceremony
  //    (chasing rainbow wave). One InstancedMesh with per-instance colour; the
  //    index order (0..N-1 around the ring) drives the travelling wave.
  //
  //    MeshStandardMaterial so the enclosures sit correctly in the PBR lighting,
  //    with a strong white emissive (intensity 5.0) so the 8 fixtures blaze as
  //    the stadium's main lights even when idle, and bloom during the ceremony.
  // ---------------------------------------------------------------------------
  const center = new THREE.Vector3(0, 0, 0);
  const ledGeo = new THREE.BoxGeometry(4.5, 2.0, 1.4); // a chunky lighting rig enclosure
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff, // pure-white self-glow → bright stadium floodlights
    emissiveIntensity: 5.0, // strong baseline so they read as powerful when idle
    roughness: 0.4,
    metalness: 0.2,
  });
  disposables.push(ledGeo, ledMat);

  const roofLeds = new THREE.InstancedMesh(ledGeo, ledMat, LED_COUNT);
  roofLeds.name = "RoofLeds";
  const offColor = new THREE.Color(0xffffff); // pure white → stable lit-stadium look
  roofLeds.userData.offColor = offColor;

  // Mount positions handed to the lighting rig so each fixture becomes a real
  // SpotLight that actually illuminates the pitch (not just an emissive glow).
  const lightAnchors = [];

  const ledPos = new THREE.Vector2();
  const ledV = new THREE.Vector3();
  const ledMat4 = new THREE.Matrix4();
  const ledLook = new THREE.Matrix4();
  const ledQuat = new THREE.Quaternion();
  const ledScale = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < LED_COUNT; i++) {
    const u = i / LED_COUNT;
    perimeterPoint(INNER_RADIUS, u, ledPos);
    ledV.set(ledPos.x, heightAt(u) - 0.8, ledPos.y); // hang just under the rim
    // Orient the enclosure so its broad face aims down/inward at the pitch.
    ledLook.lookAt(ledV, center, up);
    ledQuat.setFromRotationMatrix(ledLook);
    ledMat4.compose(ledV, ledQuat, ledScale);
    roofLeds.setMatrixAt(i, ledMat4);
    roofLeds.setColorAt(i, offColor);
    lightAnchors.push(ledV.clone()); // a real light hangs here
  }
  roofLeds.instanceMatrix.needsUpdate = true;
  roofLeds.instanceColor.needsUpdate = true;
  group.add(roofLeds);

  return {
    group,
    rimLights: lightAnchors, // 8 LED-fixture positions for the lighting rig
    roofLeds,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
