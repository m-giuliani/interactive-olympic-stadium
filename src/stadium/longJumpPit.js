import * as THREE from "three";

import { makeGrainNormalMap } from "../utils/textures.js";
import {
  LJ_Z,
  LJ_RUNWAY_START_X,
  LJ_BOARD_X,
  LJ_PIT_START_X,
  LJ_PIT_END_X,
  LJ_RUNWAY_WIDTH,
  LJ_PIT_WIDTH,
} from "./config.js";

/**
 * The long jump facility: a brick-red run-up runway, a white takeoff board, and
 * a sand landing pit. The sand reuses the procedural grain normal map (CLAUDE.md
 * §5) so it reads as a rough granular surface under the floodlights.
 *
 * Geometry only — the LongJumpEvent drives the athlete over it.
 *
 * @returns {{ group: THREE.Group, dispose: () => void }}
 */
export function createLongJumpPit() {
  const group = new THREE.Group();
  group.name = "LongJump";
  const disposables = [];

  // --- Runway ----------------------------------------------------------------
  const runwayLen = LJ_BOARD_X - LJ_RUNWAY_START_X;
  const runwayGeo = new THREE.BoxGeometry(runwayLen, 0.04, LJ_RUNWAY_WIDTH);
  const runwayMat = new THREE.MeshStandardMaterial({
    color: 0xa8402b,
    roughness: 0.85,
  });
  const runway = new THREE.Mesh(runwayGeo, runwayMat);
  runway.position.set(LJ_RUNWAY_START_X + runwayLen / 2, 0.02, LJ_Z);
  runway.receiveShadow = true;
  group.add(runway);
  disposables.push(runwayGeo, runwayMat);

  // --- Takeoff board ---------------------------------------------------------
  const boardGeo = new THREE.BoxGeometry(0.3, 0.06, LJ_RUNWAY_WIDTH);
  const boardMat = new THREE.MeshStandardMaterial({
    color: 0xf3f3f3,
    roughness: 0.6,
  });
  const board = new THREE.Mesh(boardGeo, boardMat);
  board.position.set(LJ_BOARD_X, 0.04, LJ_Z);
  board.receiveShadow = true;
  group.add(board);
  disposables.push(boardGeo, boardMat);

  // --- Sand pit --------------------------------------------------------------
  const pitLen = LJ_PIT_END_X - LJ_PIT_START_X;
  const sandNormal = makeGrainNormalMap();
  sandNormal.repeat.set(10, 4);
  const sandGeo = new THREE.BoxGeometry(pitLen, 0.06, LJ_PIT_WIDTH);
  const sandMat = new THREE.MeshStandardMaterial({
    color: 0xd9c89b,
    normalMap: sandNormal,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 1.0,
  });
  const sand = new THREE.Mesh(sandGeo, sandMat);
  sand.position.set(LJ_PIT_START_X + pitLen / 2, 0.015, LJ_Z);
  sand.receiveShadow = true;
  group.add(sand);
  disposables.push(sandGeo, sandMat, sandNormal);

  // --- Pit kerb (thin dark frame around the sand) ----------------------------
  const kerbGeo = new THREE.BoxGeometry(pitLen + 0.5, 0.04, LJ_PIT_WIDTH + 0.5);
  const kerbMat = new THREE.MeshStandardMaterial({
    color: 0x3a3f47,
    roughness: 0.8,
  });
  const kerb = new THREE.Mesh(kerbGeo, kerbMat);
  kerb.position.set(LJ_PIT_START_X + pitLen / 2, 0.0, LJ_Z);
  kerb.receiveShadow = true;
  group.add(kerb);
  disposables.push(kerbGeo, kerbMat);

  return {
    group,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
