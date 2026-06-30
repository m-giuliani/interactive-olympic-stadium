import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/**
 * The medal podium — the long-jump awards finale (CLAUDE.md §8 polish). Built
 * entirely from primitives following the ResultsMonitor pattern: a `this.group`
 * of meshes, a `_disposables[]` array, `_mat()`/`_rbox()` helpers and a
 * `dispose()` (CLAUDE.md §6 — own and free every geo/material/texture).
 *
 * Look: one long, low, dark navy/slate mass of three rectangular blocks sitting
 * directly on the track. The CENTRE block (gold) is the tallest; the two wings
 * (silver / bronze) are EQUAL height and lower. The vertical faces are clad in a
 * crystalline "low-poly" faceted relief from a procedurally-generated tangent
 * normal map (CLAUDE.md §5 — no image assets); the tops are smooth, slightly
 * lighter matte-navy slabs with a tiny overhang lip. The tall centre block carries
 * a recessed panel with the five interlocking Olympic rings (metallic gold).
 *
 * Olympic layout (the medalists FACE the podium's local +Z, toward the main
 * grandstand): index 0 = GOLD (centre, x=0); 1 = SILVER (winner's right → world
 * −X → camera-left); 2 = BRONZE (winner's left → world +X → camera-right).
 */

// Proportions (metres).
const GOLD_H = 0.5; // centre block height (≤ ~0.5 so one step-up stride reads naturally)
const WING_H = 0.3; // both wings, equal and lower
const BLOCK_D = 1.4; // depth — deep enough to stand on comfortably
const CENTER_W = 1.3; // centre block width
const WING_W = 1.6; // wings wider so the silhouette reads long and low
const SPACING = CENTER_W / 2 + WING_W / 2; // 1.45 — blocks abut into one mass
const CAP_H = 0.05; // smooth top-slab thickness
const BASE_H = 0.04; // subtle dark base lip grounding the mass on the track
const RADIUS = 0.02; // tiny corner bevel
const APPROACH_GAP = 0.5; // ground stand-off in front of a block before the climb
const FRONT_EDGE_INSET = 0.18; // how far back from the front edge the first stride lands

export class Podium {
  /**
   * @param {{ position?: THREE.Vector3, faceYaw?: number }} [opts]
   *   position — world placement of the podium centre.
   *   faceYaw  — Y rotation of the rig; the front (local +Z, where the rings and
   *              the medalists' faces point) ends up aimed along
   *              (sin faceYaw, 0, cos faceYaw). Default 0 = front faces +Z.
   */
  constructor({ position = new THREE.Vector3(), faceYaw = 0 } = {}) {
    this.group = new THREE.Group();
    this.group.name = "Podium";
    this.faceYaw = faceYaw;
    this._disposables = [];

    this.group.position.copy(position);
    this.group.rotation.y = faceYaw;

    this._build();

    // World spots, derived through the group's world matrix so they stay correct
    // for any position/faceYaw. The two-stride climb (see longJump.js):
    //   approachSpots = ground, in FRONT of the block (walk-up target).
    //   riserSpots    = TOP of the block at its FRONT EDGE (stride 1 lands here,
    //                   climbing the full block height).
    //   standSpots    = TOP of the block, CENTRED (stride 2 steps flat to centre
    //                   while pivoting to face the crowd; the feet end up here).
    this.group.updateMatrixWorld(true);
    const heights = [GOLD_H, WING_H, WING_H];
    const xs = [0, -SPACING, SPACING];
    const local = (x, y, z) => this.group.localToWorld(new THREE.Vector3(x, y, z));
    this.standSpots = xs.map((x, i) => local(x, heights[i], 0));
    this.riserSpots = xs.map((x, i) => local(x, heights[i], BLOCK_D / 2 - FRONT_EDGE_INSET));
    this.approachSpots = xs.map((x) => local(x, 0, BLOCK_D / 2 + APPROACH_GAP));

    // Bare Object3D the camera frames. The director reads `.position` directly
    // (world == local here, since it has no parent).
    this.centerObject = new THREE.Object3D();
    this.centerObject.position.copy(local(0, 0.9, 0));
  }

