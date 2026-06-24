import * as THREE from "three";
import { discorectanglePoints, buildRibbon } from "../utils/geometry.js";
import {
  STRAIGHT_HALF,
  BOWL_BOTTOM_RADIUS,
  BOWL_BASE_HEIGHT,
  ARC_SEGMENTS,
} from "./config.js";

/**
 * An emissive LED ribbon board: a tall digital advertising display mounted flush
 * against the dark grey perimeter parapet wall, wrapping the inner perimeter of
 * the stands.
 *
 * @returns {{ mesh: THREE.Mesh, material: THREE.MeshStandardMaterial, dispose: () => void }}
 */
export function createLedRibbon() {
  // 1. Create the oval outline (hollow in the middle) exactly 5 millimeters 
  // in front of the concrete wall to avoid z-fighting and act as a screen wrap.
  const loop = discorectanglePoints(
    STRAIGHT_HALF,
    BOWL_BOTTOM_RADIUS - 0.05,
    ARC_SEGMENTS
  );

  // 2. Extrude the ribbon from the ground (0) up to the bottom of the seats (BOWL_BASE_HEIGHT).
  // We add a tiny +0.02 overlap to ensure there are no visible gaps at the top edge.
  const geo = buildRibbon(loop, 0, loop, BOWL_BASE_HEIGHT + 0.02);

  // 3. Neutral grey board by default — a powered-down advertising panel.
  // The ceremony cranks the emissive intensity and cycles a rainbow hue, then
  // restores this grey when it ends (see events/ceremony.js).
  const material = new THREE.MeshStandardMaterial({
    color: 0x2a2d33,
    emissive: 0x808080,
    emissiveIntensity: 0.4,
    roughness: 0.6,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, material);
  mesh.name = "LedRibbon";

  return {
    mesh,
    material,
    dispose: () => {
      geo.dispose();
      material.dispose();
    },
  };
}