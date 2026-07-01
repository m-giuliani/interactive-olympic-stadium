import * as THREE from "three";

import { BOWL_TOP_RADIUS } from "./config.js";

/**
 * ExteriorCampus
 *
 * Static Olympic Park foreground outside the stadium building. The composition
 * is organized around the +Z ceremonial approach: a premium plaza, a double
 * avenue of international flags, structured greenery, public furniture,
 * lighting-ready emissive objects, and future ceremony anchor points.
 *
 * @returns {{ group: THREE.Group, dispose: () => void }}
 */

const CAMPUS_Y = 0.045;
const HERO_Z = BOWL_TOP_RADIUS;
const PLAZA_CENTER_Z = HERO_Z + 50;
const AXIS_START_Z = HERO_Z + 28;
const AXIS_END_Z = HERO_Z + 255;
const AXIS_CENTER_Z = (AXIS_START_Z + AXIS_END_Z) / 2;
const AXIS_LENGTH = AXIS_END_Z - AXIS_START_Z;

export function createExteriorCampus() {
  const group = new THREE.Group();
  group.name = "ExteriorCampus";
  const disposables = [];

  const geometries = createSharedGeometries(disposables);
  const materials = createSharedMaterials(disposables);

  group.add(
    createPlazaCore(geometries, materials),
    createOlympicFlagAvenue(geometries, materials),
    createGreenPark(geometries, materials),
    createPublicFurniture(geometries, materials),
    createExteriorLightingPlaceholders(geometries, materials),
    createCeremonyExteriorAnchors(geometries, materials),
  );

  return {
    group,
    dispose: () => disposables.forEach((item) => item.dispose()),
  };
}

function createSharedGeometries(disposables) {
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    thinBox: new THREE.BoxGeometry(1, 0.08, 1),
    pole: new THREE.CylinderGeometry(0.08, 0.08, 1, 10),
    bollard: new THREE.CylinderGeometry(0.18, 0.24, 1, 12),
    lampHead: new THREE.SphereGeometry(0.32, 12, 8),
    treeTrunk: new THREE.CylinderGeometry(0.28, 0.42, 1, 8),
    treeCrown: new THREE.ConeGeometry(1, 1, 10),
    treeCrownRound: new THREE.SphereGeometry(1, 10, 8),
    bush: new THREE.SphereGeometry(1, 10, 8),
    flower: new THREE.SphereGeometry(0.16, 8, 6),
    ring: new THREE.TorusGeometry(1, 0.08, 8, 32),
  };
  disposables.push(...Object.values(geometries));
  return geometries;
}

