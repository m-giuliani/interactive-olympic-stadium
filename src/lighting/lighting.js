import * as THREE from "three";

/**
 * The stadium lighting rig (CLAUDE.md §8, priority 1).
 *
 * Layers:
 *  - HemisphereLight  : cool night sky / dark ground fill so shadows aren't black.
 *  - DirectionalLight : the "moon", the primary shadow caster.
 *  - SpotLight ×N     : floodlights hung on the tensile roof's inner rim, each
 *                       aimed down/inward at the pitch centre (0,0,0).
 *
 * Returns the light group plus references so later modules (GUI, ceremony) can
 * animate or toggle individual lights.
 *
 * @param {THREE.Vector3[]} lightAnchors world positions of the roof-rim floodlights.
 * @returns {{ group: THREE.Group, hemisphere, moon, floodlights, dispose: () => void }}
 */
export function createLighting(lightAnchors = []) {
  const group = new THREE.Group();
  group.name = "Lighting";

  // --- Ambient night fill ----------------------------------------------------
  const hemisphere = new THREE.HemisphereLight(0x33425e, 0x080808, 0.35);
  group.add(hemisphere);

  // --- Moonlight (primary shadow caster) ------------------------------------
  const moon = new THREE.DirectionalLight(0xaecbff, 0.6);
  moon.position.set(80, 120, 40);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 400;
  moon.shadow.camera.left = -140;
  moon.shadow.camera.right = 140;
  moon.shadow.camera.top = 140;
  moon.shadow.camera.bottom = -140;
  moon.shadow.bias = -0.0004;
  group.add(moon);
  group.add(moon.target); // target at origin

  // --- Floodlights hung on the tensile roof's inner rim ---------------------
  // Every spot points down/inward at the pitch centre (fixes the old outward-
  // pointing aim bug).
  const floodlights = [];
  const aim = new THREE.Vector3(0, 0, 0); // pitch centre
  lightAnchors.forEach((pos, i) => {
    // ~2.0 each: realistic combined stadium level across the 8 roof fixtures.
    const spot = new THREE.SpotLight(0xfff4e0, 2.0);
    spot.position.copy(pos);
    spot.angle = Math.PI / 5; // wide enough to wash the whole pitch
    spot.penumbra = 0.45;
    spot.decay = 0; // stadium floods read as near-parallel; skip inverse-square
    spot.distance = 0;

    // Only two of the eight cast shadows — enough for crisp athlete shadows on
    // the track without paying for many extra shadow maps every frame.
    if (i < 2) {
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.camera.near = 10;
      spot.shadow.camera.far = 260;
      spot.shadow.bias = -0.0006;
    }

    const target = new THREE.Object3D();
    target.position.copy(aim);
    group.add(target);
    spot.target = target;

    group.add(spot);
    floodlights.push(spot);
  });

  return {
    group,
    hemisphere,
    moon,
    floodlights,
    dispose: () => {
      moon.dispose();
      hemisphere.dispose();
      floodlights.forEach((s) => s.dispose());
    },
  };
}
