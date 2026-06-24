import * as THREE from "three";

import { discorectanglePoints, buildRibbon } from "../utils/geometry.js";
import {
  STRAIGHT_HALF,
  BOWL_TOP_RADIUS,
  BOWL_TOP_HEIGHT,
  ARC_SEGMENTS,
} from "./config.js";

/**
 * The stadium's exterior architecture: a light concrete facade wrapping the
 * outside of the seating bowl, plus a ring of structural support pillars.
 *
 * Without this you see the dark back of the seating ribbon (a "smooth UFO").
 * The facade is a vertical wall at the bowl's outer radius, rising to the rim
 * (BOWL_TOP_HEIGHT) so it hides the seats' backs and reads as real architecture;
 * the pillars stand a little proud of it as external columns.
 *
 * Light concrete + low metalness + mid roughness so the surface catches the
 * dusk sky / floodlights nicely (high metalness would look flat/dark here since
 * the scene has no reflection environment map).
 *
 * @returns {{ group: THREE.Group, dispose: () => void }}
 */
export function createExterior() {
  const group = new THREE.Group();
  group.name = "Exterior";
  const disposables = [];

  // Shared light-concrete material for the facade and the pillars.
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xd5d2c8, // warm light concrete / off-white
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  disposables.push(concreteMat);

  // --- Facade ----------------------------------------------------------------
  // A vertical wall at the bowl's outer radius, from the ground up to the rim.
  // Its top edge meets the seating bowl's top outer edge, closing the rim line.
  const outerLoop = discorectanglePoints(
    STRAIGHT_HALF,
    BOWL_TOP_RADIUS,
    ARC_SEGMENTS,
  );
  const facadeGeo = buildRibbon(outerLoop, 0, outerLoop, BOWL_TOP_HEIGHT);
  const facade = new THREE.Mesh(facadeGeo, concreteMat);
  facade.name = "Facade";
  facade.receiveShadow = true;
  group.add(facade);
  disposables.push(facadeGeo);

  // --- Structural pillars ----------------------------------------------------
  // A ring of vertical concrete cylinders standing just outside the facade,
  // following the oval perimeter as architectural supports.
  const PILLAR_COUNT = 60;
  const PILLAR_OFFSET = 1.6; // how far the columns sit outside the facade
  const PILLAR_RADIUS = 1.4;

  // One shared, slightly tapered cylinder; base translated to sit on the ground.
  const pillarGeo = new THREE.CylinderGeometry(
    PILLAR_RADIUS,
    PILLAR_RADIUS * 1.2,
    BOWL_TOP_HEIGHT,
    12,
  );
  pillarGeo.translate(0, BOWL_TOP_HEIGHT / 2, 0);
  disposables.push(pillarGeo);

  // Sample the oval outline (denser than PILLAR_COUNT) and step along it so the
  // columns hug the perimeter on the straights and the curves alike.
  const ring = discorectanglePoints(
    STRAIGHT_HALF,
    BOWL_TOP_RADIUS + PILLAR_OFFSET,
    ARC_SEGMENTS * 2,
  );
  for (let i = 0; i < PILLAR_COUNT; i++) {
    const p = ring[Math.floor((i / PILLAR_COUNT) * ring.length)];
    const pillar = new THREE.Mesh(pillarGeo, concreteMat);
    pillar.position.set(p.x, 0, p.y);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    group.add(pillar);
  }

  return {
    group,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