function createSharedMaterials(disposables) {
  const materials = {
    pavement: new THREE.MeshStandardMaterial({
      color: 0xbdb8ad,
      roughness: 0.88,
      metalness: 0.0,
    }),
    pavementLight: new THREE.MeshStandardMaterial({
      color: 0xd4d0c6,
      roughness: 0.84,
      metalness: 0.0,
    }),
    pavingDark: new THREE.MeshStandardMaterial({
      color: 0x6f7474,
      roughness: 0.86,
      metalness: 0.0,
    }),
    asphalt: new THREE.MeshStandardMaterial({
      color: 0x30353a,
      roughness: 0.92,
      metalness: 0.0,
    }),
    curb: new THREE.MeshStandardMaterial({
      color: 0x8d8980,
      roughness: 0.82,
      metalness: 0.0,
    }),
    accentGold: new THREE.MeshStandardMaterial({
      color: 0xd8a928,
      emissive: 0x5a3b05,
      emissiveIntensity: 0.36,
      roughness: 0.45,
      metalness: 0.12,
    }),
    olympicBlue: new THREE.MeshStandardMaterial({
      color: 0x1769d1,
      emissive: 0x082b5c,
      emissiveIntensity: 0.2,
      roughness: 0.55,
      metalness: 0.0,
    }),
    olympicYellow: new THREE.MeshStandardMaterial({
      color: 0xd8a928,
      roughness: 0.55,
      metalness: 0.0,
    }),
    olympicBlack: new THREE.MeshStandardMaterial({
      color: 0x14171b,
      roughness: 0.55,
      metalness: 0.08,
    }),
    olympicGreen: new THREE.MeshStandardMaterial({
      color: 0x1f8f4d,
      roughness: 0.72,
      metalness: 0.0,
    }),
    olympicRed: new THREE.MeshStandardMaterial({
      color: 0xc62828,
      emissive: 0x4d0909,
      emissiveIntensity: 0.18,
      roughness: 0.55,
      metalness: 0.0,
    }),
    flagWhite: new THREE.MeshStandardMaterial({
      color: 0xf2f2ec,
      roughness: 0.72,
      metalness: 0.0,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x747b80,
      roughness: 0.48,
      metalness: 0.55,
    }),
    darkMetal: new THREE.MeshStandardMaterial({
      color: 0x252b30,
      roughness: 0.5,
      metalness: 0.45,
    }),
    ledCyan: new THREE.MeshStandardMaterial({
      color: 0x2edcff,
      emissive: 0x2edcff,
      emissiveIntensity: 1.35,
      roughness: 0.3,
      metalness: 0.0,
    }),
    ledWarm: new THREE.MeshStandardMaterial({
      color: 0xffc36a,
      emissive: 0xffa85c,
      emissiveIntensity: 1.0,
      roughness: 0.34,
      metalness: 0.0,
    }),
    lawn: new THREE.MeshStandardMaterial({
      color: 0x315823,
      roughness: 1.0,
      metalness: 0.0,
    }),
    leaf: new THREE.MeshStandardMaterial({
      color: 0x2f6b32,
      roughness: 0.92,
      metalness: 0.0,
    }),
    leafDark: new THREE.MeshStandardMaterial({
      color: 0x244c27,
      roughness: 0.95,
      metalness: 0.0,
    }),
    hedge: new THREE.MeshStandardMaterial({
      color: 0x214824,
      roughness: 0.95,
      metalness: 0.0,
    }),
    trunk: new THREE.MeshStandardMaterial({
      color: 0x6a4024,
      roughness: 0.9,
      metalness: 0.0,
    }),
    flowerRed: new THREE.MeshStandardMaterial({
      color: 0xd43d4c,
      roughness: 0.8,
      metalness: 0.0,
    }),
    flowerYellow: new THREE.MeshStandardMaterial({
      color: 0xe3bd39,
      roughness: 0.8,
      metalness: 0.0,
    }),
    flowerWhite: new THREE.MeshStandardMaterial({
      color: 0xf2eee5,
      roughness: 0.8,
      metalness: 0.0,
    }),
  };
  disposables.push(...Object.values(materials));
  return materials;
}

function createPlazaCore(geometries, materials) {
  const group = new THREE.Group();
  group.name = "PlazaCore";

  addBox(group, geometries.box, materials.pavement, [184, 0.08, 92], [0, CAMPUS_Y, PLAZA_CENTER_Z]);
  addBox(group, geometries.box, materials.pavementLight, [150, 0.09, 54], [0, CAMPUS_Y + 0.01, HERO_Z + 45]);
  addBox(group, geometries.box, materials.pavingDark, [62, 0.1, AXIS_LENGTH], [0, CAMPUS_Y + 0.012, AXIS_CENTER_Z]);
  addBox(group, geometries.box, materials.pavementLight, [38, 0.11, AXIS_LENGTH - 20], [0, CAMPUS_Y + 0.024, AXIS_CENTER_Z + 5]);

  addPavingBands(group, geometries, materials);
  addOlympicGroundRings(group, geometries, materials);
  addEntranceStepsAndRamps(group, geometries, materials);
  addCurbsAndRaisedEdges(group, geometries, materials);

  return group;
}

function addPavingBands(group, geometries, materials) {
  const zBands = [
    HERO_Z + 26,
    HERO_Z + 36,
    HERO_Z + 50,
    HERO_Z + 68,
    HERO_Z + 92,
    HERO_Z + 124,
    HERO_Z + 158,
    HERO_Z + 198,
    HERO_Z + 238,
  ];
  for (const z of zBands) {
    addBox(group, geometries.box, materials.pavingDark, [138, 0.11, 1.2], [0, CAMPUS_Y + 0.045, z]);
  }

  for (const x of [-24, 24]) {
    addBox(group, geometries.box, materials.accentGold, [1.05, 0.12, AXIS_LENGTH - 18], [x, CAMPUS_Y + 0.055, AXIS_CENTER_Z + 4]);
  }
  for (const x of [-42, 42]) {
    addBox(group, geometries.box, materials.curb, [1.2, 0.24, AXIS_LENGTH + 16], [x, 0.16, AXIS_CENTER_Z]);
  }
}

