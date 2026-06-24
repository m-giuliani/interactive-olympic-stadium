import * as THREE from "three";

import { createField } from "./field.js";
import { createTrack } from "./track.js";
import { createApron } from "./apron.js";
import { createStands } from "./stands.js";
import { createExterior } from "./exterior.js";
import { createRoof } from "./roof.js";

/**
 * Assembles the whole stadium (field + track + stands + exterior + tensile roof)
 * into a single hierarchical group.
 *
 * Returns the group plus the roof's inner-rim light anchors (so the lighting rig
 * can hang its floodlight SpotLights there) and a dispose() that frees every GPU
 * resource (CLAUDE.md §6).
 *
 * @returns {{ group: THREE.Group, lightAnchors: THREE.Vector3[], dispose: () => void }}
 */
export function createStadium() {
  const group = new THREE.Group();
  group.name = "Stadium";

  const field = createField();
  const track = createTrack();
  const apron = createApron();
  const stands = createStands();
  const exterior = createExterior();
  const roof = createRoof();

  group.add(field.group);
  group.add(track.mesh);
  group.add(apron.group);
  group.add(stands.mesh);
  group.add(exterior.group);
  group.add(roof.group);

  const parts = [field, track, apron, stands, exterior, roof];

  return {
    group,
    lightAnchors: roof.rimLights,
    dispose: () => parts.forEach((p) => p.dispose()),
  };
}
