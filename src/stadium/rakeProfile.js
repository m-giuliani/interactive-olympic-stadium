/**
 * RakeProfile — the CROSS-SECTION layer of the seating-bowl refactor.
 *
 * It turns a few human-scaled parameters into an ordered "staircase" polyline of
 * `{ d, h }` points, where `d` is depth outward from the trackside and `h` is
 * height. Consecutive points alternate a TREAD (move out, same height) and a
 * RISER (move up, same depth), so when a generator sweeps this polyline along
 * the StadiumPlan it produces genuine discrete terracing — not a smooth ramp.
 *
 * Driven by the bowl ENVELOPE (`depth`, `topHeight`) plus a target `riser`, so
 * the steps stay human-scaled while the back row lands exactly on `topHeight`
 * and `depth` (keeping the bowl aligned with the roof/facade). The tread depth
 * is derived (`depth / rows`).
 *
 * @param {{ startHeight: number, topHeight: number, depth: number, riser: number }} cfg
 * @returns {{ points: {d:number,h:number}[], rows: number, tread: number,
 *             riser: number, startHeight: number, depth: number, height: number }}
 */
export function createRakeProfile({ startHeight, topHeight, depth, riser }) {
  const rows = Math.max(1, Math.round((topHeight - startHeight) / riser));
  const tread = depth / rows;
  const stepRise = (topHeight - startHeight) / rows; // exact fit to topHeight

  const points = [];
  let d = 0;
  let h = startHeight;
  points.push({ d, h }); // trackside front edge of row 0
  for (let i = 0; i < rows; i++) {
    d += tread;
    points.push({ d, h }); // tread (outward)
    h += stepRise;
    points.push({ d, h }); // riser (upward)
  }

  return {
    points,
    rows,
    tread,
    riser: stepRise,
    startHeight,
    depth,
    height: h, // == topHeight
  };
}
