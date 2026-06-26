import * as THREE from "three";

import { makeFinishLineTexture } from "../utils/textures.js";
import {
  STRAIGHT_HALF,
  TRACK_INNER_RADIUS,
  TRACK_OUTER_RADIUS,
  TRACK_WIDTH,
  LANE_COUNT,
  TRACK_Y,
} from "./config.js";

/**
 * The 100 m finish line — a realistic Olympic-style painted decal (no physical
 * ribbon, tape or checkered pattern) plus a pair of photo-finish posts.
 *
 *   - A flat PlaneGeometry spanning the full 8-lane width, laid on the ground at
 *     the finish X (= STRAIGHT_HALF − 2, matching the sprint's finishX). It wears
 *     a procedural, transparent canvas texture: a thick white line across the
 *     lanes with bold lane numbers 1..8 just after it (see makeFinishLineTexture).
 *   - Two slim white vertical posts on the infield and outfield edges at the same
 *     X, standing in for the professional timing / photo-finish equipment.
 *
 * Geometry/UV mapping: PlaneGeometry(BAND_DEPTH, TRACK_WIDTH) then rotateX(−90°)
 * puts the band depth along world X (the running direction → texture U) and the
 * lane span along world Z (→ texture V), so the painted lanes line up 1:1 with
 * the physical lanes.
 *
 * @returns {{ group: THREE.Group, dispose: () => void }}
 */

const FINISH_X = STRAIGHT_HALF - 2; // matches SprintEvent.finishX
const BAND_DEPTH = 2.2; // metres along the running direction (the decal's depth)
const DECAL_Y = TRACK_Y + 0.012; // a hair above the track to avoid z-fighting
const POST_HEIGHT = 1.4;

export function createFinishLine() {
  const group = new THREE.Group();
  group.name = "FinishLine";

  const centerZ = TRACK_INNER_RADIUS + TRACK_WIDTH / 2; // middle of the 8 lanes

  // --- painted finish-line decal --------------------------------------------
  const tex = makeFinishLineTexture(LANE_COUNT, BAND_DEPTH / TRACK_WIDTH);
  const geo = new THREE.PlaneGeometry(BAND_DEPTH, TRACK_WIDTH);
  geo.rotateX(-Math.PI / 2); // lay it flat: depth → world X, lane span → world Z
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    roughness: 0.8,
    metalness: 0.0,
    // Sit just above the track and bias the depth so the paint never z-fights.
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    depthWrite: false,
  });
  const decal = new THREE.Mesh(geo, mat);
  decal.position.set(FINISH_X, DECAL_Y, centerZ);
  decal.receiveShadow = true;
  group.add(decal);

  // --- photo-finish posts ---------------------------------------------------
  const postGeo = new THREE.CylinderGeometry(0.05, 0.06, POST_HEIGHT, 12);
  const postMat = new THREE.MeshStandardMaterial({
    color: 0xf5f5f5,
    roughness: 0.5,
    metalness: 0.1,
  });
  const makePost = (z) => {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(FINISH_X, POST_HEIGHT / 2, z);
    post.castShadow = true;
    return post;
  };
  group.add(makePost(TRACK_INNER_RADIUS - 0.35)); // infield edge
  group.add(makePost(TRACK_OUTER_RADIUS + 0.35)); // outfield edge

  return {
    group,
    dispose: () => {
      geo.dispose();
      mat.dispose();
      tex.dispose();
      postGeo.dispose();
      postMat.dispose();
    },
  };
}
