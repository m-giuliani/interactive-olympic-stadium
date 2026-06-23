import * as THREE from "three";

import { makeNetTexture } from "../utils/textures.js";
import {
  FB_GOAL_X,
  FB_GOAL_WIDTH,
  FB_GOAL_HEIGHT,
  FB_GOAL_DEPTH,
  FB_Z,
} from "./config.js";

/**
 * A regulation football goal (7.32 × 2.44 m): white posts + crossbar and a
 * semi-transparent net. The goal mouth faces +X (toward the centre); the net
 * sits behind it on the −X side.
 *
 * Geometry only — the FootballEvent drives the player and ball.
 *
 * @returns {{ group: THREE.Group, dispose: () => void }}
 */
export function createGoal() {
  const group = new THREE.Group();
  group.name = "Goal";
  const disposables = [];

  const halfW = FB_GOAL_WIDTH / 2;
  const backX = FB_GOAL_X - FB_GOAL_DEPTH;

  // --- Posts + crossbar ------------------------------------------------------
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0xf2f2f2,
    roughness: 0.5,
    metalness: 0.1,
  });
  const postGeo = new THREE.CylinderGeometry(0.06, 0.06, FB_GOAL_HEIGHT, 12);
  const barGeo = new THREE.CylinderGeometry(0.06, 0.06, FB_GOAL_WIDTH, 12);
  disposables.push(frameMat, postGeo, barGeo);

  for (const z of [-halfW, halfW]) {
    const post = new THREE.Mesh(postGeo, frameMat);
    post.position.set(FB_GOAL_X, FB_GOAL_HEIGHT / 2, FB_Z + z);
    post.castShadow = true;
    group.add(post);
  }
  const bar = new THREE.Mesh(barGeo, frameMat);
  bar.rotation.x = Math.PI / 2; // align the cylinder along Z
  bar.position.set(FB_GOAL_X, FB_GOAL_HEIGHT, FB_Z);
  bar.castShadow = true;
  group.add(bar);

  // --- Net (back, top, two sides) -------------------------------------------
  const netTex = makeNetTexture();
  const netMat = new THREE.MeshStandardMaterial({
    map: netTex,
    transparent: true,
    side: THREE.DoubleSide,
    roughness: 1.0,
    depthWrite: false,
  });
  disposables.push(netTex, netMat);

  const addNet = (geo, repeatX, repeatY, place) => {
    const tex = netTex.clone();
    tex.needsUpdate = true;
    tex.repeat.set(repeatX, repeatY);
    const mat = netMat.clone();
    mat.map = tex;
    const mesh = new THREE.Mesh(geo, mat);
    place(mesh);
    group.add(mesh);
    disposables.push(geo, mat, tex);
  };

  // Back (vertical, faces +X)
  addNet(
    new THREE.PlaneGeometry(FB_GOAL_WIDTH, FB_GOAL_HEIGHT),
    7,
    2,
    (m) => {
      m.rotation.y = Math.PI / 2;
      m.position.set(backX, FB_GOAL_HEIGHT / 2, FB_Z);
    },
  );
  // Top (horizontal)
  addNet(
    new THREE.PlaneGeometry(FB_GOAL_DEPTH, FB_GOAL_WIDTH),
    2,
    7,
    (m) => {
      m.rotation.x = -Math.PI / 2;
      m.position.set(FB_GOAL_X - FB_GOAL_DEPTH / 2, FB_GOAL_HEIGHT, FB_Z);
    },
  );
  // Sides (vertical, in XY planes at ±halfW)
  for (const z of [-halfW, halfW]) {
    addNet(
      new THREE.PlaneGeometry(FB_GOAL_DEPTH, FB_GOAL_HEIGHT),
      2,
      2,
      (m) => {
        m.position.set(FB_GOAL_X - FB_GOAL_DEPTH / 2, FB_GOAL_HEIGHT / 2, FB_Z + z);
      },
    );
  }

  return {
    group,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
