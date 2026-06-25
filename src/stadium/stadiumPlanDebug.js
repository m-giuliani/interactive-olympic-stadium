import * as THREE from "three";

/**
 * Debug overlay for {@link createStadiumPlan} — a verification aid only (not part
 * of the final stadium). It draws, slightly above the pitch:
 *
 *   - the footprint outline, one bright colour PER SECTOR, so the four
 *     macro-tribunes and their boundaries are obvious;
 *   - short outward-NORMAL ticks, to confirm the frames point away from the
 *     bowl (perpendicular on the straights, radial on the curves);
 *   - faint OFFSET RINGS at increasing depth, to confirm the bowl expands
 *     correctly — parallel on the straights, concentric on the curves — i.e. it
 *     is genuinely non-radial.
 *
 * @param {ReturnType<typeof import("./stadiumPlan.js").createStadiumPlan>} plan
 * @param {{ y?: number, ringDepths?: number[], normalEvery?: number,
 *           normalLength?: number, samplesPerSector?: number }} [opts]
 * @returns {{ group: THREE.Group, dispose: () => void }}
 */
export function createStadiumPlanDebug(plan, opts = {}) {
  const y = opts.y ?? 0.6;
  const ringDepths = opts.ringDepths ?? [15, 30, 45];
  const normalEvery = opts.normalEvery ?? 6;
  const normalLength = opts.normalLength ?? 4;
  const samplesPerSector = opts.samplesPerSector ?? 48;

  const SECTOR_COLORS = [0xff4455, 0x44ff66, 0x4499ff, 0xffcc33];

  const group = new THREE.Group();
  group.name = "StadiumPlanDebug";
  const disposables = [];

  const v3 = (p) => new THREE.Vector3(p.x, y, p.y); // 2D footprint → world XZ

  const addLine = (points, color, opacity = 1) => {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
    });
    const line = new THREE.Line(geo, mat);
    group.add(line);
    disposables.push(geo, mat);
    return line;
  };

  // --- Per-sector outline + normal ticks -------------------------------------
  plan.sectors.forEach((sector, i) => {
    const color = SECTOR_COLORS[i % SECTOR_COLORS.length];
    const outline = [];
    const ticks = [];
    for (let k = 0; k <= samplesPerSector; k++) {
      const u = sector.u0 + (sector.u1 - sector.u0) * (k / samplesPerSector);
      const { point, normal } = plan.sample(u);
      outline.push(v3(point));
      if (k % normalEvery === 0) {
        ticks.push(v3(point));
        ticks.push(
          new THREE.Vector3(
            point.x + normal.x * normalLength,
            y,
            point.y + normal.y * normalLength,
          ),
        );
      }
    }
    addLine(outline, color);

    // Normal ticks as discrete segments.
    const tgeo = new THREE.BufferGeometry().setFromPoints(ticks);
    const tmat = new THREE.LineBasicMaterial({ color: 0xff00ff });
    const tseg = new THREE.LineSegments(tgeo, tmat);
    group.add(tseg);
    disposables.push(tgeo, tmat);
  });

  // --- Faint offset rings (closed loops at increasing depth) ------------------
  const RING_SAMPLES = samplesPerSector * 4;
  for (const depth of ringDepths) {
    const pts = [];
    const o = new THREE.Vector2();
    for (let k = 0; k <= RING_SAMPLES; k++) {
      plan.offset(k / RING_SAMPLES, depth, o);
      pts.push(new THREE.Vector3(o.x, y, o.y));
    }
    addLine(pts, 0x99a0aa, 0.5);
  }

  return {
    group,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