function addOlympicGroundRings(group, geometries, materials) {
  const ringData = [
    [-9.2, 0, materials.olympicBlue],
    [0, 0, materials.olympicBlack],
    [9.2, 0, materials.olympicRed],
    [-4.6, -4.8, materials.olympicYellow],
    [4.6, -4.8, materials.olympicGreen],
  ];
  const ringGroup = new THREE.Group();
  ringGroup.name = "OlympicGroundRings";
  for (const [x, zOffset, material] of ringData) {
    const ring = new THREE.Mesh(geometries.ring, material);
    ring.name = "PlazaOlympicRing";
    ring.position.set(x, CAMPUS_Y + 0.13, HERO_Z + 63 + zOffset);
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(4.2);
    ring.receiveShadow = true;
    ringGroup.add(ring);
  }
  group.add(ringGroup);
}

function addEntranceStepsAndRamps(group, geometries, materials) {
  for (let step = 0; step < 6; step++) {
    addBox(
      group,
      geometries.box,
      step % 2 === 0 ? materials.pavementLight : materials.pavement,
      [142 - step * 10, 0.18, 1.55],
      [0, 0.11 + step * 0.17, HERO_Z + 14 + step * 2.0],
    );
  }

  for (const x of [-67, 67]) {
    addBox(group, geometries.box, materials.pavementLight, [18, 0.16, 34], [x, 0.13, HERO_Z + 31], x > 0 ? 0.08 : -0.08);
    addBox(group, geometries.box, materials.accentGold, [1.2, 0.18, 32], [x - Math.sign(x) * 8.5, 0.22, HERO_Z + 31]);
  }
}

function addCurbsAndRaisedEdges(group, geometries, materials) {
  for (const z of [HERO_Z + 4, HERO_Z + 96]) {
    addBox(group, geometries.box, materials.curb, [188, 0.32, 1.4], [0, 0.2, z]);
  }
  for (const x of [-92, 92]) {
    addBox(group, geometries.box, materials.curb, [1.4, 0.32, 92], [x, 0.2, PLAZA_CENTER_Z]);
  }
}

function createOlympicFlagAvenue(geometries, materials) {
  const group = new THREE.Group();
  group.name = "OlympicFlagAvenue";

  const flagCountPerSide = 16;
  const totalFlags = flagCountPerSide * 2;
  const poleMesh = new THREE.InstancedMesh(geometries.pole, materials.metal, totalFlags);
  const baseMesh = new THREE.InstancedMesh(geometries.box, materials.pavingDark, totalFlags);
  const stripeMeshes = createFlagStripeMeshes(geometries, materials, totalFlags);

  poleMesh.name = "FlagAvenuePoles";
  baseMesh.name = "FlagAvenueBases";

  const dummy = new THREE.Object3D();
  const stripeCounters = new Array(stripeMeshes.length).fill(0);
  let instanceIndex = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < flagCountPerSide; i++) {
      const t = i / (flagCountPerSide - 1);
      const x = side * 36;
      const z = THREE.MathUtils.lerp(HERO_Z + 38, AXIS_END_Z - 12, t);

      setInstance(dummy, poleMesh, instanceIndex, [x, 5.9, z], [1, 11.8, 1]);
      setInstance(dummy, baseMesh, instanceIndex, [x, 0.18, z], [3.1, 0.36, 3.1]);

      const colors = flagPalette(instanceIndex);
      for (let stripe = 0; stripe < 3; stripe++) {
        const mesh = stripeMeshes[colors[stripe]];
        const stripeIndex = stripeCounters[colors[stripe]]++;
        const y = 9.45 - stripe * 0.9;
        setInstance(
          dummy,
          mesh,
          stripeIndex,
          [x + side * 2.35, y, z],
          [4.9, 0.84, 0.08],
          [0, side > 0 ? Math.PI : 0, 0],
        );
      }

      instanceIndex += 1;
    }
  }

  poleMesh.instanceMatrix.needsUpdate = true;
  baseMesh.instanceMatrix.needsUpdate = true;
  stripeMeshes.forEach((mesh, index) => {
    mesh.count = stripeCounters[index];
    mesh.instanceMatrix.needsUpdate = true;
  });
  group.add(poleMesh, baseMesh, ...stripeMeshes);
  return group;
}

