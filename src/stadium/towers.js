import * as THREE from "three";

import { TOWERS, TOWER_HEAD_HEIGHT } from "./config.js";

const AIM = new THREE.Vector3(0, 6, 0); // lamps point at the infield

/**
 * The four floodlight towers (geometry + emissive lamp panels only). The actual
 * SpotLights are created by the lighting rig at the returned head positions.
 *
 * @returns {{ group: THREE.Group, headPositions: THREE.Vector3[], dispose: () => void }}
 */
export function createTowers() {
  const group = new THREE.Group();
  group.name = "FloodlightTowers";
  const disposables = [];
  const headPositions = [];

  // Shared geometry/material across the four identical towers.
  const poleGeo = new THREE.CylinderGeometry(0.8, 1.4, TOWER_HEAD_HEIGHT, 12);
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0x6b7280,
    roughness: 0.6,
    metalness: 0.7,
  });
  const backGeo = new THREE.BoxGeometry(10, 6, 0.8);
  const backMat = new THREE.MeshStandardMaterial({
    color: 0x2b2f36,
    roughness: 0.5,
    metalness: 0.4,
  });
  const lampGeo = new THREE.BoxGeometry(1.8, 1.8, 0.3);
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0xfff4d6,
    emissive: 0xfff0c8,
    emissiveIntensity: 3.0,
    roughness: 0.3,
  });
  disposables.push(poleGeo, poleMat, backGeo, backMat, lampGeo, lampMat);

  for (const { x, z } of TOWERS) {
    // Pole.
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, TOWER_HEAD_HEIGHT / 2, z);
    pole.castShadow = true;
    group.add(pole);

    // Lamp head: a group at the top, rotated to face the infield.
    const head = new THREE.Group();
    head.position.set(x, TOWER_HEAD_HEIGHT, z);
    head.lookAt(AIM); // local -Z now points toward the field

    const backing = new THREE.Mesh(backGeo, backMat);
    backing.position.z = -0.4;
    head.add(backing);

    // 4 × 2 grid of emissive lamp panels on the front face.
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 2; row++) {
        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(-3.3 + col * 2.2, -0.9 + row * 1.8, -0.85);
        head.add(lamp);
      }
    }
    group.add(head);

    headPositions.push(new THREE.Vector3(x, TOWER_HEAD_HEIGHT, z));
  }

  return {
    group,
    headPositions,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
