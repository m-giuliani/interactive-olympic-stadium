import * as THREE from "three";

/**
 * The exterior environment that wraps the stadium so it no longer floats in a
 * black void. Fully procedural — no imported models, no image textures.
 *
 * It owns a Day/Night sky: a gradient sky dome plus celestial bodies that swap
 * with the lighting state — a bright blue sky with a sun and drifting clouds at
 * noon, a dark sky with a moon and a field of stars at night. The
 * {@link LightingManager} drives the switch via {@link setDayNight}.
 *
 * @returns {{ group: THREE.Group, setDayNight: (isDay: boolean) => void,
 *             dispose: () => void }}
 */

// Sky gradient palettes (LINEAR space; the post OutputPass tone-maps + sRGBs).
const DAY_SKY_TOP = new THREE.Color(0x2b6fd6); // clear blue overhead at noon
const DAY_SKY_HORIZON = new THREE.Color(0xbfe0f5); // pale haze at the horizon
const NIGHT_SKY_TOP = new THREE.Color(0x05080f); // near-black zenith
const NIGHT_SKY_HORIZON = new THREE.Color(0x141d33); // faint blue glow low down

// Directions the sun / moon sit in, matched to the DirectionalLight positions
// the LightingManager uses for each state so the cast light agrees with what's
// visibly in the sky.
const SUN_DIR = new THREE.Vector3(-150, 120, 50).normalize();
const MOON_DIR = new THREE.Vector3(-100, 50, -100).normalize();
const SKY_BODY_DISTANCE = 2200; // sits inside the 2800 sky dome

