import * as THREE from "three";

import { discorectanglePoints, buildRibbon } from "../utils/geometry.js";
import { makeSeatTexture } from "../utils/textures.js";
import {
  STRAIGHT_HALF,
  BOWL_BOTTOM_RADIUS,
  BOWL_TOP_RADIUS,
  BOWL_BASE_HEIGHT,
  BOWL_TOP_HEIGHT,
  ARC_SEGMENTS,
} from "./config.js";

/**
 * The raked seating bowl: a ribbon that rises from the trackside (low, near)
 * to the back of the stands (high, far), wrapped in a tiled seat texture.
 *
 * @returns {{ mesh: THREE.Mesh, dispose: () => void }}
 */
export function createStands() {
  const bottom = discorectanglePoints(
    STRAIGHT_HALF,
    BOWL_BOTTOM_RADIUS,
    ARC_SEGMENTS,
  );
  const top = discorectanglePoints(
    STRAIGHT_HALF,
    BOWL_TOP_RADIUS,
    ARC_SEGMENTS,
  );

  const geo = buildRibbon(bottom, BOWL_BASE_HEIGHT, top, BOWL_TOP_HEIGHT);

  const seatTex = makeSeatTexture();
  seatTex.repeat.set(150, 26); // ~columns around the bowl × rows up the rake

  const mat = new THREE.MeshStandardMaterial({
    map: seatTex,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "Stands";
  mesh.receiveShadow = true;

  return {
    mesh,
    dispose: () => {
      geo.dispose();
      mat.dispose();
      seatTex.dispose();
    },
  };
}
