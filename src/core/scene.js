import * as THREE from "three";

/**
 * Creates the root scene. The background is a night colour as a fallback; the
 * procedural sky dome (stadium/environment.js) and the LightingManager swap the
 * real Day/Night atmosphere. No fog — the sky dome carries the look instead.
 *
 * Actual stadium geometry, lighting rig, and athletes are added by their own
 * modules — this file only owns the empty container.
 *
 * @returns {THREE.Scene}
 */
export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070d);
  return scene;
}