function createFlagStripeMeshes(geometries, materials, totalFlags) {
  const capacity = totalFlags * 3;
  const meshes = [
    new THREE.InstancedMesh(geometries.box, materials.olympicBlue, capacity),
    new THREE.InstancedMesh(geometries.box, materials.olympicYellow, capacity),
    new THREE.InstancedMesh(geometries.box, materials.flagWhite, capacity),
    new THREE.InstancedMesh(geometries.box, materials.olympicRed, capacity),
    new THREE.InstancedMesh(geometries.box, materials.olympicGreen, capacity),
    new THREE.InstancedMesh(geometries.box, materials.olympicBlack, capacity),
  ];
  meshes.forEach((mesh, index) => {
    mesh.name = `FlagStripeColor${index + 1}`;
  });
  return meshes;
}

function flagPalette(index) {
  const palettes = [
    [0, 2, 3],
    [4, 2, 0],
    [3, 2, 4],
    [0, 1, 2],
    [2, 3, 0],
    [5, 1, 3],
    [4, 1, 2],
    [0, 2, 4],
  ];
  return palettes[index % palettes.length];
}

function createGreenPark(geometries, materials) {
  const group = new THREE.Group();
  group.name = "GreenPark";

  addLawnZones(group, geometries, materials);
  addTreeRows(group, geometries, materials);
  addHedges(group, geometries, materials);
  addBushesAndFlowers(group, geometries, materials);

  return group;
}

function addLawnZones(group, geometries, materials) {
  const lawnZones = [
    [-112, HERO_Z + 58, 36, 96],
    [112, HERO_Z + 58, 36, 96],
    [-126, HERO_Z + 176, 42, 126],
    [126, HERO_Z + 176, 42, 126],
    [0, AXIS_END_Z + 20, 122, 34],
  ];
  for (const [x, z, sx, sz] of lawnZones) {
    addBox(group, geometries.box, materials.lawn, [sx, 0.05, sz], [x, CAMPUS_Y - 0.02, z]);
  }
}

function addTreeRows(group, geometries, materials) {
  const treePositions = [];
  const rows = [
    { x: -98, start: HERO_Z + 38, count: 10, spacing: 16 },
    { x: -126, start: HERO_Z + 58, count: 9, spacing: 18 },
    { x: 98, start: HERO_Z + 38, count: 10, spacing: 16 },
    { x: 126, start: HERO_Z + 58, count: 9, spacing: 18 },
  ];

  rows.forEach((row, rowIndex) => {
    for (let i = 0; i < row.count; i++) {
      const z = row.start + i * row.spacing;
      const sideOffset = i % 2 === 0 ? 0 : Math.sign(row.x) * 5;
      const scale = 0.82 + ((i + rowIndex) % 3) * 0.1;
      treePositions.push([row.x + sideOffset, z, scale, (i + rowIndex) % 2]);
    }
  });

  const trunkMesh = new THREE.InstancedMesh(geometries.treeTrunk, materials.trunk, treePositions.length);
  const crownMesh = new THREE.InstancedMesh(geometries.treeCrown, materials.leafDark, treePositions.length);
  const roundCrownMesh = new THREE.InstancedMesh(geometries.treeCrownRound, materials.leaf, treePositions.length);
  trunkMesh.name = "CampusTreeTrunks";
  crownMesh.name = "CampusTreeCrowns";
  roundCrownMesh.name = "CampusTreeRoundCrowns";

  const dummy = new THREE.Object3D();
  treePositions.forEach(([x, z, scale, variant], index) => {
    setInstance(dummy, trunkMesh, index, [x, 2.15 * scale, z], [1.1 * scale, 4.3 * scale, 1.1 * scale], [0, index * 0.47, 0]);
    setInstance(dummy, crownMesh, index, [x, 6.0 * scale, z], [2.7 * scale, 6.1 * scale, 2.7 * scale], [0, index * 0.73, 0]);
    setInstance(
      dummy,
      roundCrownMesh,
      index,
      [x + 1.0 * scale, 4.85 * scale, z - 0.8 * scale],
      [(variant ? 2.0 : 1.65) * scale, (variant ? 2.0 : 1.65) * scale, (variant ? 2.0 : 1.65) * scale],
      [0, index * 0.33, 0],
    );
  });

  trunkMesh.instanceMatrix.needsUpdate = true;
  crownMesh.instanceMatrix.needsUpdate = true;
  roundCrownMesh.instanceMatrix.needsUpdate = true;
  group.add(trunkMesh, crownMesh, roundCrownMesh);
}

