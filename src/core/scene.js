import * as THREE from "three";

/**
 * Creates the root scene with a night-time atmosphere.
 *
 * Fog (CLAUDE.md §3, optional but cheap) fades the far stands into the dark so
 * the stadium feels enclosed and the floodlights have something to catch. The
 * background colour matches the page background to avoid a visible seam.
 *
 * Actual stadium geometry, lighting rig, and athletes are added by their own
 * modules — this file only owns the empty, atmospheric container.
 *
 * @returns {THREE.Scene}
 */
export function createScene() {
  const scene = new THREE.Scene();

  const night = new THREE.Color(0x05070d);
  scene.background = night;

  // Exponential fog reads better than linear for an outdoor night scene.
  scene.fog = new THREE.FogExp2(night, 0.0035);

  return scene;
}
