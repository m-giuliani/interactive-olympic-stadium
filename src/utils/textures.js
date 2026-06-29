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

/**
 * 100 m finish-line decal: a thick solid white line across all lanes, with bold
 * lane numbers 1..N painted just downstream of it, on a TRANSPARENT background
 * so it reads as paint on the track (no checkered tape, no physical ribbon).
 * Generated entirely on a <canvas> — no image files (CLAUDE.md §5).
 *
 * Canvas → world mapping (see stadium/finishLine.js):
 *   - HEIGHT (V) is the lane axis: lane 1 at the top … lane N at the bottom,
 *     which maps to inner → outer lane on the track.
 *   - WIDTH (U) is the running direction: the white line sits at mid-width and
 *     the numbers just after it (downstream, the +X side athletes run toward).
 * Each number is rotated 180° so it reads upright from the main (+Z) stand.
 *
 * @param {number} laneCount
 * @param {number} aspect  bandDepth / trackWidth, so the canvas (and therefore
 *                         the glyphs) keep the plane's real-world proportions.
 * @returns {THREE.CanvasTexture}
 */
export function makeFinishLineTexture(laneCount = 8, aspect = 0.225) {
  const lanePx = 128; // resolution per lane along the lane axis
  const h = lanePx * laneCount; // V = lanes
  const w = Math.max(64, Math.round(h * aspect)); // U = running direction
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, w, h); // transparent background

  // Thick solid white finish line, centred across the band, spanning all lanes.
  const lineW = Math.round(w * 0.07);
  const lineX = Math.round(w * 0.5 - lineW / 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(lineX, 0, lineW, h);

  // Bold lane numbers, one per lane, just AFTER the line (downstream).
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `bold ${Math.round(lanePx * 0.6)}px Arial, sans-serif`;
  const numX = lineX + lineW + Math.round(w * 0.18);
  for (let i = 0; i < laneCount; i++) {
    const cy = (i + 0.5) * lanePx; // lane i centre (lane 1 at the top)
    ctx.save();
    ctx.translate(numX, cy);
    ctx.rotate(Math.PI); // face the main stand once laid on the ground
    ctx.fillText(String(i + 1), 0, 0);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = ANISOTROPY;
  tex.wrapS = THREE.ClampToEdgeWrapping; // a single decal — never tiled
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Long-jump runway: brick-red surface with a white take-off line PAINTED into it
 * (not a separate mesh). linePos is 0..1 along the run direction (U); 1 = the sand
 * end. Put the line a bit back from the sand so red runway still shows in front.
 */
export function makeLongJumpRunwayTexture(linePos = 0.82) {
  const w = 2048;            // U = running direction (X)
  const h = 256;             // V = width (Z)
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d");

  // Synthetic Mondo-style track surface: a warm terracotta base, NOT a flat
  // slab of red. We build it up so the floodlights read a granular rubber
  // surface — large-scale tonal mottling, then a dense fine EPDM-granule speckle.
  ctx.fillStyle = "#9a3826";
  ctx.fillRect(0, 0, w, h);

  // Large soft blotches of slightly lighter/darker red so the surface has gentle
  // tonal variation across its length instead of one uniform colour.
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = 20 + Math.random() * 70;
    ctx.fillStyle =
      Math.random() < 0.5 ? "rgba(58,20,12,0.06)" : "rgba(196,98,66,0.06)";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Fine rubberized speckle — the individual EPDM granules of the track. A mix of
  // dark, mid and light flecks gives the matte granular look up close.
  for (let i = 0; i < 60000; i++) {
    const t = Math.random();
    if (t < 0.5) ctx.fillStyle = "rgba(64,22,14,0.55)"; // dark grain
    else if (t < 0.85) ctx.fillStyle = "rgba(150,68,44,0.5)"; // mid grain
    else ctx.fillStyle = "rgba(214,150,120,0.45)"; // light fleck
    const s = 0.7 + Math.random() * 1.3;
    ctx.fillRect(Math.random() * w, Math.random() * h, s, s);
  }

  // White take-off line: a thin vertical stripe across the full width. Clamp so
  // the full line still renders when linePos sits right at the edge (≈1). Drawn
  // last so it sits crisp on top of the granular surface.
  const lineW = Math.round(w * 0.012);          // ~thickness of the line
  const lineX = Math.min(
    Math.max(Math.round(w * linePos - lineW / 2), 0),
    w - lineW,
  );
  ctx.fillStyle = "#f3f0ea";
  ctx.fillRect(lineX, 0, lineW, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = ANISOTROPY;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Olympic measuring scale: a dark graduated distance rail for the long-jump pit,
 * numbered in metres from the take-off board. startDist/endDist are the distances
 * (m) at the two ends of the rail along the run direction (X = the U axis, so the
 * span endDist-startDist is also the rail's real length in metres).
 *
 * Whole metres get a long white tick + a bold number; half-metres get a short
 * thin tick. The rail is long and thin, so the canvas is far denser in Z than in
 * X — left as-is the glyphs would render stretched wide, so each number is
 * pre-squashed horizontally by the texel-aspect ratio (uses RAIL_WIDTH_M, which
 * must match the mesh's Z-width). It is also drawn mirrored (scale -1 in X) so it
 * reads upright from the INFIELD/camera side (smaller Z), where the box top
 * face's U↔+X mapping appears horizontally flipped.
 *
 * @returns {THREE.CanvasTexture}
 */
export function makeLongJumpScaleTexture(startDist, endDist) {
  const w = 4096; // U = running direction (X); wide so the numbers stay crisp
  const h = 96; // V = rail width (Z)
  const RAIL_WIDTH_M = 0.2; // must match the scale rail mesh's Z-width
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d");

  const span = endDist - startDist;
  const xOf = (d) => ((d - startDist) / span) * w;

  // Dark "official measurement board" background.
  ctx.fillStyle = "#1c222c";
  ctx.fillRect(0, 0, w, h);

  // Pre-squash factor so numbers read proportional once stretched along the rail:
  // (Z metres/px) / (X metres/px). X is the sparser axis, so sx < 1 narrows glyphs.
  const sx = (RAIL_WIDTH_M / h) / (span / w);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const font = `bold ${Math.round(h * 0.42)}px Arial, sans-serif`;
  const numY = Math.round(h * 0.72); // numbers sit on the viewer (−Z) side
  const tickW = Math.max(2, Math.round(w * 0.0009));

  // Ticks every half metre; whole metres get the long tick + the number.
  const first = Math.ceil(startDist * 2) / 2; // first half-metre at/after startDist
  for (let d = first; d <= endDist + 1e-6; d += 0.5) {
    const x = xOf(d);
    const whole = Math.abs(d - Math.round(d)) < 1e-6;
    if (whole) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(Math.round(x - tickW / 2), 0, tickW, Math.round(h * 0.5));
      // Skip numbers that would clip at the very edges of the rail.
      if (x > 40 && x < w - 40) {
        ctx.save();
        ctx.translate(x, numY);
        ctx.scale(-sx, 1); // mirror for the infield side + squash to proportion
        ctx.fillStyle = "#ffffff";
        ctx.font = font;
        ctx.fillText(String(Math.round(d)), 0, 0);
        ctx.restore();
      }
    } else {
      ctx.fillStyle = "#9aa3b1";
      ctx.fillRect(Math.round(x - tickW / 2 + 0.5), 0, Math.max(1, tickW - 2), Math.round(h * 0.3));
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = ANISOTROPY;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * OMEGA-style long-jump LED measurement board face: a deep-blue glowing display
 * with big bold white metre numbers and a dashed "dotted scale" running along
 * the top and bottom edges. Used as an emissiveMap so it blooms under the
 * post-processing (like the LED ribbon). startDist/endDist are the distances (m)
 * at the two ends; the span is the board's real width in metres (= U axis).
 *
 * The board face points −Z (toward the infield camera) and the mesh is built
 * with rotation.x = PI + tex.flipY = false to keep the numbers upright; for that
 * viewer world +X is to the LEFT, so each glyph is drawn mirrored (scale -1 in X)
 * to read correctly, and pre-squashed to stay proportional on the wide face.
 *
 * @returns {THREE.CanvasTexture}
 */
export function makeLongJumpBoardTexture(startDist, endDist) {
  const w = 4096; // U = run direction (X)
  const h = 256; // V = board height (Y)
  const FACE_HEIGHT_M = 0.48; // must match the LED face mesh height
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d");

  const span = endDist - startDist;
  const xOf = (d) => ((d - startDist) / span) * w;

  // Deep blue LED background — a subtle vertical gradient.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#0e2f9e");
  grad.addColorStop(1, "#1846d8");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Dashed dotted scale along the top and bottom edges; whole metres get a
  // taller, brighter dash, half metres a shorter dimmer one.
  const firstHalf = Math.ceil(startDist * 2) / 2;
  for (let d = firstHalf; d <= endDist + 1e-6; d += 0.5) {
    const whole = Math.abs(d - Math.round(d)) < 1e-6;
    const dh = whole ? Math.round(h * 0.16) : Math.round(h * 0.08);
    const dw = whole ? Math.max(3, Math.round(w * 0.0012)) : Math.max(2, Math.round(w * 0.0008));
    ctx.fillStyle = whole ? "#ffffff" : "rgba(255,255,255,0.7)";
    const x = Math.round(xOf(d) - dw / 2);
    ctx.fillRect(x, 0, dw, dh); // top edge
    ctx.fillRect(x, h - dh, dw, dh); // bottom edge
  }

  // Big bold white metre numbers, centred in the band.
  const sx = (FACE_HEIGHT_M / h) / (span / w); // squash so glyphs stay proportional
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const font = `bold ${Math.round(h * 0.62)}px Arial, sans-serif`;
  for (let d = Math.ceil(startDist); d <= endDist + 1e-6; d += 1) {
    const x = xOf(d);
    if (x <= 70 || x >= w - 70) continue; // skip numbers clipping the edges
    ctx.save();
    ctx.translate(x, h * 0.5);
    ctx.scale(sx, 1); // squash to proportion (no mirror — face points +Z)
    ctx.fillStyle = "#ffffff";
    ctx.font = font;
    ctx.fillText(String(d), 0, 0);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = true; // face plane is unrotated (+Z); keeps the numbers upright
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = ANISOTROPY;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}