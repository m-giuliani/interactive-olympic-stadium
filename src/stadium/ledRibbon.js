import * as THREE from "three";

import { discorectanglePoints, buildRibbon } from "../utils/geometry.js";
import {
  STRAIGHT_HALF,
  BOWL_BOTTOM_RADIUS,
  BOWL_BASE_HEIGHT,
  ARC_SEGMENTS,
} from "./config.js";

// A sleek board height — thin, like a digital advertising strip.
const RIBBON_HEIGHT = 0.55;

/**
 * An emissive LED ribbon board: a thin vertical band following the oval just in
 * front of the first row of seats — the classic perimeter advertising display.
 *
 * It glows faintly in normal play; the ceremony cranks up its emissive intensity
 * and cycles its hue, and the bloom pass turns it into the show's centrepiece
 * (CLAUDE.md §8 priority 3: LED/emissive + bloom).
 *
 * @returns {{ mesh: THREE.Mesh, material: THREE.MeshStandardMaterial, dispose: () => void }}
 */
export function createLedRibbon() {
  // Same loop used twice at two heights → a vertical band around the oval.
  // A thin board whose bottom edge sits flush on top of the grey perimeter wall
  // (which rises to BOWL_BASE_HEIGHT), so it reads as a mounted advertising strip
  // with no floating gap and a low profile that doesn't block the track view.
  const loop = discorectanglePoints(
    STRAIGHT_HALF,
    BOWL_BOTTOM_RADIUS - 0.2,
    ARC_SEGMENTS,
  );
  const geo = buildRibbon(
    loop,
    BOWL_BASE_HEIGHT,
    loop,
    BOWL_BASE_HEIGHT + RIBBON_HEIGHT,
  );

  const material = new THREE.MeshStandardMaterial({
    color: 0x05060a,
    emissive: 0x2244ff,
    emissiveIntensity: 0.4,
    roughness: 0.4,
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
