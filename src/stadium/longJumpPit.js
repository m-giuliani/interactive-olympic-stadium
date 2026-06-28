import * as THREE from "three";

import {
  makeGrainNormalMap,
  makeLongJumpRunwayTexture,
  makeLongJumpBoardTexture,
} from "../utils/textures.js";
import {
  LJ_Z,
  LJ_RUNWAY_START_X,
  LJ_BOARD_X,
  LJ_PIT_START_X,
  LJ_PIT_END_X,
  LJ_RUNWAY_WIDTH,
  LJ_PIT_WIDTH,
} from "./config.js";

// --- Deterministic 2D value noise -------------------------------------------
// Used to break the sand craters out of clean ellipses into jagged, irregular
// shapes. Deterministic in world (x,z) so the same patch of sand always deforms
// the same way across re-tessellation and reset(), and so two craters at
// different spots never look identical.
function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s); // 0..1
}
function valueNoise(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf); // smoothstep
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi);
  const b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1);
  const d = hash2(xi + 1, zi + 1);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b, u),
    THREE.MathUtils.lerp(c, d, u),
    v,
  );
}

/**
 * The long jump facility: a brick-red run-up runway with the white take-off line
 * PAINTED into its texture (no floating board mesh), and a RESPONSIVE sand
 * landing pit. The sand reuses the procedural grain normal map
 * (CLAUDE.md §5) so it reads as a rough granular surface under the floodlights.
 *
 * Two effects make the landing physically convincing and explicitly demonstrate
 * the course topics "Surfaces and 3D modelling" and "Physics-based animation":
 *
 *   1. CRATER — the sand is a finely tessellated BoxGeometry. On impact the
 *      top-face vertices around the landing (x,z) are pushed DOWN by an
 *      ASYMMETRIC, noise-broken gouge (long forward drag, ragged edge) with a
 *      raised rim of displaced sand, and the vertex normals are recomputed so
 *      the real-time shadows and floodlight highlights wrap the fresh furrow.
 *      The sunk vertices are also darkened via a per-vertex colour attribute
 *      (fake ambient occlusion / damp compacted sand), so the hollow reads as
 *      deep even under flat lighting. Touchdown carves two heel furrows; the
 *      ensuing slide chains lighter stamps into a trail. Craters accumulate
 *      across the eight jumps, churning the pit, and reset() flattens it back
 *      for a new competition.
 *
 *   2. SPLASH — a pool of sand grains rendered with a single InstancedMesh (one
 *      draw call). The heel strike throws a small puff; the main dense burst is
 *      fired by the event when the body drives into the pit — a heavy, directional
 *      blast of individual grains thrown predominantly FORWARD (+x, the run
 *      direction) and fanned out to ±z in a V, with speeds skewed so the core is
 *      dense and only a few grains reach the edge. Integrated under a heavier
 *      gravity plus aggressive horizontal drag (hand-written projectile physics)
 *      so the sand stays low and settles fast like real heavy matter.
 *      `splashScale` on impact() decouples the grain count from the dig strength.
 *      The event hooks update(dt) into the main animation loop.
 *
 * Geometry only — the LongJumpEvent drives the athlete over it and triggers the
 * effects through the returned `sand` API.
 *
 * @returns {{ group: THREE.Group,
 *             sand: { impact: (x:number, z:number, strength?:number, opts?:{heels?:boolean}) => void,
 *                     update: (dt:number) => void,
 *                     reset: () => void,
 *                     setMark: (distanceMeters: number|null) => void },
 *             dispose: () => void }}
 */
