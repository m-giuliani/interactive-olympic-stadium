import * as THREE from "three";

import { discorectanglePoints, buildRibbon } from "../utils/geometry.js";
import { makeTrackTexture, makeGrainNormalMap } from "../utils/textures.js";
import {
  STRAIGHT_HALF,
  TRACK_INNER_RADIUS,
  TRACK_OUTER_RADIUS,
  LANE_COUNT,
  TRACK_Y,
  ARC_SEGMENTS,
} from "./config.js";

/**
 * The running track: a flat brick-red ribbon following the oval, with white
 * lane lines from the colour map and a tiled normal map for surface grain
 * (CLAUDE.md §5 — the visibly-used non-diffuse map).
 *
 * @returns {{ mesh: THREE.Mesh, dispose: () => void }}
 */
export function createTrack() {
  const inner = discorectanglePoints(
    STRAIGHT_HALF,
    TRACK_INNER_RADIUS,
    ARC_SEGMENTS,
  );
  const outer = discorectanglePoints(
    STRAIGHT_HALF,
    TRACK_OUTER_RADIUS,
    ARC_SEGMENTS,
  );

  const geo = buildRibbon(inner, TRACK_Y, outer, TRACK_Y);

  // Colour map: lane lines run across the width (V), constant along length (U).
  const colorMap = makeTrackTexture(LANE_COUNT);

  // Normal map: tiled finely and independently of the colour map for grain.
  const normalMap = makeGrainNormalMap();
  normalMap.repeat.set(120, 8);

  const mat = new THREE.MeshStandardMaterial({
    map: colorMap,
    normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "Track";
  mesh.receiveShadow = true;

  return {
    mesh,
    dispose: () => {
      geo.dispose();
      mat.dispose();
      colorMap.dispose();
      normalMap.dispose();
    },
  };
}