function addHedges(group, geometries, materials) {
  const hedgeData = [
    [-70, HERO_Z + 82, 1.7, 1.2, 86],
    [70, HERO_Z + 82, 1.7, 1.2, 86],
    [-70, HERO_Z + 170, 1.7, 1.2, 92],
    [70, HERO_Z + 170, 1.7, 1.2, 92],
    [-112, HERO_Z + 112, 42, 1.2, 1.7],
    [112, HERO_Z + 112, 42, 1.2, 1.7],
  ];
  const hedgeMesh = new THREE.InstancedMesh(geometries.box, materials.hedge, hedgeData.length);
  hedgeMesh.name = "CampusHedges";
  const dummy = new THREE.Object3D();
  hedgeData.forEach(([x, z, sx, sy, sz], index) => {
    setInstance(dummy, hedgeMesh, index, [x, sy / 2, z], [sx, sy, sz]);
  });
  hedgeMesh.instanceMatrix.needsUpdate = true;
  group.add(hedgeMesh);
}

function addBushesAndFlowers(group, geometries, materials) {
  const bushPositions = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 16; i++) {
      bushPositions.push([side * (74 + (i % 4) * 6), HERO_Z + 38 + i * 10, 0.75 + (i % 3) * 0.08]);
    }
  }
  const bushMesh = new THREE.InstancedMesh(geometries.bush, materials.hedge, bushPositions.length);
  bushMesh.name = "CampusBushes";
  const dummy = new THREE.Object3D();
  bushPositions.forEach(([x, z, scale], index) => {
    setInstance(dummy, bushMesh, index, [x, 0.75, z], [2.1 * scale, 0.72 * scale, 1.35 * scale], [0, index * 0.4, 0]);
  });
  bushMesh.instanceMatrix.needsUpdate = true;

  const flowerPositions = [];
  for (const side of [-1, 1]) {
    for (let bed = 0; bed < 4; bed++) {
      const centerX = side * 54;
      const centerZ = HERO_Z + 42 + bed * 34;
      addBox(group, geometries.box, materials.pavingDark, [18, 0.16, 4.6], [centerX, 0.09, centerZ]);
      for (let i = 0; i < 12; i++) {
        flowerPositions.push([centerX - 7 + i * 1.25, centerZ + ((i + bed) % 3 - 1) * 0.65, i % 3]);
      }
    }
  }

  const flowerMeshes = [
    new THREE.InstancedMesh(geometries.flower, materials.flowerRed, flowerPositions.length),
    new THREE.InstancedMesh(geometries.flower, materials.flowerYellow, flowerPositions.length),
    new THREE.InstancedMesh(geometries.flower, materials.flowerWhite, flowerPositions.length),
  ];
  const flowerCounts = [0, 0, 0];
  flowerPositions.forEach(([x, z, materialIndex]) => {
    const mesh = flowerMeshes[materialIndex];
    const flowerIndex = flowerCounts[materialIndex]++;
    setInstance(dummy, mesh, flowerIndex, [x, 0.45, z], [1.2, 0.55, 1.2]);
  });
  flowerMeshes.forEach((mesh, index) => {
    mesh.name = `FlowerAccent${index + 1}`;
    mesh.count = flowerCounts[index];
    mesh.instanceMatrix.needsUpdate = true;
  });

  group.add(bushMesh, ...flowerMeshes);
}

function createPublicFurniture(geometries, materials) {
  const group = new THREE.Group();
  group.name = "PublicFurniture";

  addBenches(group, geometries, materials);
  addBollards(group, geometries, materials);
  addBarriers(group, geometries, materials);
  addInfoSigns(group, geometries, materials);
  addTrashBins(group, geometries, materials);
  addBikeRacks(group, geometries, materials);

  return group;
}