  _mat(color, opts = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...opts });
    this._disposables.push(m);
    return m;
  }

  _rbox(w, h, d, material, x, y, z) {
    const geo = new RoundedBoxGeometry(w, h, d, 3, RADIUS);
    this._disposables.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  _build() {
    // Crystalline cladding: a tiling tangent-space normal map on the faceted base
    // navy, smooth slightly-lighter navy for the tops / wing upper band, and a
    // dark base lip.
    const facetTex = this._facetNormalMap();
    facetTex.repeat.set(3, 2);
    const facetMat = this._mat(0x39414f, {
      roughness: 0.55,
      metalness: 0.2,
      normalMap: facetTex,
      normalScale: new THREE.Vector2(0.9, 0.9),
    });
    const smooth = this._mat(0x4a5364, { roughness: 0.5, metalness: 0.2 });
    const baseMat = this._mat(0x202833, { roughness: 0.6, metalness: 0.15 });

    const heights = [GOLD_H, WING_H, WING_H];
    const widths = [CENTER_W, WING_W, WING_W];
    const xs = [0, -SPACING, SPACING];

    // Subtle dark base lip under the whole mass (a little wider than the blocks).
    const totalW = 2 * (SPACING + WING_W / 2);
    this._rbox(totalW + 0.12, BASE_H, BLOCK_D + 0.12, baseMat, 0, BASE_H / 2, 0);

    for (let i = 0; i < 3; i++) {
      const H = heights[i];
      const W = widths[i];
      const x = xs[i];
      const bodyH = H - CAP_H;

      // Faceted crystalline body.
      this._rbox(W, bodyH, BLOCK_D, facetMat, x, bodyH / 2, 0);
      // Smooth top slab with a tiny overhang lip.
      this._rbox(W + 0.05, CAP_H, BLOCK_D + 0.05, smooth, x, bodyH + CAP_H / 2, 0);

      if (i === 0) {
        // Centre: recessed panel + interlocking Olympic rings.
        this._buildRings(x, bodyH);
      } else {
        // Wings: the top ~25% of the front is a smooth flat-navy band.
        const bandH = bodyH * 0.25;
        this._rbox(W, bandH, 0.02, smooth, x, bodyH - bandH / 2, BLOCK_D / 2 + 0.004);
      }
    }
  }

  /** Recessed lighter panel + five gold Olympic rings on the centre block front. */
  _buildRings(x, bodyH) {
    const panelMat = this._mat(0x424b5c, { roughness: 0.5, metalness: 0.25 });
    const gold = this._mat(0xd9c27a, {
      metalness: 0.9,
      roughness: 0.3,
      emissive: 0xd9c27a,
      emissiveIntensity: 0.15,
    });

    const panelY = bodyH * 0.6;
    const panelZ = BLOCK_D / 2;
    this._rbox(0.74, 0.32, 0.03, panelMat, x, panelY, panelZ + 0.004);

    // Classic 3-over-2 layout, rings overlapping slightly so they read interlocked.
    const r = 0.085;
    const layout = [
      [-0.17, 0.045],
      [0, 0.045],
      [0.17, 0.045],
      [-0.085, -0.045],
      [0.085, -0.045],
    ];
    for (const [dx, dy] of layout) {
      const geo = new THREE.TorusGeometry(r, 0.012, 10, 28);
      this._disposables.push(geo);
      const ring = new THREE.Mesh(geo, gold);
      ring.position.set(x + dx, panelY + dy, panelZ + 0.03);
      ring.castShadow = true;
      this.group.add(ring);
    }
  }

  /**
   * A tiling crystalline NORMAL map (CLAUDE.md §5 — procedural, no assets): a
   * jittered grid is split into triangles, each filled with a flat random
   * tangent-space normal (rgb = nx,ny,nz packed to 0..1), with a faint darker seam
   * between facets. Boundary grid points are pinned to the canvas edge so the
   * pattern tiles when repeated. Used as a `normalMap` so each facet catches the
   * floodlights differently and the navy mass reads as cut crystal.
   * @returns {THREE.CanvasTexture}
   */
  _facetNormalMap() {
    const S = 512;
    const N = 12;
    const cell = S / N;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "rgb(128,128,255)"; // flat normal base
    ctx.fillRect(0, 0, S, S);

    // Jittered grid of points (edges pinned so the texture tiles cleanly).
    const pts = [];
    for (let i = 0; i <= N; i++) {
      pts[i] = [];
      for (let j = 0; j <= N; j++) {
        const edge = i === 0 || i === N || j === 0 || j === N;
        const jx = edge ? 0 : (Math.random() - 0.5) * cell * 0.85;
        const jy = edge ? 0 : (Math.random() - 0.5) * cell * 0.85;
        pts[i][j] = [i * cell + jx, j * cell + jy];
      }
    }

    const facet = (a, b, c) => {
      const nx = (Math.random() - 0.5) * 0.8; // small in-plane tilt ~[-0.4,0.4]
      const ny = (Math.random() - 0.5) * 0.8;
      const nz = Math.sqrt(Math.max(0.0001, 1 - nx * nx - ny * ny));
      ctx.fillStyle = `rgb(${Math.round((nx * 0.5 + 0.5) * 255)},${Math.round(
        (ny * 0.5 + 0.5) * 255,
      )},${Math.round(nz * 255)})`;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(70,70,150,0.5)"; // faint crease seam
      ctx.lineWidth = 1;
      ctx.stroke();
    };

    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const p00 = pts[i][j];
        const p10 = pts[i + 1][j];
        const p11 = pts[i + 1][j + 1];
        const p01 = pts[i][j + 1];
        facet(p00, p10, p11);
        facet(p00, p11, p01);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    // Normal maps are linear data — leave the default (no sRGB).
    this._disposables.push(tex);
    return tex;
  }

  dispose() {
    this._disposables.forEach((d) => d.dispose());
  }
}