export function createLongJumpPit() {
  const group = new THREE.Group();
  group.name = "LongJump";
  const disposables = [];

  // --- Runway ----------------------------------------------------------------
// Runway runs all the way to the sand (LJ_PIT_START_X), so no gap opens when the
// take-off line sits back from the pit. The white line is PAINTED at LJ_BOARD_X
// (where the athletes actually plant), 2 m before the sand. One number — change
// LJ_BOARD_X — and the line AND the plant move together.
const KERB_OVERHANG = 0.25;  
const runwayEndX = LJ_PIT_START_X - KERB_OVERHANG;

const runwayLen = runwayEndX - LJ_RUNWAY_START_X;       // 26, reaches the sand
const linePos = (LJ_BOARD_X - LJ_RUNWAY_START_X) / runwayLen; // = 0.923 → clean, mid-texture
const runwayTex = makeLongJumpRunwayTexture(linePos);
const runwayGeo = new THREE.BoxGeometry(runwayLen, 0.02, LJ_RUNWAY_WIDTH);
const runwayMat = new THREE.MeshStandardMaterial({
  map: runwayTex,
  roughness: 0.85,
});
const runway = new THREE.Mesh(runwayGeo, runwayMat);
runway.position.set(LJ_RUNWAY_START_X + runwayLen / 2, 0.01, LJ_Z);
runway.receiveShadow = true;
group.add(runway);
disposables.push(runwayGeo, runwayMat, runwayTex);


  // --- Sand pit (deformable surface) -----------------------------------------
  const pitLen = LJ_PIT_END_X - LJ_PIT_START_X;
  const pitCx = LJ_PIT_START_X + pitLen / 2;
  const sandNormal = makeGrainNormalMap();
  sandNormal.repeat.set(10, 4);

  // Finely tessellated so a footprint-sized crater has enough vertices to read
  // as a smooth depression (≈0.12 m per quad across the pit).
  const SAND_H = 0.5;
  const sandGeo = new THREE.BoxGeometry(pitLen, SAND_H, LJ_PIT_WIDTH, 120, 1, 40);
  const sandMat = new THREE.MeshStandardMaterial({
    color: 0xd9c89b,
    normalMap: sandNormal,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 1.0,
    side: THREE.DoubleSide,
    vertexColors: true, // depth-based AO tint multiplies the base sand colour
  });
  const sand = new THREE.Mesh(sandGeo, sandMat);
  // Sand surface raised slightly above runway level. This gives the crater real
  // headroom to dig DOWN without the surface ever reaching the dark geometry
  // beneath it — the kerb top (0.02) and apron (0.015) — and exposing it as
  // "asphalt". The deepest dig is SAND_TOP - MAX_DISP (see below).
  const SAND_TOP = 0.06;
  const sandY = SAND_TOP - SAND_H / 2;
  sand.position.set(pitCx, sandY, LJ_Z);
  sand.receiveShadow = true;
  group.add(sand);
  disposables.push(sandGeo, sandMat, sandNormal);

  // --- Pit kerb (thin dark frame around the sand) ----------------------------
  const kerbGeo = new THREE.BoxGeometry(pitLen + 0.5, 0.04, LJ_PIT_WIDTH + 0.5);
  const kerbMat = new THREE.MeshStandardMaterial({
    color: 0x3a3f47,
    roughness: 0.8,
  });
  const kerb = new THREE.Mesh(kerbGeo, kerbMat);
  kerb.position.set(pitCx, 0.00 , LJ_Z);
  kerb.receiveShadow = true;
  group.add(kerb);
  disposables.push(kerbGeo, kerbMat);

  // --- OMEGA-style LED measurement board (procedural) ------------------------
  // A tall thin board STANDING behind the pit (+Z edge), its glowing blue LED
  // face pointing back toward the infield/camera (−Z). Numbered in metres from
  // the take-off line; the "0" is LJ_BOARD_X, so distances come from config and
  // stay correct if LJ_BOARD_X moves. A live green line marks the measured jump.
  const BOARD_LEN = pitLen; // along X, full pit length
  const BOARD_H = 0.6; // total height
  const BOARD_T = 0.08; // thickness in Z
  const BOARD_BASE_Y = 0.04; // stands on the kerb
  const FACE_H = 0.48; // LED face height (must match makeLongJumpBoardTexture)
  const boardStart = LJ_PIT_START_X - LJ_BOARD_X; // distance (m) at the near pit end
  const boardEnd = LJ_PIT_END_X - LJ_BOARD_X; // distance (m) at the far pit end

  const boardGroup = new THREE.Group();
  boardGroup.name = "LongJumpBoard";
  // Just behind the kerb's far edge, inside the apron (well before the bowl).
  boardGroup.position.set(
    pitCx,
    BOARD_BASE_Y + BOARD_H / 2,
    LJ_Z + LJ_PIT_WIDTH / 2 + 0.15,
  );

  // Red frame.
  const frameGeo = new THREE.BoxGeometry(BOARD_LEN, BOARD_H, BOARD_T);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xb51e1e, roughness: 0.5 });
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.castShadow = true;
  frame.receiveShadow = true;
  boardGroup.add(frame);
  disposables.push(frameGeo, frameMat);

  // Glowing blue LED face — emissive display (same pattern as createLedRibbon),
  // inset a hair in front of the frame's −Z side so it reads as the screen.
  const boardTex = makeLongJumpBoardTexture(boardStart, boardEnd);
  const faceGeo = new THREE.PlaneGeometry(BOARD_LEN - 0.12, FACE_H);
  const faceMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0xffffff,
    emissiveMap: boardTex,
    emissiveIntensity: 1.6,
    roughness: 0.5,
    metalness: 0.0,
  });
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.rotation.x = Math.PI; // normal → −Z, faces the infield/camera
  face.position.z = -BOARD_T / 2 - 0.002; // 2 mm in front of the frame
  boardGroup.add(face);
  disposables.push(faceGeo, faceMat, boardTex);

  // Live green result line — a thin bright-green emissive bar on the face.
  const markGeo = new THREE.BoxGeometry(0.05, FACE_H, 0.01);
  const markMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    emissive: 0x39ff5a,
    emissiveIntensity: 2.4,
    roughness: 0.5,
  });
  const markBar = new THREE.Mesh(markGeo, markMat);
  markBar.position.z = -BOARD_T / 2 - 0.006; // just in front of the LED face
  markBar.visible = false;
  boardGroup.add(markBar);
  disposables.push(markGeo, markMat);

  group.add(boardGroup);

  /**
   * Move the green result line to a measured distance (m from the take-off line)
   * and show it; pass null/undefined to hide it. World X = LJ_BOARD_X + distance,
   * clamped to the board span. The bar is a child of the board group (centred at
   * pitCx), so its local x is the world offset from pitCx.
   */
  function setMark(distanceMeters) {
    if (distanceMeters == null || !Number.isFinite(distanceMeters)) {
      markBar.visible = false;
      return;
    }
    const worldX = THREE.MathUtils.clamp(
      LJ_BOARD_X + distanceMeters,
      LJ_PIT_START_X,
      LJ_PIT_END_X,
    );
    markBar.position.x = worldX - pitCx;
    markBar.visible = true;
  }

  // ===========================================================================
  // Responsive-sand controller: vertex crater + InstancedMesh splash.
  // ===========================================================================

  // --- Crater state ----------------------------------------------------------
  const posAttr = sandGeo.attributes.position;
  const basePos = new Float32Array(posAttr.array); // pristine copy for reset()
  const topY = SAND_H / 2; // local y of the top face
  // Per-vertex tint (fake AO). Starts white so it leaves the dry surface sand
  // untouched; deform() darkens vertices as they sink so a deep dig reads as a
  // shadowed, damp, compacted hollow. Multiplies the base 0xd9c89b sand colour.
  const colAttr = new THREE.BufferAttribute(
    new Float32Array(posAttr.count * 3).fill(1),
    3,
  );
  sandGeo.setAttribute("color", colAttr);
  // Indices of the top-face vertices and their precomputed WORLD x/z (the box is
  // axis-aligned and only translated, so world = local + mesh position).
  const topVerts = [];
  const topWorldX = [];
  const topWorldZ = [];
  for (let i = 0; i < posAttr.count; i++) {
    if (posAttr.getY(i) > topY - 1e-4) {
      topVerts.push(i);
      topWorldX.push(posAttr.getX(i) + sand.position.x);
      topWorldZ.push(posAttr.getZ(i) + sand.position.z);
    }
  }

  // --- Crater shaping --------------------------------------------------------
  // A real landing is chaotic, not a clean bowl: the heels gouge two deep
  // forward-dragging furrows, then the body churns a trail. Each dig uses an
  // ASYMMETRIC footprint (long reach forward in +x, short bite behind) whose
  // edge is broken up by value noise so no two craters share a silhouette, and
  // piles the displaced sand into an equally ragged rim just outside.
  const CRATER_DEPTH = 0.033; // m — depth of a full-strength dig
  // Clamp so the deepest vertex (SAND_TOP - MAX_DISP = 0.030) stays clearly above
  // the dark geometry beneath the sand — the kerb top (y = 0.02) and apron slab
  // (y = 0.015) — otherwise they show through the hole as "asphalt".
  const MAX_DISP = 0.03; // m
  const RIM_HEIGHT = 0.016; // m — mound piled just outside the dig
  const MAX_RIM = 0.026; // m — clamp on accumulated rim height (no spiky build-up)
  const RIM_END = 2.4; // nd where the rim fades back to flat

  const BASE_RX = 0.9; // m — footprint half-length along travel (+x)
  const BASE_RZ = 0.42; // m — footprint half-width across
  const EDGE_WOBBLE = 0.38; // how raggedly the dig edge departs from the ellipse
  const HEEL_HALF = 0.16; // m — half the gap between the two heel furrows
  const AO_DARK = 0.6; // how much the deepest sand is darkened (fake AO / damp sand)

  // Carve ONE noise-broken, forward-dragged gouge centred at (ix,iz). rxF/rxB are
  // the forward/back reach (asymmetry = the slide), rz the half-width; `seed`
  // decorrelates overlapping gouges so paired heels don't mirror each other.
  function gouge(ix, iz, strength, rxF, rxB, rz, seed) {
    for (let k = 0; k < topVerts.length; k++) {
      const wx = topWorldX[k];
      const wz = topWorldZ[k];
      const dx = wx - ix;
      const dz = wz - iz;
      const rx = dx >= 0 ? rxF : rxB; // long drag forward, short bite behind
      const nd = (dx * dx) / (rx * rx) + (dz * dz) / (rz * rz);
      if (nd >= RIM_END) continue;
      const nLo = valueNoise(wx * 3.0 + seed, wz * 3.0 - seed); // ragged edge
      const nHi = valueNoise(wx * 13.0 + seed, wz * 13.0 + seed); // floor grain
      const edge = 1 + EDGE_WOBBLE * (nLo - 0.5) * 2; // wobble the rim radius
      const i = topVerts[k];
      const cur = posAttr.getY(i);
      if (nd < edge) {
        // Dig: pointed falloff toward the centre, churned by the fine grain.
        const f = 1 - nd / edge;
        const rough = 0.7 + 0.6 * nHi;
        const newY = cur - CRATER_DEPTH * strength * Math.pow(f, 1.4) * rough;
        posAttr.setY(i, Math.max(topY - MAX_DISP, newY));
      } else {
        // Rim: pile displaced sand just outside the wobbled edge.
        const t = (nd - edge) / (RIM_END - edge);
        const bump = Math.sin(Math.PI * t) * (0.55 + 0.9 * nHi);
        const newY = cur + RIM_HEIGHT * strength * bump;
        posAttr.setY(i, Math.min(topY + MAX_RIM, newY));
      }
    }
  }

  function deform(ix, iz, strength, heels = false) {
    if (heels) {
      // Touchdown: two parallel heel furrows, slightly desynced in x and strength
      // so they read as a real two-foot landing, not a mirrored stamp.
      gouge(ix - 0.04, iz - HEEL_HALF, strength, BASE_RX, BASE_RX * 0.4, BASE_RZ * 0.7, 11.3);
      gouge(ix + 0.05, iz + HEEL_HALF, strength * 0.92, BASE_RX * 1.1, BASE_RX * 0.4, BASE_RZ * 0.7, 41.9);
    } else {
      // Slide: one wider churn stamp; chained every 12 cm it carves the trail.
      gouge(ix, iz, strength, BASE_RX, BASE_RX * 0.55, BASE_RZ * 1.25, 5.7);
    }
    // Fake AO: re-tint every top vertex from its FINAL sink depth, so the colour
    // always matches the current surface (regardless of overlapping gouges).
    // Surface-level sand stays bright; the deeper it sinks toward MAX_DISP the
    // darker it gets — a shadowed, damp, compacted hollow the eye reads instantly.
    for (let k = 0; k < topVerts.length; k++) {
      const i = topVerts[k];
      const t = Math.min(1, Math.max(0, (topY - posAttr.getY(i)) / MAX_DISP));
      const shade = 1 - AO_DARK * t;
      colAttr.setXYZ(i, shade, shade, shade);
    }
    colAttr.needsUpdate = true;
    posAttr.needsUpdate = true;
    sandGeo.computeVertexNormals(); // shadows/highlights follow the new surface
  }

  // --- Splash particles (single InstancedMesh, one draw call) ----------------
  const POOL = 9000;
  const SPLASH_G = 20; // m/s² — heavy sand: pulled down fast, settles quickly
  // Aggressive air drag on the HORIZONTAL motion only, so the spray decelerates
  // and drops near the impact (heavy matter) instead of floating away. Drag is
  // NOT applied to Y — gravity owns the vertical arc.
  const SPLASH_DRAG = 3.0;
  const grainGeo = new THREE.TetrahedronGeometry(0.018);
  const grainMat = new THREE.MeshStandardMaterial({
    color: 0xcdb988,
    roughness: 1.0,
  });
  const grains = new THREE.InstancedMesh(grainGeo, grainMat, POOL);
  grains.frustumCulled = false; // matrices move every frame; skip stale culling
  grains.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(grains);
  disposables.push(grainGeo, grainMat, grains);

  const dummy = new THREE.Object3D();
  const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
  // Per-grain physics state.
  const particles = Array.from({ length: POOL }, () => ({
    active: false,
    dust: false,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    spin: new THREE.Vector3(),
    rot: new THREE.Euler(),
    life: 0,
    maxLife: 0,
    scale: 1, // per-grain base size, for a dusty mix of grain sizes
  }));
  for (let i = 0; i < POOL; i++) grains.setMatrixAt(i, HIDDEN);
  grains.instanceMatrix.needsUpdate = true;

  const sandTopY = sandY + topY; // world height the grains rest/spawn at

  // function splash(ix, iz, strength) {
  //   // Volumetric, turbulent sand blast: a dense cloud of INDIVIDUAL grains, each
  //   // launched with strong independent variance on every axis, so they never move
  //   // as a coherent slab. Dense near the impact, thinning as the cloud expands.
  //   const count = Math.round(450 * strength * strength) + 200;
  //   let spawned = 0;
  //   for (let i = 0; i < POOL && spawned < count; i++) {
  //     const p = particles[i];
  //     if (p.active) continue;
  //     p.active = true;
  //     p.life = 0;
  //     p.maxLife = 0.5 + Math.random() * 0.9; // wide range -> grains die out of sync

  //     // TIGHT spawn right at the impact -> an extremely dense core. The physics
  //     // (forward velocity + drag) do the spreading, not a scattered start.
  //     p.pos.set(
  //       ix + (Math.random() - 0.5) * 0.2,
  //       sandTopY + 0.02 + Math.random() * 0.06,
  //       iz + (Math.random() - 0.5) * 0.25,
  //     );

  //     // Heavy, DIRECTIONAL blast: the athlete is moving fast along +X, so the
  //     // body shove throws the sand predominantly FORWARD, fanning out to ±Z in a
  //     // V (lateral grows with forward speed). Speed is skewed low (rand*rand) ->
  //     // a dense slow core with only a few fast grains reaching the edge; a small
  //     // fraction is flung backward for chaos. Upward speed is kept LOW so, under
  //     // the heavier gravity, the sand never rises past the athlete's waist.
  //     const speed = Math.random() * Math.random() * (3.5 + 3.0 * strength);
  //     const fan = (Math.random() - 0.5) * 1.3; // ±Z proportional to speed -> V
  //     const dirX = Math.random() < 0.15 ? -1 : 1; // ~15% backward fling
  //     p.vel.set(
  //       (0.8 * strength + speed) * dirX, // strong forward (+X) momentum
  //       (1.0 + Math.random() * 2.8) * strength, // LOW upward kick (waist-high max)
  //       speed * fan, // lateral fan proportional to forward drive -> a forward V
  //     );

  //     p.scale = 0.45 + Math.random() * 0.9; // varied grain sizes -> dusty
  //     p.rot.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
  //     p.spin.set(
  //       (Math.random() - 0.5) * 16,
  //       (Math.random() - 0.5) * 16,
  //       (Math.random() - 0.5) * 16,
  //     );
  //     spawned++;
  //   }
  // }
  function splash(ix, iz, strength) {
    // Two-population blast. CORE = heavy grains, the visible body of the fan,
    // fall back fast. DUST = tiny floaty grains, high drag + low gravity, hang
    // in the air as soft mist — that mist is what reads as "natural".
    const s = strength;
    const count = Math.round(1400 * s * s) + 500; // way denser than before
    let spawned = 0;
    for (let i = 0; i < POOL && spawned < count; i++) {
      const p = particles[i];
      if (p.active) continue;
      p.active = true;
      p.life = 0;
      p.dust = Math.random() < 0.38; // ~38% become hanging mist

      // Spawn along a SHEET that rises up the back of the impact, not one dot.
      // The body lifts a curtain of sand; seed it tall, let velocity fan it out.
      const up = Math.random(); // 0 = at sand, 1 = top of the lifted sheet
      p.pos.set(
        ix + (Math.random() - 0.5) * 0.30,
        sandTopY + 0.02 + up * 0.55,        // seeded up to ~0.55 m tall
        iz + (Math.random() - 0.5) * 0.45,
      );

      // Forward + STRONG up so the curtain climbs into a fan. Speed skewed low
      // (rand*rand) -> dense slow core, few fast grains reaching the rim.
      const speed = Math.random() * Math.random() * (3.5 + 3.0 * s);
      const fan = (Math.random() - 0.5) * 1.4;
      const dirX = Math.random() < 0.12 ? -1 : 1; // ~12% backward fling

      if (p.dust) {
        p.maxLife = 1.4 + Math.random() * 1.4;    // hangs long
        p.vel.set(
          (0.4 * s + speed * 0.5) * dirX,
          (2.4 + Math.random() * 3.4) * s + up * 2.0, // floats high
          speed * fan * 0.7,
        );
        p.scale = 0.30 + Math.random() * 0.5;     // tiny specks
      } else {
        p.maxLife = 0.45 + Math.random() * 0.7;
        p.vel.set(
          (0.8 * s + speed) * dirX,
          (2.8 + Math.random() * 3.6) * s + up * 1.5, // tall fan, not waist-high
          speed * fan,
        );
        p.scale = 0.55 + Math.random() * 1.0;
      }

      p.rot.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      p.spin.set(
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16,
        (Math.random() - 0.5) * 16,
      );
      spawned++;
    }
  }

  function update(dt) {
    if (dt <= 0) return;
    let dirty = false;
    for (let i = 0; i < POOL; i++) {
      const p = particles[i];
      if (!p.active) continue;
      dirty = true;
      p.life += dt;
      const g = p.dust ? SPLASH_G * 0.22 : SPLASH_G;        // mist barely falls
      const dragC = p.dust ? SPLASH_DRAG * 2.2 : SPLASH_DRAG;
      const drag = Math.exp(-dragC * dt);
      p.vel.x *= drag;
      p.vel.z *= drag;
      if (p.dust) p.vel.y *= Math.exp(-dragC * 0.5 * dt); // air slows the rise too
      p.vel.y -= g * dt;
      p.pos.addScaledVector(p.vel, dt);

      // Settle when a falling grain reaches the sand surface, or when it ages out.
      if ((p.pos.y <= sandTopY && p.vel.y < 0) || p.life >= p.maxLife) {
        p.active = false;
        grains.setMatrixAt(i, HIDDEN);
        continue;
      }
      p.rot.x += p.spin.x * dt;
      p.rot.y += p.spin.y * dt;
      p.rot.z += p.spin.z * dt;
      // Shrink over the last third of life so grains fade out instead of popping,
      // scaled by the grain's own base size for a dusty mix.
      const s =
        THREE.MathUtils.clamp(1 - (p.life / p.maxLife - 0.66) / 0.34, 0.2, 1) *
        p.scale;
      dummy.position.copy(p.pos);
      dummy.rotation.copy(p.rot);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      grains.setMatrixAt(i, dummy.matrix);
    }
    if (dirty) grains.instanceMatrix.needsUpdate = true;
  }

  // splashScale lets a caller carve the sand at full strength while throwing only
  // a small puff of grains (e.g. the heel strike) or vice-versa.
  function impact(x, z, strength = 1, { heels = false, splashScale = 1 } = {}) {
    const s = THREE.MathUtils.clamp(strength, 0.4, 1.6);
    deform(x, z, s, heels);
    if (splashScale > 0) splash(x, z, s * splashScale);
  }

  function reset() {
    posAttr.array.set(basePos); // flatten every crater
    posAttr.needsUpdate = true;
    colAttr.array.fill(1); // clear the AO tint back to dry surface sand
    colAttr.needsUpdate = true;
    sandGeo.computeVertexNormals();
    for (let i = 0; i < POOL; i++) {
      particles[i].active = false;
      grains.setMatrixAt(i, HIDDEN);
    }
    grains.instanceMatrix.needsUpdate = true;
    markBar.visible = false; // clear the green result line
  }

  return {
    group,
    sand: { impact, update, reset, setMark },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
