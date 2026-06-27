import * as THREE from "three";

import { makeGrainNormalMap } from "../utils/textures.js";
import {
  LJ_Z,
  LJ_RUNWAY_START_X,
  LJ_BOARD_X,
  LJ_PIT_START_X,
  LJ_PIT_END_X,
  LJ_RUNWAY_WIDTH,
  LJ_PIT_WIDTH,
} from "./config.js";

/**
 * The long jump facility: a brick-red run-up runway, a white takeoff board, and
 * a RESPONSIVE sand landing pit. The sand reuses the procedural grain normal map
 * (CLAUDE.md §5) so it reads as a rough granular surface under the floodlights.
 *
 * Two effects make the landing physically convincing and explicitly demonstrate
 * the course topics "Surfaces and 3D modelling" and "Physics-based animation":
 *
 *   1. CRATER — the sand is a finely tessellated BoxGeometry. On impact the
 *      top-face vertices around the landing (x,z) are pushed DOWN with a smooth
 *      radial falloff and the vertex normals are recomputed, so the real-time
 *      shadows and floodlight highlights wrap correctly around the fresh hole.
 *      Craters accumulate across the eight jumps, churning the pit, and reset()
 *      flattens it back for a new competition.
 *
 *   2. SPLASH — a pool of sand grains rendered with a single InstancedMesh (one
 *      draw call). On impact a burst is launched outward/upward and integrated
 *      under gravity (hand-written projectile physics) until it falls back to the
 *      surface. The event hooks update(dt) into the main animation loop.
 *
 * Geometry only — the LongJumpEvent drives the athlete over it and triggers the
 * effects through the returned `sand` API.
 *
 * @returns {{ group: THREE.Group,
 *             sand: { impact: (x:number, z:number, strength?:number) => void,
 *                     update: (dt:number) => void,
 *                     reset: () => void },
 *             dispose: () => void }}
 */
