import * as THREE from "three";

import { createField } from "./field.js";
import { createTrack } from "./track.js";
import { createStands } from "./stands.js";
import { createTowers } from "./towers.js";

/**
 * Assembles the whole stadium (field + track + stands + floodlight towers) into
 * a single hierarchical group.
 *
 * Returns the group plus the floodlight head positions (so the lighting rig can
 * place SpotLights there) and a dispose() that frees every GPU resource
 * (CLAUDE.md §6).
 *
 * @returns {{ group: THREE.Group, towerHeads: THREE.Vector3[], dispose: () => void }}
 */
export function createStadium() {
  const group = new THREE.Group();
  group.name = "Stadium";

  const field = createField();
  const track = createTrack();
  const stands = createStands();
  const towers = createTowers();

  group.add(field.group);
  group.add(track.mesh);
  group.add(stands.mesh);
  group.add(towers.group);

  const parts = [field, track, stands, towers];

  return {
    group,
    towerHeads: towers.headPositions,
    dispose: () => parts.forEach((p) => p.dispose()),
  };
}