/**
 * Build a single medal on a ribbon, to be parented to a medalist's `joints.torso`
 * (at ≈ x:+0.13 front, y:+0.33 chest) so it hangs on the chest and rides the rig
 * — the same prop-parenting pattern as the coach's cap (CLAUDE.md §2/§7). The
 * caller owns teardown: dispose everything in the returned `disposables`.
 *
 * @param {number} place 0 = gold, 1 = silver, 2 = bronze.
 * @returns {{ group: THREE.Group, disposables: Array<{dispose:Function}> }}
 */
export function createMedal(place = 0) {
  const group = new THREE.Group();
  group.name = "Medal";
  const disposables = [];

  const discColors = [0xffd54a, 0xcfd8dc, 0xcd7f32];
  const color = discColors[THREE.MathUtils.clamp(place, 0, 2)];

  // Ribbon: two thin strands forming a V from the shoulders down to the disc on
  // the chest. The group's origin sits at the chest; the shoulders are up-and-out
  // (and a touch back) from there in the torso's local frame.
  const ribbonMat = new THREE.MeshStandardMaterial({
    color: 0x16386b,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  disposables.push(ribbonMat);

  const chest = new THREE.Vector3(0, 0, 0);
  const shoulders = [
    new THREE.Vector3(-0.11, 0.11, 0.18),
    new THREE.Vector3(-0.11, 0.11, -0.18),
  ];
  for (const sh of shoulders) {
    const dir = new THREE.Vector3().subVectors(sh, chest);
    const len = dir.length();
    const geo = new THREE.BoxGeometry(0.018, len, 0.005);
    disposables.push(geo);
    const strand = new THREE.Mesh(geo, ribbonMat);
    strand.position.copy(chest).addScaledVector(dir, 0.5);
    strand.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      dir.clone().normalize(),
    );
    strand.castShadow = true;
    group.add(strand);
  }

  // Metallic disc — axis rotated to lie along X so its flat face points forward
  // (+X in the torso frame → toward the crowd once the medalist faces them).
  const discGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.014, 24);
  disposables.push(discGeo);
  const discMat = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.9,
    roughness: 0.3,
    emissive: color,
    emissiveIntensity: 0.12,
  });
  disposables.push(discMat);
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.rotation.z = Math.PI / 2;
  disc.position.set(0.01, -0.04, 0);
  disc.castShadow = true;
  group.add(disc);

  return { group, disposables };
}
