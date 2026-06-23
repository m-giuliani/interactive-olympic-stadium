import * as THREE from "three";

import { discorectanglePoints, buildRibbon } from "../utils/geometry.js";
import { makeGrainNormalMap } from "../utils/textures.js";
import {
  STRAIGHT_HALF,
  TRACK_OUTER_RADIUS,
  BOWL_BOTTOM_RADIUS,
  BOWL_BASE_HEIGHT,
  ARC_SEGMENTS,
  TRACK_Y,
} from "./config.js";

/**
 * The apron: a flat concrete/rubber ring filling the BOWL_GAP between the outer
 * edge of the track and the first row of seats, PLUS a vertical perimeter wall
 * that closes the gap between the apron floor (y≈0) and the raised front of the
 * seating bowl (y = BOWL_BASE_HEIGHT). Without that wall you could see straight
 * under the stands to the black background.
 *
 * Reuses the grain normal map so the surfaces catch the floodlights.
 *
 * @returns {{ group: THREE.Group, dispose: () => void }}
 */
export function createApron() {
  const group = new THREE.Group();
  group.name = "Apron";
  const disposables = [];

  const innerLoop = discorectanglePoints(
    STRAIGHT_HALF,
    TRACK_OUTER_RADIUS,
    ARC_SEGMENTS,
  );
  const outerLoop = discorectanglePoints(
    STRAIGHT_HALF,
    BOWL_BOTTOM_RADIUS,
    ARC_SEGMENTS,
  );

  const normalMap = makeGrainNormalMap();
  normalMap.repeat.set(90, 5);
  const floorMat = new THREE.MeshStandardMaterial({
    color: 0x4a4f57,
    roughness: 0.92,
    metalness: 0.0,
    normalMap,
    normalScale: new THREE.Vector2(0.4, 0.4),
    side: THREE.DoubleSide,
  });
  disposables.push(normalMap, floorMat);

  // Floor ring.
  const floorGeo = buildRibbon(
    innerLoop,
    TRACK_Y - 0.005,
    outerLoop,
    TRACK_Y - 0.005,
  );
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.receiveShadow = true;
  group.add(floor);
  disposables.push(floorGeo);

  // Vertical perimeter wall, from the apron up to the front of the seating bowl.
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x30343b,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const wallGeo = buildRibbon(
    outerLoop,
    0,
    outerLoop,
    BOWL_BASE_HEIGHT,
  );
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.receiveShadow = true;
  group.add(wall);
  disposables.push(wallGeo, wallMat);

  return {
    group,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
