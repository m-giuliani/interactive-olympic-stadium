import * as THREE from "three";

import { BOWL_TOP_RADIUS } from "./config.js";

/**
 * The exterior environment that wraps the stadium so it no longer floats in a
 * black void (CLAUDE.md §8 enhancement). Inspired by Rome's Stadio Olimpico:
 * a dusk sky, a vast park of pine/cypress trees, and a distant city skyline.
 *
 * EVERYTHING is procedural — no imported models, no image textures (a deliberate
 * constraint to show technical proficiency). The sky is a gradient ShaderMaterial
 * on an inverted sphere; the ground is one big plane; the trees and buildings are
 * Three.js primitives placed via InstancedMesh so hundreds of them cost only a
 * handful of draw calls (performance, CLAUDE.md §8).
 *
 * Pass the scene in to also install a matching dusk fog + background so distant
 * trees and the skyline fade into the haze instead of ending on a hard edge.
 *
 * @param {THREE.Scene} [scene] optional — if given, its fog/background are set
 *   to a dusk haze that matches the sky's horizon colour.
 * @returns {{ group: THREE.Group, dispose: () => void }}
 */
export function createEnvironment(scene) {
  const group = new THREE.Group();
  group.name = "Environment";
  const disposables = [];

  // Shared dusk palette. The horizon haze doubles as the fog colour so the
  // ground and skyline melt seamlessly into the sky at the horizon line.
  const SKY_TOP = new THREE.Color(0x1b2a4a); // deep dusk blue overhead
  const SKY_HORIZON = new THREE.Color(0x5b6680); // greyish-blue dusk haze
  const SKY_WARM = new THREE.Color(0xe0915a); // warm sunset glow at the horizon

  // ---------------------------------------------------------------------------
  // 1. Procedural sky — a huge inverted sphere with a gradient shader.
  //    `fog: false` keeps it crisp; renderOrder -1 + depthWrite false draw it
  //    behind everything without ever occluding the scene.
  // ---------------------------------------------------------------------------
  const skyGeo = new THREE.SphereGeometry(2800, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: SKY_TOP },
      uHorizon: { value: SKY_HORIZON },
      uWarm: { value: SKY_WARM },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    // Colours are output in LINEAR space: the post-processing OutputPass applies
    // ACES tone mapping + sRGB at the end, exactly like the standard materials.
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uWarm;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;                                   // -1 (down) .. 1 (up)
        vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
        float glow = pow(1.0 - clamp(abs(h) / 0.14, 0.0, 1.0), 2.0);
        col = mix(col, uWarm, glow * 0.55);                 // warm band hugging horizon
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.name = "Sky";
  sky.renderOrder = -1;
  group.add(sky);
  disposables.push(skyGeo, skyMat);

  // Matching dusk atmosphere: fog the distance into the horizon haze.
  if (scene) {
    scene.fog = new THREE.FogExp2(SKY_HORIZON.getHex(), 0.0011);
    scene.background = SKY_HORIZON.clone();
  }

  // ---------------------------------------------------------------------------
  // 2. Soft outdoor fill. A hemisphere light (dusk sky above, dark grass below)
  //    keeps the park readable without harsh shadows. Kept low so it doesn't
  //    wash out the floodlights or the ceremony.
  // ---------------------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0x8aa0c8, 0x1a2a14, 0.45);
  group.add(hemi);

  // ---------------------------------------------------------------------------
  // 3. Exterior ground — one massive dark-green disc at exactly y = 0.
  //    polygonOffset pushes it a hair back in depth so the stadium's own floor
  //    layers (track/infield, all near y=0) win and never z-fight with it.
  // ---------------------------------------------------------------------------
  const groundGeo = new THREE.CircleGeometry(2500, 64);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x223d1c, // dark natural park green
    roughness: 1.0,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.name = "ExteriorGround";
  ground.rotation.x = -Math.PI / 2; // lay the disc flat
  ground.position.y = 0;
  ground.receiveShadow = false; // huge + far; the stadium handles its own shadows
  group.add(ground);
  disposables.push(groundGeo, groundMat);

  // A reusable dummy used to compose each instance's transform matrix.
  const dummy = new THREE.Object3D();

  // ---------------------------------------------------------------------------
  // 4. Procedural nature — pine/cypress trees scattered on the park ground.
  //    Each tree = brown trunk (Cylinder) + dark-green foliage (Cone). Two
  //    InstancedMeshes (all trunks, all cones) draw the whole forest in 2 calls.
  // ---------------------------------------------------------------------------
  const TREE_COUNT = 260;
  const TREE_MIN_RADIUS = BOWL_TOP_RADIUS + 30; // clear the stands (~126)
  const TREE_MAX_RADIUS = 650;

  // Bake the part offsets into the geometry so each tree is placed with a single
  // (position, rotation, uniform-scale) matrix and the parts stay stuck together.
  const TRUNK_H = 2.4;
  const CONE_H = 7.5;
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, TRUNK_H, 6);
  trunkGeo.translate(0, TRUNK_H / 2, 0); // base sits on the ground (y = 0)
  const coneGeo = new THREE.ConeGeometry(1.5, CONE_H, 7);
  coneGeo.translate(0, TRUNK_H + CONE_H / 2, 0); // foliage stacked on the trunk

  const trunkMat = new THREE.MeshStandardMaterial({
    color: 0x5b4636,
    roughness: 0.95,
    metalness: 0.0,
  });
  // Base white so per-instance instanceColor tints each tree's foliage directly.
  const coneMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.9,
    metalness: 0.0,
  });

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_COUNT);
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, TREE_COUNT);
  trunks.name = "TreeTrunks";
  cones.name = "TreeFoliage";

  const foliage = new THREE.Color();
  for (let i = 0; i < TREE_COUNT; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad =
      TREE_MIN_RADIUS + Math.random() * (TREE_MAX_RADIUS - TREE_MIN_RADIUS);
    const s = 0.7 + Math.random() * 0.9; // size variation

    dummy.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();

    trunks.setMatrixAt(i, dummy.matrix);
    cones.setMatrixAt(i, dummy.matrix);

    // Slight per-tree green variation so the forest isn't a flat colour.
    foliage.setHSL(0.28 + Math.random() * 0.05, 0.45, 0.18 + Math.random() * 0.1);
    cones.setColorAt(i, foliage);
  }
  trunks.instanceMatrix.needsUpdate = true;
  cones.instanceMatrix.needsUpdate = true;
  if (cones.instanceColor) cones.instanceColor.needsUpdate = true;
  group.add(trunks, cones);
  disposables.push(trunkGeo, trunkMat, coneGeo, coneMat);

  // ---------------------------------------------------------------------------
  // 5. Distant city skyline — grey boxes of varied size on a far ring. A minority
  //    use an emissive material to read as lit windows. Two InstancedMeshes
  //    (dark + lit) draw the whole skyline in 2 calls.
  // ---------------------------------------------------------------------------
  const SKYLINE_MIN_RADIUS = 950;
  const SKYLINE_MAX_RADIUS = 1250;
  const DARK_COUNT = 64;
  const LIT_COUNT = 24;

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0); // base on the ground; scale.y becomes the height

  const cityMat = new THREE.MeshStandardMaterial({
    color: 0x3a3f4a,
    roughness: 0.85,
    metalness: 0.05,
  });
  const litMat = new THREE.MeshStandardMaterial({
    color: 0x3a3f4a,
    emissive: 0xffcc66, // warm distant window light
    emissiveIntensity: 0.5,
    roughness: 0.85,
    metalness: 0.05,
  });

  const placeBuilding = (mesh, i) => {
    const ang = Math.random() * Math.PI * 2;
    const rad =
      SKYLINE_MIN_RADIUS +
      Math.random() * (SKYLINE_MAX_RADIUS - SKYLINE_MIN_RADIUS);
    const w = 18 + Math.random() * 40;
    const d = 18 + Math.random() * 40;
    const h = 40 + Math.random() * 130;

    dummy.position.set(Math.cos(ang) * rad, 0, Math.sin(ang) * rad);
    dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };

  const city = new THREE.InstancedMesh(boxGeo, cityMat, DARK_COUNT);
  const cityLit = new THREE.InstancedMesh(boxGeo, litMat, LIT_COUNT);
  city.name = "Skyline";
  cityLit.name = "SkylineLit";
  for (let i = 0; i < DARK_COUNT; i++) placeBuilding(city, i);
  for (let i = 0; i < LIT_COUNT; i++) placeBuilding(cityLit, i);
  city.instanceMatrix.needsUpdate = true;
  cityLit.instanceMatrix.needsUpdate = true;
  group.add(city, cityLit);
  disposables.push(boxGeo, cityMat, litMat);

  return {
    group,
    // Handles the GUI can poke at to demo the environment live.
    trees: [trunks, cones],
    skyline: [city, cityLit],
    fog: scene ? scene.fog : null,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