function addBenches(group, geometries, materials) {
  const positions = [];
  for (const side of [-1, 1]) {
    for (const z of [HERO_Z + 50, HERO_Z + 82, HERO_Z + 124, HERO_Z + 166, HERO_Z + 210]) {
      positions.push([side * 55, z, side > 0 ? Math.PI : 0]);
    }
  }
  const seatMesh = new THREE.InstancedMesh(geometries.box, materials.darkMetal, positions.length);
  const backMesh = new THREE.InstancedMesh(geometries.box, materials.metal, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach(([x, z, rotationY], index) => {
    setInstance(dummy, seatMesh, index, [x, 0.68, z], [5.8, 0.32, 1.15], [0, rotationY, 0]);
    setInstance(dummy, backMesh, index, [x, 1.25, z - Math.cos(rotationY) * 0.55], [5.8, 1.25, 0.22], [0, rotationY, 0]);
  });
  seatMesh.name = "CampusBenchSeats";
  backMesh.name = "CampusBenchBacks";
  seatMesh.instanceMatrix.needsUpdate = true;
  backMesh.instanceMatrix.needsUpdate = true;
  group.add(seatMesh, backMesh);
}

function addBollards(group, geometries, materials) {
  const positions = [];
  for (const z of [HERO_Z + 18, HERO_Z + 30, HERO_Z + 42, HERO_Z + 54, HERO_Z + 66, HERO_Z + 78, HERO_Z + 90]) {
    positions.push([-48, z], [48, z]);
  }
  const bollardMesh = new THREE.InstancedMesh(geometries.bollard, materials.darkMetal, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach(([x, z], index) => {
    setInstance(dummy, bollardMesh, index, [x, 0.55, z], [1, 1.1, 1]);
  });
  bollardMesh.name = "CampusBollards";
  bollardMesh.instanceMatrix.needsUpdate = true;
  group.add(bollardMesh);
}

function addBarriers(group, geometries, materials) {
  const positions = [
    [-84, HERO_Z + 20, Math.PI / 2],
    [84, HERO_Z + 20, Math.PI / 2],
    [-84, HERO_Z + 92, Math.PI / 2],
    [84, HERO_Z + 92, Math.PI / 2],
  ];
  const barrierMesh = new THREE.InstancedMesh(geometries.box, materials.metal, positions.length);
  const stripeMesh = new THREE.InstancedMesh(geometries.box, materials.accentGold, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach(([x, z, rotationY], index) => {
    setInstance(dummy, barrierMesh, index, [x, 0.8, z], [11, 1.2, 0.28], [0, rotationY, 0]);
    setInstance(dummy, stripeMesh, index, [x, 1.08, z], [10.2, 0.18, 0.32], [0, rotationY, 0]);
  });
  barrierMesh.name = "CampusBarriers";
  stripeMesh.name = "CampusBarrierGoldStripes";
  barrierMesh.instanceMatrix.needsUpdate = true;
  stripeMesh.instanceMatrix.needsUpdate = true;
  group.add(barrierMesh, stripeMesh);
}

function addInfoSigns(group, geometries, materials) {
  const positions = [
    [-66, HERO_Z + 34],
    [66, HERO_Z + 34],
    [-62, HERO_Z + 116],
    [62, HERO_Z + 116],
  ];
  const postMesh = new THREE.InstancedMesh(geometries.pole, materials.darkMetal, positions.length);
  const panelMesh = new THREE.InstancedMesh(geometries.box, materials.olympicBlue, positions.length);
  const lineMesh = new THREE.InstancedMesh(geometries.box, materials.flagWhite, positions.length * 2);
  const dummy = new THREE.Object3D();
  positions.forEach(([x, z], index) => {
    setInstance(dummy, postMesh, index, [x, 1.45, z], [1, 2.9, 1]);
    setInstance(dummy, panelMesh, index, [x, 3.05, z], [5.2, 2.3, 0.25], [0, x < 0 ? 0.12 : -0.12, 0]);
    setInstance(dummy, lineMesh, index * 2, [x, 3.35, z + 0.15], [3.4, 0.18, 0.28], [0, x < 0 ? 0.12 : -0.12, 0]);
    setInstance(dummy, lineMesh, index * 2 + 1, [x, 2.78, z + 0.15], [2.5, 0.18, 0.28], [0, x < 0 ? 0.12 : -0.12, 0]);
  });
  postMesh.name = "InfoSignPosts";
  panelMesh.name = "InfoSignPanels";
  lineMesh.name = "InfoSignGraphicLines";
  postMesh.instanceMatrix.needsUpdate = true;
  panelMesh.instanceMatrix.needsUpdate = true;
  lineMesh.instanceMatrix.needsUpdate = true;
  group.add(postMesh, panelMesh, lineMesh);
}

function addTrashBins(group, geometries, materials) {
  const positions = [];
  for (const side of [-1, 1]) {
    for (const z of [HERO_Z + 48, HERO_Z + 96, HERO_Z + 148, HERO_Z + 206]) {
      positions.push([side * 62, z]);
    }
  }
  const binMesh = new THREE.InstancedMesh(geometries.box, materials.darkMetal, positions.length);
  const lidMesh = new THREE.InstancedMesh(geometries.box, materials.metal, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach(([x, z], index) => {
    setInstance(dummy, binMesh, index, [x, 0.7, z], [1.2, 1.4, 1.2]);
    setInstance(dummy, lidMesh, index, [x, 1.48, z], [1.38, 0.16, 1.38]);
  });
  binMesh.name = "CampusTrashBins";
  lidMesh.name = "CampusTrashBinLids";
  binMesh.instanceMatrix.needsUpdate = true;
  lidMesh.instanceMatrix.needsUpdate = true;
  group.add(binMesh, lidMesh);
}

function addBikeRacks(group, geometries, materials) {
  const positions = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      positions.push([side * (76 + i * 2.2), HERO_Z + 105, Math.PI / 2]);
    }
  }
  const rackMesh = new THREE.InstancedMesh(geometries.pole, materials.metal, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach(([x, z, rotationY], index) => {
    setInstance(dummy, rackMesh, index, [x, 0.85, z], [0.82, 1.75, 0.82], [Math.PI / 2, rotationY, 0]);
  });
  rackMesh.name = "CampusBikeRacks";
  rackMesh.instanceMatrix.needsUpdate = true;
  group.add(rackMesh);
}

function createExteriorLightingPlaceholders(geometries, materials) {
  const group = new THREE.Group();
  group.name = "ExteriorLightingPlaceholders";

  addLampPosts(group, geometries, materials);
  addGroundLights(group, geometries, materials);
  addTotems(group, geometries, materials);
  addEntranceLedStrips(group, geometries, materials);
  addRoofEdgeDecorativeStrips(group, geometries, materials);

  return group;
}

function addLampPosts(group, geometries, materials) {
  const positions = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      positions.push([side * 48, HERO_Z + 38 + i * 22]);
    }
  }
  const poleMesh = new THREE.InstancedMesh(geometries.pole, materials.darkMetal, positions.length);
  const armMesh = new THREE.InstancedMesh(geometries.box, materials.darkMetal, positions.length);
  const headMesh = new THREE.InstancedMesh(geometries.lampHead, materials.ledWarm, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach(([x, z], index) => {
    const side = Math.sign(x);
    setInstance(dummy, poleMesh, index, [x, 4.1, z], [1.2, 8.2, 1.2]);
    setInstance(dummy, armMesh, index, [x - side * 1.45, 7.65, z], [3.0, 0.12, 0.12]);
    setInstance(dummy, headMesh, index, [x - side * 2.85, 7.55, z], [1.0, 0.58, 1.0]);
  });
  poleMesh.name = "CampusLampPoles";
  armMesh.name = "CampusLampArms";
  headMesh.name = "CampusLampEmissiveHeads";
  poleMesh.instanceMatrix.needsUpdate = true;
  armMesh.instanceMatrix.needsUpdate = true;
  headMesh.instanceMatrix.needsUpdate = true;
  group.add(poleMesh, armMesh, headMesh);
}

function addGroundLights(group, geometries, materials) {
  const positions = [];
  for (let i = 0; i < 14; i++) {
    const z = HERO_Z + 42 + i * 14;
    positions.push([-18, z], [18, z]);
  }
  const lightMesh = new THREE.InstancedMesh(geometries.box, materials.ledWarm, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach(([x, z], index) => {
    setInstance(dummy, lightMesh, index, [x, CAMPUS_Y + 0.13, z], [1.0, 0.12, 1.0]);
  });
  lightMesh.name = "CampusGroundLightPlaceholders";
  lightMesh.instanceMatrix.needsUpdate = true;
  group.add(lightMesh);
}

function addTotems(group, geometries, materials) {
  const positions = [
    [-72, HERO_Z + 30],
    [72, HERO_Z + 30],
    [-62, HERO_Z + 86],
    [62, HERO_Z + 86],
    [-52, HERO_Z + 150],
    [52, HERO_Z + 150],
    [-32, AXIS_END_Z - 10],
    [32, AXIS_END_Z - 10],
  ];
  const bodyMesh = new THREE.InstancedMesh(geometries.box, materials.olympicBlack, positions.length);
  const screenMesh = new THREE.InstancedMesh(geometries.box, materials.ledCyan, positions.length);
  const capMesh = new THREE.InstancedMesh(geometries.box, materials.accentGold, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach(([x, z], index) => {
    const rotationY = x < 0 ? 0.12 : -0.12;
    setInstance(dummy, bodyMesh, index, [x, 3.35, z], [2.7, 6.7, 0.62], [0, rotationY, 0]);
    setInstance(dummy, screenMesh, index, [x, 3.6, z + 0.04], [1.95, 4.85, 0.7], [0, rotationY, 0]);
    setInstance(dummy, capMesh, index, [x, 6.95, z + 0.02], [2.9, 0.36, 0.78], [0, rotationY, 0]);
  });
  bodyMesh.name = "OlympicTotemBodies";
  screenMesh.name = "OlympicTotemScreens";
  capMesh.name = "OlympicTotemCaps";
  bodyMesh.instanceMatrix.needsUpdate = true;
  screenMesh.instanceMatrix.needsUpdate = true;
  capMesh.instanceMatrix.needsUpdate = true;
  group.add(bodyMesh, screenMesh, capMesh);
}

function addEntranceLedStrips(group, geometries, materials) {
  const strips = [
    [0, HERO_Z + 18, 116, 0.18],
    [-42, HERO_Z + 25, 24, 0.2],
    [42, HERO_Z + 25, 24, 0.2],
  ];
  for (const [x, z, sx, sz] of strips) {
    addBox(group, geometries.box, materials.ledCyan, [sx, 0.16, sz], [x, 0.24, z]);
  }
}

function addRoofEdgeDecorativeStrips(group, geometries, materials) {
  for (const x of [-72, -36, 0, 36, 72]) {
    addBox(group, geometries.box, materials.ledWarm, [18, 0.18, 0.28], [x, 4.8, HERO_Z + 3.5]);
  }
}

function createCeremonyExteriorAnchors(geometries, materials) {
  const group = new THREE.Group();
  group.name = "CeremonyExteriorAnchors";

  addAnchorMarkers(group, geometries, materials, "FireworksLaunchPoints", [
    [-96, HERO_Z + 112],
    [96, HERO_Z + 112],
    [-124, HERO_Z + 206],
    [124, HERO_Z + 206],
  ], materials.olympicRed);
  addAnchorMarkers(group, geometries, materials, "SearchlightBases", [
    [-74, HERO_Z + 24],
    [74, HERO_Z + 24],
    [-84, AXIS_END_Z - 18],
    [84, AXIS_END_Z - 18],
  ], materials.ledCyan);
  addAnchorMarkers(group, geometries, materials, "FlameTorchPosition", [
    [0, HERO_Z + 78],
  ], materials.accentGold, [4.0, 0.24, 4.0]);
  addAnchorMarkers(group, geometries, materials, "ExteriorLedStripAnchors", [
    [-52, HERO_Z + 16],
    [52, HERO_Z + 16],
    [0, HERO_Z + 16],
  ], materials.ledWarm, [6.0, 0.16, 0.8]);
  addAnchorMarkers(group, geometries, materials, "PlazaCrowdZones", [
    [-34, HERO_Z + 58],
    [34, HERO_Z + 58],
    [-30, HERO_Z + 114],
    [30, HERO_Z + 114],
  ], materials.pavingDark, [18, 0.08, 8]);
  addAnchorMarkers(group, geometries, materials, "FlagAvenueCeremonyFocus", [
    [0, AXIS_END_Z - 22],
  ], materials.olympicBlue, [8, 0.12, 8]);

  return group;
}

function addAnchorMarkers(group, geometries, materials, name, positions, material, scale = [2.8, 0.18, 2.8]) {
  const anchorGroup = new THREE.Group();
  anchorGroup.name = name;
  positions.forEach(([x, z], index) => {
    const marker = addBox(anchorGroup, geometries.box, material, scale, [x, CAMPUS_Y + 0.08, z]);
    marker.name = `${name}_${index + 1}`;
  });
  group.add(anchorGroup);
}

function setInstance(dummy, mesh, index, position, scale, rotation = [0, 0, 0]) {
  dummy.position.set(position[0], position[1], position[2]);
  dummy.rotation.set(rotation[0], rotation[1], rotation[2]);
  dummy.scale.set(scale[0], scale[1], scale[2]);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);
}

function addBox(group, geometry, material, scale, position, rotationY = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.y = rotationY;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
