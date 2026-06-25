import * as THREE from "three";

import { MeshBuilder } from "./meshBuilder.js";

/**
 * StairGenerator — the structural aisle stairways that fill the aisle gaps the
 * {@link createBowlLayout} leaves between tribune blocks.
 *
 * The stairs reuse the {@link createRakeProfile} tread/riser, so every step lines
 * up with a seat row in the neighbouring blocks. They begin at `startDepth`
 * (0 = the trackside) and climb to the rim; if started above the trackside, a
 * short front wall closes the gap from `frontHeight` up to the first tread.
 * Periodic LANDINGS (a flat run followed by a catch-up riser) break the climb
 * without shifting where it ends.
 *
 * Emitted as its own mesh so the aisles read as independent structure sitting
 * between the seating blocks.
 */
export class StairGenerator {
  /**
   * @param {{ startDepth?: number, frontHeight?: number, samples?: number,
   *           landingEvery?: number, landingRows?: number, lift?: number }} [opts]
   *   startDepth/frontHeight — match the vomitory so the stair sits above it;
   *   samples — u-samples across an aisle; landingEvery/landingRows — landing
   *   cadence; lift — small raise so treads sit proud of the seating plane.
   */
  constructor({
    startDepth = 0,
    frontHeight = 0,
    samples = 4,
    landingEvery = 12,
    landingRows = 2,
    lift = 0.05,
  } = {}) {
    this.startDepth = startDepth;
    this.frontHeight = frontHeight;
    this.samples = samples;
    this.landingEvery = landingEvery;
    this.landingRows = landingRows;
    this.lift = lift;
  }

  /**
   * @param {ReturnType<typeof import("./stadiumPlan.js").createStadiumPlan>} plan
   * @param {ReturnType<typeof import("./rakeProfile.js").createRakeProfile>} profile
   * @param {ReturnType<typeof import("./bowlLayout.js").createBowlLayout>} layout
   * @returns {{ stairGeo: THREE.BufferGeometry }}
   */
  generate(plan, profile, layout) {
    const stairs = new MeshBuilder();
    const o = new THREE.Vector2();
    const vert = (u, d, y) => {
      plan.offset(u, d, o);
      return new THREE.Vector3(o.x, y, o.y);
    };

    const { tread, riser, startHeight, depth, height: topH } = profile;
    const slope = (topH - startHeight) / depth;
    const rakeH = (d) => startHeight + slope * d;

    // Build the step polyline once (same for every aisle), with landings.
    const D0 = this.startDepth;
    const pts = [];
    let d = D0;
    let h = rakeH(D0) + this.lift;
    pts.push({ d, h });
    const rows = Math.max(1, Math.round((depth - D0) / tread));
    let r = 0;
    while (r < rows) {
      const landing =
        this.landingEvery > 0 &&
        r > 0 &&
        r % this.landingEvery === 0 &&
        r + this.landingRows <= rows;
      const n = landing ? this.landingRows : 1;
      d += tread * n;
      pts.push({ d, h }); // tread (a long flat run when it's a landing)
      h += riser * n;
      pts.push({ d, h }); // riser (a taller catch-up step after a landing)
      r += n;
    }
    const hStart = pts[0].h;

    for (const aisle of layout.aisles) {
      const { u0, u1 } = aisle;
      for (let j = 0; j < this.samples; j++) {
        const uA = THREE.MathUtils.lerp(u0, u1, j / this.samples);
        const uB = THREE.MathUtils.lerp(u0, u1, (j + 1) / this.samples);

        // Steps.
        for (let k = 0; k < pts.length - 1; k++) {
          const a = pts[k];
          const c = pts[k + 1];
          stairs.addQuad(
            vert(uA, a.d, a.h),
            vert(uB, a.d, a.h),
            vert(uB, c.d, c.h),
            vert(uA, c.d, c.h),
          );
        }

        // Front wall: closes the gap from the tunnel ceiling to the first tread.
        if (hStart > this.frontHeight) {
          stairs.addQuad(
            vert(uA, D0, this.frontHeight),
            vert(uB, D0, this.frontHeight),
            vert(uB, D0, hStart),
            vert(uA, D0, hStart),
          );
        }
      }
    }

    return { stairGeo: stairs.build() };
  }
}