export function createLongJumpPit() {
  const group = new THREE.Group();
  group.name = "LongJump";
  const disposables = [];

  // --- Runway ----------------------------------------------------------------
  const runwayLen = LJ_BOARD_X - LJ_RUNWAY_START_X;
  const runwayGeo = new THREE.BoxGeometry(runwayLen, 0.04, LJ_RUNWAY_WIDTH);
  const runwayMat = new THREE.MeshStandardMaterial({
    color: 0xa8402b,
    roughness: 0.85,
  });
  const runway = new THREE.Mesh(runwayGeo, runwayMat);
  runway.position.set(LJ_RUNWAY_START_X + runwayLen / 2, 0.02, LJ_Z);
  runway.receiveShadow = true;
  group.add(runway);
  disposables.push(runwayGeo, runwayMat);

  // --- Takeoff board ---------------------------------------------------------
  // A thin white take-off line (linea di salto) set slightly BEFORE the end of
  // the red runway, so a sliver of runway still shows past it before the sand —
  // exactly like a real board, where you jump from the front edge of the line.
  const boardGeo = new THREE.BoxGeometry(0.12, 0.06, LJ_RUNWAY_WIDTH);
  const boardMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, // white — a clear visual take-off target
    roughness: 0.6,
  });
  const board = new THREE.Mesh(boardGeo, boardMat);
  board.position.set(LJ_BOARD_X - 0.18, 0.04, LJ_Z);
  board.receiveShadow = true;
  group.add(board);
  disposables.push(boardGeo, boardMat);

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
  });
  const sand = new THREE.Mesh(sandGeo, sandMat);
  const sandY = 0.045 - SAND_H / 2;  
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
  kerb.position.set(pitCx, 0.0, LJ_Z);
  kerb.receiveShadow = true;
  group.add(kerb);
  disposables.push(kerbGeo, kerbMat);

  // ===========================================================================
  // Responsive-sand controller: vertex crater + InstancedMesh splash.
  // ===========================================================================

  // --- Crater state ----------------------------------------------------------
  const posAttr = sandGeo.attributes.position;
  const basePos = new Float32Array(posAttr.array); // pristine copy for reset()
  const topY = SAND_H / 2; // local y of the top face
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

  const CRATER_RADIUS = 0.62; // m — footprint/seat impression radius
  const CRATER_DEPTH = 0.045; // m — depth added by a full-strength impact
  const MAX_DISP = 0.05; // m — clamp so a vertex never punches the box bottom

  const RX = CRATER_RADIUS * 1.9;  // long axis = direction of travel
  const RZ = CRATER_RADIUS * 0.9;  // narrower across


  function deform(ix, iz, strength) {
    
    for (let k = 0; k < topVerts.length; k++) {
      const dx = topWorldX[k] - ix;
      const dz = topWorldZ[k] - iz;
      const nd = (dx*dx)/(RX*RX) + (dz*dz)/(RZ*RZ);
      if (nd >= 1) continue;
    // rough up the rim so it's not a clean math curve
    const jitter = 0.85 + 0.15 * Math.sin(topWorldX[k]*40 + topWorldZ[k]*37);
    const f = (1 - nd) * jitter;
    const i = topVerts[k];
    const newY = posAttr.getY(i) - CRATER_DEPTH * strength * f * f;
    posAttr.setY(i, Math.max(topY - MAX_DISP, newY));
    }
    posAttr.needsUpdate = true;
    sandGeo.computeVertexNormals(); // shadows/highlights follow the new surface
  }

  // --- Splash particles (single InstancedMesh, one draw call) ----------------
  const POOL = 160;
  const SPLASH_G = 9.81; // gravity for the grains (m/s²)
  const grainGeo = new THREE.TetrahedronGeometry(0.045);
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
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    spin: new THREE.Vector3(),
    rot: new THREE.Euler(),
    life: 0,
    maxLife: 0,
  }));
  for (let i = 0; i < POOL; i++) grains.setMatrixAt(i, HIDDEN);
  grains.instanceMatrix.needsUpdate = true;

  const sandTopY = sandY + topY; // world height the grains rest/spawn at

  function splash(ix, iz, strength) {
    const count = Math.round(28 * strength) + 12;
    let spawned = 0;
    for (let i = 0; i < POOL && spawned < count; i++) {
      const p = particles[i];
      if (p.active) continue;
      p.active = true;
      p.life = 0;
      p.maxLife = 0.6 + Math.random() * 0.5;
      p.pos.set(
        ix + (Math.random() - 0.5) * 0.25,
        sandTopY + 0.02,
        iz + (Math.random() - 0.5) * 0.25,
      );
      // Outward fan, biased forward (+x, the direction of travel), with a strong
      // upward kick so the burst arcs and falls back under gravity.
      const ang = Math.random() * Math.PI * 2;
      const horiz = (0.8 + Math.random() * 2.0) * strength;
      p.vel.set(
        Math.cos(ang) * horiz + 1.2 * strength,
        (2.2 + Math.random() * 2.4) * strength,
        Math.sin(ang) * horiz,
      );
      p.rot.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
      p.spin.set(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
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
      p.vel.y -= SPLASH_G * dt;
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
      // Shrink over the last third of life so grains fade out instead of popping.
      const s = THREE.MathUtils.clamp(1 - (p.life / p.maxLife - 0.66) / 0.34, 0.2, 1);
      dummy.position.copy(p.pos);
      dummy.rotation.copy(p.rot);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      grains.setMatrixAt(i, dummy.matrix);
    }
    if (dirty) grains.instanceMatrix.needsUpdate = true;
  }

  function impact(x, z, strength = 1) {
    const s = THREE.MathUtils.clamp(strength, 0.4, 1.6);
    deform(x, z, s);
    splash(x, z, s);
  }

  function reset() {
    posAttr.array.set(basePos); // flatten every crater
    posAttr.needsUpdate = true;
    sandGeo.computeVertexNormals();
    for (let i = 0; i < POOL; i++) {
      particles[i].active = false;
      grains.setMatrixAt(i, HIDDEN);
    }
    grains.instanceMatrix.needsUpdate = true;
  }

  return {
    group,
    sand: { impact, update, reset },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
