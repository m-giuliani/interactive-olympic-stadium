import * as THREE from "three";

import { discorectangleShape } from "../utils/geometry.js";
import { makePitchTexture } from "../utils/textures.js";
import {
  STRAIGHT_HALF,
  TRACK_INNER_RADIUS,
  INFIELD_Y,
  PITCH_Y,
  PITCH_LENGTH,
  PITCH_WIDTH,
  ARC_SEGMENTS,
} from "./config.js";

/**
 * The infield: a grass-filled discorectangle inside the track, with a textured
 * football pitch laid on top of it.
 *
 * @returns {{ group: THREE.Group, dispose: () => void }}
 */
export function createField() {
  const group = new THREE.Group();
  group.name = "Field";
  const disposables = [];

  // --- Infield grass (fills the whole inside of the track) -------------------
  const grassShape = discorectangleShape(
    STRAIGHT_HALF,
    TRACK_INNER_RADIUS,
    ARC_SEGMENTS,
  );
  const grassGeo = new THREE.ShapeGeometry(grassShape);
  const grassMat = new THREE.MeshStandardMaterial({
    color: 0x265c2a,
    roughness: 1.0,
    metalness: 0.0,
  });
  const grass = new THREE.Mesh(grassGeo, grassMat);
  grass.rotation.x = -Math.PI / 2; // lay the XY shape onto the ground
  grass.position.y = INFIELD_Y;
  grass.receiveShadow = true;
  group.add(grass);
  disposables.push(grassGeo, grassMat);

  // --- Football pitch (textured) --------------------------------------------
  const pitchTex = makePitchTexture();
  const pitchGeo = new THREE.PlaneGeometry(PITCH_LENGTH, PITCH_WIDTH);
  const pitchMat = new THREE.MeshStandardMaterial({
    map: pitchTex,
    roughness: 0.95,
    metalness: 0.0,
  });
  const pitch = new THREE.Mesh(pitchGeo, pitchMat);
  pitch.rotation.x = -Math.PI / 2;
  pitch.position.y = PITCH_Y;
  pitch.receiveShadow = true;
  group.add(pitch);
  disposables.push(pitchGeo, pitchMat, pitchTex);

  return {
    group,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
