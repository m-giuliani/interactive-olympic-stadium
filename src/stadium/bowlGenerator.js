import * as THREE from "three";

import { MeshBuilder } from "./meshBuilder.js";

/**
 * BowlGenerator — builds the SEATING BLOCKS from a {@link StadiumPlan} footprint
 * and a {@link createRakeProfile} cross-section.
 *
 * It consumes the shared {@link createBowlLayout} (blocks + aisles) and, for each
 * block, sweeps the stepped rake profile along the block's `u`-range — every
 * `(profile segment) × (u sample)` becomes a quad, so treads and risers both
 * appear as real geometry. Each block carries its sector's tint.
 *
 * Outputs two merged geometries:
 *   - `seatGeo`  — the stepped seating surfaces (textured, per-sector tint);
 *   - `conGeo`   — the concrete side flanks of each block (down to the ground),
 *                  which also frame the aisle gaps.
 *
 * Aisle stairs and carved vomitories are NOT this generator's concern — they are
 * produced by their own generators and slot into the gaps the layout leaves.
 */
export class BowlGenerator {
  /**
   * @param {{ samples?: number }} [opts] samples — u-samples across each block
   *   (curve smoothness).
   */
  constructor({ samples = 6 } = {}) {
    this.samples = samples;
  }

  /**
   * @param {ReturnType<typeof import("./stadiumPlan.js").createStadiumPlan>} plan
   * @param {ReturnType<typeof import("./rakeProfile.js").createRakeProfile>} profile
   * @param {ReturnType<typeof import("./bowlLayout.js").createBowlLayout>} layout
   * @returns {{ seatGeo: THREE.BufferGeometry, conGeo: THREE.BufferGeometry }}
   */
  generate(plan, profile, layout) {
    const seat = new MeshBuilder({ uv: true, color: true });
    const concrete = new MeshBuilder();
    const pts = profile.points;
    const o = new THREE.Vector2();

    // A bowl vertex: footprint point pushed `d` outward along the local normal,
    // raised to height `h`.
    const vert = (u, d, h) => {
      plan.offset(u, d, o);
      return new THREE.Vector3(o.x, h, o.y);
    };

    for (const block of layout.blocks) {
      const { u0, u1, tint } = block;

      // --- Stepped seating surface -----------------------------------------
      for (let j = 0; j < this.samples; j++) {
        const uA = THREE.MathUtils.lerp(u0, u1, j / this.samples);
        const uB = THREE.MathUtils.lerp(u0, u1, (j + 1) / this.samples);
        const uv0 = j / this.samples;
        const uv1 = (j + 1) / this.samples;
        for (let k = 0; k < pts.length - 1; k++) {
          const a = pts[k];
          const c = pts[k + 1];
          const v0 = k / (pts.length - 1);
          const v1 = (k + 1) / (pts.length - 1);
          seat.addQuad(
            vert(uA, a.d, a.h),
            vert(uB, a.d, a.h),
            vert(uB, c.d, c.h),
            vert(uA, c.d, c.h),
            {
              color: tint,
              uv: [
                [uv0, v0],
                [uv1, v0],
                [uv1, v1],
                [uv0, v1],
              ],
            },
          );
        }
      }

      // --- Concrete side flanks (the aisle-facing walls) -------------------
      // One vertical wall per TREAD segment, down to the ground; their stacked
      // top edges form the staircase silhouette. Riser segments share a depth,
      // so they'd be degenerate — skip them.
      for (const edge of [u0, u1]) {
        for (let k = 0; k < pts.length - 1; k++) {
          const a = pts[k];
          const c = pts[k + 1];
          if (a.d === c.d) continue; // riser → zero-width flank, skip
          concrete.addQuad(
            vert(edge, a.d, a.h),
            vert(edge, c.d, c.h),
            vert(edge, c.d, 0),
            vert(edge, a.d, 0),
          );
        }
      }
    }

    return { seatGeo: seat.build(), conGeo: concrete.build() };
  }
}
