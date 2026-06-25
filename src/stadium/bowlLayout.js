/**
 * BowlLayout — the shared discretisation of the {@link StadiumPlan} perimeter
 * into tribune BLOCKS and the AISLE gaps between them.
 *
 * It is the single source of truth that keeps every generator aligned: the
 * BowlGenerator fills the blocks and the StairGenerator climbs the aisles — both
 * reading the same ranges.
 *
 * Each sector is divided into `sector.blocks` equal cells; each block is the
 * cell inset by half an aisle on both sides, and each aisle is the gap left
 * between two consecutive blocks (wrapping around the oval).
 *
 * @param {ReturnType<typeof import("./stadiumPlan.js").createStadiumPlan>} plan
 * @param {{ aisleFrac?: number }} [opts] aisleFrac — share of a cell taken by the aisle.
 * @returns {{ blocks: Array<{sectorIndex:number, sectorId:string, tint:number[],
 *             u0:number, u1:number}>,
 *             aisles: Array<{u0:number, u1:number, uCenter:number,
 *             sectorIndex:number}> }}
 */
export function createBowlLayout(plan, { aisleFrac = 0.18 } = {}) {
  const blocks = [];

  for (const sector of plan.sectors) {
    const n = sector.blocks ?? 1;
    const pitch = (sector.u1 - sector.u0) / n;
    const halfGap = (aisleFrac / 2) * pitch;
    for (let b = 0; b < n; b++) {
      const cellStart = sector.u0 + b * pitch;
      const cellEnd = sector.u0 + (b + 1) * pitch;
      blocks.push({
        sectorIndex: sector.sectorIndex,
        sectorId: sector.id,
        tint: sector.tint ?? [1, 1, 1],
        u0: cellStart + halfGap,
        u1: cellEnd - halfGap,
      });
    }
  }

  // Aisles are the gaps between consecutive blocks (wrapping at the seam).
  const aisles = [];
  for (let i = 0; i < blocks.length; i++) {
    const cur = blocks[i];
    const next = blocks[(i + 1) % blocks.length];
    const u0 = cur.u1;
    let u1 = next.u0;
    if (u1 <= u0) u1 += 1; // wrap the final aisle past u = 1
    aisles.push({
      u0,
      u1,
      uCenter: (u0 + u1) / 2,
      sectorIndex: cur.sectorIndex,
    });
  }

  return { blocks, aisles };
}
