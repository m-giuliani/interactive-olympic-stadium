import * as THREE from "three";

import { createStadiumPlan } from "./stadiumPlan.js";
import { createRakeProfile } from "./rakeProfile.js";
import { createBowlLayout } from "./bowlLayout.js";
import { BowlGenerator } from "./bowlGenerator.js";
import { StairGenerator } from "./stairGenerator.js";
import { makeSeatTexture } from "../utils/textures.js";
import {
  BOWL_BOTTOM_RADIUS,
  BOWL_TOP_RADIUS,
  BOWL_BASE_HEIGHT,
  BOWL_TOP_HEIGHT,
} from "./config.js";

/**
 * The seating bowl, assembled from the refactored layers:
 *   - StadiumPlan   — the 2D oval footprint (4 G1 sectors);
 *   - RakeProfile   — the stepped cross-section (real treads + risers);
 *   - BowlLayout    — the shared block / aisle discretisation;
 *   - BowlGenerator — sweeps the profile along the plan into tribune blocks;
 *   - StairGenerator — climbs the aisle gaps with landed stairways.
 *
 * Just seats and stairs: stepped seating blocks with concrete flanks, divided by
 * aisles that carry stairways climbing from the trackside to the rim.
 *
 * @returns {{ group: THREE.Group, dispose: () => void }}
 */

const SEAT_RISER = 0.45; // target seat-row riser height (m) — human-scaled
const AISLE_FRAC = 0.18; // share of each cell taken by the aisle gap

export function createStands() {
  const plan = createStadiumPlan();
  const layout = createBowlLayout(plan, { aisleFrac: AISLE_FRAC });

  // The rake fills the bowl envelope: from the trackside up to the rim, across
  // the radial span between the inner and outer bowl radii.
  const profile = createRakeProfile({
    startHeight: BOWL_BASE_HEIGHT,
    topHeight: BOWL_TOP_HEIGHT,
    depth: BOWL_TOP_RADIUS - BOWL_BOTTOM_RADIUS,
    riser: SEAT_RISER,
  });

  const { seatGeo, conGeo } = new BowlGenerator({ samples: 6 }).generate(
    plan,
    profile,
    layout,
  );
  // Stairs climb the full aisle from the trackside up to the rim.
  const { stairGeo } = new StairGenerator({
    startDepth: 0,
    frontHeight: 0,
  }).generate(plan, profile, layout);

  // --- Materials -------------------------------------------------------------
  const seatTex = makeSeatTexture();
  seatTex.repeat.set(6, profile.rows); // ~one seat-texture tile per row

  const seatMat = new THREE.MeshStandardMaterial({
    map: seatTex,
    vertexColors: true, // per-tribune tint (from the sector table)
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xc8c4b8, // light concrete, matching the exterior facade family
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const stairMat = new THREE.MeshStandardMaterial({
    color: 0xb6b2a6, // slightly darker concrete so the steps read against blocks
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  // Receivers only: the bowl is the backdrop, so it takes the athletes'/flood
  // shadows but doesn't pay to cast its ~40k tris into every shadow map.
  const seating = new THREE.Mesh(seatGeo, seatMat);
  seating.name = "StandsSeating";
  seating.receiveShadow = true;

  const concrete = new THREE.Mesh(conGeo, concreteMat);
  concrete.name = "StandsConcrete";
  concrete.receiveShadow = true;

  const stairs = new THREE.Mesh(stairGeo, stairMat);
  stairs.name = "StandsStairs";
  stairs.receiveShadow = true;

  const group = new THREE.Group();
  group.name = "Stands";
  group.add(seating, concrete, stairs);

  return {
    group,
    dispose: () => {
      seatGeo.dispose();
      conGeo.dispose();
      stairGeo.dispose();
      seatMat.dispose();
      concreteMat.dispose();
      stairMat.dispose();
      seatTex.dispose();
    },
  };
}
