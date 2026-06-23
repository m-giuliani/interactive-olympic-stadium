import * as THREE from "three";

/**
 * Procedural canvas textures for the stadium surfaces.
 *
 * Everything here is generated at runtime on a <canvas> so the project ships
 * with zero binary assets and still demonstrates several *kinds* of texture
 * maps (CLAUDE.md §5): colour maps for the pitch / track / seats and a
 * generated NORMAL map for the track grain (the required non-diffuse map).
 */

const ANISOTROPY = 8;

function makeCanvas(w, h) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function asColorTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = ANISOTROPY;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Football pitch: mowing stripes + standard white line markings.
 * Mapped 1:1 onto the 105 × 68 m pitch plane.
 * @returns {THREE.CanvasTexture}
 */
export function makePitchTexture() {
  const w = 1050;
  const h = 680;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d");

  // Mowing stripes (alternating shades of green along the length).
  const stripes = 14;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#2f7d34" : "#2a7030";
    ctx.fillRect((i * w) / stripes, 0, w / stripes + 1, h);
  }

  // White markings.
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 3;

  const m = 22; // outer margin
  ctx.strokeRect(m, m, w - 2 * m, h - 2 * m); // touchlines + goal lines

  // Halfway line + centre circle + centre spot.
  ctx.beginPath();
  ctx.moveTo(w / 2, m);
  ctx.lineTo(w / 2, h - m);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 91, 0, Math.PI * 2); // 9.15 m radius
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 5, 0, Math.PI * 2);
  ctx.fill();

  // Penalty + goal areas on both ends.
  const penH = 403; // 40.3 m
  const penD = 165; // 16.5 m
  const goalH = 183; // 18.3 m
  const goalD = 55; // 5.5 m
  const drawEnd = (x0, dir) => {
    ctx.strokeRect(x0, (h - penH) / 2, dir * penD, penH); // penalty area
    ctx.strokeRect(x0, (h - goalH) / 2, dir * goalD, goalH); // goal area
    // Penalty spot (11 m from goal line).
    ctx.beginPath();
    ctx.arc(x0 + dir * 110, h / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  };
  drawEnd(m, 1);
  drawEnd(w - m, -1);

  return asColorTexture(canvas);
}

/**
 * Running track colour map: classic brick-red surface with white lane lines.
 *
 * The lane lines run across the texture's V axis, which maps across the width
 * of the track (inner → outer edge), so they appear as the 8 lane dividers.
 * @returns {THREE.CanvasTexture}
 */
export function makeTrackTexture(laneCount = 8) {
  const w = 32; // along the track length (constant pattern)
  const lanePx = 64;
  const h = lanePx * laneCount;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#a8402b"; // Mondo-style brick red
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "#f2f2f2";
  ctx.lineWidth = 4;
  for (let i = 0; i <= laneCount; i++) {
    const y = i * lanePx;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  return asColorTexture(canvas);
}

/**
 * A subtle NORMAL map for the track surface so it catches the floodlights as a
 * fine rubbery grain instead of reading as flat plastic. This is the required
 * non-diffuse map (CLAUDE.md §5). Tile it heavily via `.repeat`.
 * @returns {THREE.CanvasTexture}
 */
export function makeGrainNormalMap() {
  const size = 256;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(size, size);

  for (let i = 0; i < size * size; i++) {
    // Random small tangent-space perturbation around the flat normal (0,0,1).
    const nx = (Math.random() - 0.5) * 0.5;
    const ny = (Math.random() - 0.5) * 0.5;
    const o = i * 4;
    img.data[o + 0] = 128 + nx * 127; // R → X
    img.data[o + 1] = 128 + ny * 127; // G → Y
    img.data[o + 2] = 255; // B → Z (mostly pointing up)
    img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = ANISOTROPY;
  // Normal maps are linear data, not colour — leave the default (no sRGB).
  return tex;
}

/**
 * Seating texture: rows of small coloured seats over a dark structure, tiled
 * around the bowl. u tiles around the perimeter, v up the rake.
 * @returns {THREE.CanvasTexture}
 */
export function makeSeatTexture() {
  const size = 256;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#191c22";
  ctx.fillRect(0, 0, size, size);

  const palette = ["#1f4e8c", "#2a64b0", "#d9dde6", "#1f4e8c"];
  const rows = 8;
  const cols = 8;
  const rh = size / rows;
  const cw = size / cols;

  for (let r = 0; r < rows; r++) {
    // Row step shadow (riser).
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(0, r * rh, size, 3);
    for (let c = 0; c < cols; c++) {
      // Pseudo-random but deterministic seat colour from the grid position.
      const idx = (r * 7 + c * 3) % palette.length;
      ctx.fillStyle = palette[idx];
      ctx.fillRect(c * cw + 3, r * rh + 5, cw - 6, rh - 9);
    }
  }

  return asColorTexture(canvas);
}

/** Filled regular pentagon centred at (cx, cy). */
function pentagon(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Classic black-pentagons-on-white football texture.
 * @returns {THREE.CanvasTexture}
 */
export function makeFootballTexture() {
  const s = 256;
  const canvas = makeCanvas(s, s);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(0, 0, s, s);

  ctx.fillStyle = "#161616";
  const spots = [
    [0.5, 0.22],
    [0.18, 0.45],
    [0.82, 0.45],
    [0.34, 0.72],
    [0.66, 0.72],
    [0.5, 0.96],
    [0.08, 0.12],
    [0.92, 0.15],
  ];
  for (const [u, v] of spots) pentagon(ctx, u * s, v * s, s * 0.075);

  return asColorTexture(canvas);
}

/**
 * Semi-transparent goal-net texture (white grid on transparent).
 * @returns {THREE.CanvasTexture}
 */
export function makeNetTexture() {
  const s = 128;
  const canvas = makeCanvas(s, s);
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, s, s); // transparent background
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 1.5;
  const step = 10;
  for (let i = 0; i <= s; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, s);
    ctx.moveTo(0, i);
    ctx.lineTo(s, i);
    ctx.stroke();
  }

  return asColorTexture(canvas);
}