export function createEnvironment() {
  const group = new THREE.Group();
  group.name = "Environment";
  const disposables = [];

  // ---------------------------------------------------------------------------
  // 1. Procedural sky — a huge inverted sphere with a top→horizon gradient.
  //    The two colours are uniforms so setDayNight() can repaint it instantly.
  //    renderOrder -1 + depthWrite false keep it behind everything.
  // ---------------------------------------------------------------------------
  const skyGeo = new THREE.SphereGeometry(2800, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: NIGHT_SKY_TOP.clone() },
      uHorizon: { value: NIGHT_SKY_HORIZON.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);          // 0 at horizon, 1 overhead
        vec3 col = mix(uHorizon, uTop, pow(h, 0.5));
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.name = "Sky";
  sky.renderOrder = -1;
  group.add(sky);
  disposables.push(skyGeo, skyMat);

  // ---------------------------------------------------------------------------
  // 2. Exterior ground — one massive dark-green disc at exactly y = 0.
  //    polygonOffset pushes it a hair back so the stadium floor never z-fights.
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
  group.add(ground);
  disposables.push(groundGeo, groundMat);

  // ---------------------------------------------------------------------------
  // 3. Sun (day only) — a bright core disc with a soft additive halo, parked in
  //    the sky along the daytime light direction.
  // ---------------------------------------------------------------------------
  const sun = new THREE.Group();
  sun.name = "Sun";
  const sunCoreGeo = new THREE.SphereGeometry(95, 24, 16);
  const sunCoreMat = new THREE.MeshBasicMaterial({ color: 0xfff3bf, fog: false });
  sun.add(new THREE.Mesh(sunCoreGeo, sunCoreMat));
  const sunHaloGeo = new THREE.SphereGeometry(175, 24, 16);
  const sunHaloMat = new THREE.MeshBasicMaterial({
    color: 0xffe39a,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  sun.add(new THREE.Mesh(sunHaloGeo, sunHaloMat));
  sun.position.copy(SUN_DIR).multiplyScalar(SKY_BODY_DISTANCE);
  group.add(sun);
  disposables.push(sunCoreGeo, sunCoreMat, sunHaloGeo, sunHaloMat);

  // ---------------------------------------------------------------------------
  // 4. Clouds (day only) — clusters of flat white puffs scattered high up. One
  //    shared geometry + material; clusters are plain Meshes (cheap, ~40 total).
  // ---------------------------------------------------------------------------
  const clouds = new THREE.Group();
  clouds.name = "Clouds";
  const puffGeo = new THREE.SphereGeometry(1, 12, 8);
  const puffMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    fog: false,
  });
  const CLOUD_COUNT = 9;
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const cluster = new THREE.Group();
    const ang = Math.random() * Math.PI * 2;
    const rad = 500 + Math.random() * 1100;
    cluster.position.set(
      Math.cos(ang) * rad,
      380 + Math.random() * 260,
      Math.sin(ang) * rad,
    );
    const puffs = 4 + Math.floor(Math.random() * 4);
    for (let p = 0; p < puffs; p++) {
      const puff = new THREE.Mesh(puffGeo, puffMat);
      puff.position.set(
        (Math.random() - 0.5) * 160,
        (Math.random() - 0.5) * 30,
        (Math.random() - 0.5) * 80,
      );
      // Flatten each puff so the cluster reads as a horizontal cloud, not balls.
      puff.scale.set(
        40 + Math.random() * 50,
        18 + Math.random() * 16,
        30 + Math.random() * 40,
      );
      cluster.add(puff);
    }
    clouds.add(cluster);
  }
  group.add(clouds);
  disposables.push(puffGeo, puffMat);

  // ---------------------------------------------------------------------------
  // 5. Moon (night only) — a pale disc with a faint halo along the night light
  //    direction.
  // ---------------------------------------------------------------------------
  const moon = new THREE.Group();
  moon.name = "Moon";
  const moonCoreGeo = new THREE.SphereGeometry(80, 24, 16);
  const moonCoreMat = new THREE.MeshBasicMaterial({ color: 0xeae6d0, fog: false });
  moon.add(new THREE.Mesh(moonCoreGeo, moonCoreMat));
  const moonHaloGeo = new THREE.SphereGeometry(130, 24, 16);
  const moonHaloMat = new THREE.MeshBasicMaterial({
    color: 0xaab6d8,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });
  moon.add(new THREE.Mesh(moonHaloGeo, moonHaloMat));
  moon.position.copy(MOON_DIR).multiplyScalar(SKY_BODY_DISTANCE);
  group.add(moon);
  disposables.push(moonCoreGeo, moonCoreMat, moonHaloGeo, moonHaloMat);

  // ---------------------------------------------------------------------------
  // 6. Stars (night only) — a Points field on a sphere just inside the dome.
  // ---------------------------------------------------------------------------
  const STAR_COUNT = 1500;
  const starPositions = new Float32Array(STAR_COUNT * 3);
  const starV = new THREE.Vector3();
  for (let i = 0; i < STAR_COUNT; i++) {
    // Random direction biased to the upper hemisphere (visible above the ground).
    starV.set(
      Math.random() * 2 - 1,
      Math.random() * 0.9 + 0.05,
      Math.random() * 2 - 1,
    );
    if (starV.lengthSq() < 1e-4) starV.set(0, 1, 0);
    starV.normalize().multiplyScalar(2700);
    starPositions[i * 3] = starV.x;
    starPositions[i * 3 + 1] = starV.y;
    starPositions[i * 3 + 2] = starV.z;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 2.2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    fog: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.name = "Stars";
  group.add(stars);
  disposables.push(starGeo, starMat);

  /**
   * Swap the whole sky between noon and 10 pm: repaint the gradient and show the
   * sun + clouds (day) or the moon + stars (night).
   * @param {boolean} isDay
   */
  function setDayNight(isDay) {
    skyMat.uniforms.uTop.value.copy(isDay ? DAY_SKY_TOP : NIGHT_SKY_TOP);
    skyMat.uniforms.uHorizon.value.copy(
      isDay ? DAY_SKY_HORIZON : NIGHT_SKY_HORIZON,
    );
    sun.visible = isDay;
    clouds.visible = isDay;
    moon.visible = !isDay;
    stars.visible = !isDay;
  }

  // The scene boots at night (10 pm) to match the LightingManager's default.
  setDayNight(false);

  return {
    group,
    setDayNight,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
