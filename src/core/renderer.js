import * as THREE from "three";

/**
 * Creates the WebGL renderer for the experience.
 *
 * Shadow mapping is enabled here once (CLAUDE.md §6): individual meshes opt in
 * to casting/receiving shadows themselves. We use soft (PCF) shadows and an
 * ACES tone-map so the night-time lighting reads with good dynamic range.
 *
 * @param {HTMLElement} container element the canvas is appended to.
 * @returns {THREE.WebGLRenderer}
 */
export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });

  // Cap the pixel ratio at 2 — beyond that the GPU cost is rarely worth it.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);

  // Real-time soft shadows.
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Physically based output: linear working space + ACES tone mapping so the
  // floodlights and emissive LEDs (added later) don't blow out.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  container.appendChild(renderer.domElement);

  return renderer;
}
