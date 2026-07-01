import * as THREE from "three";

import { discorectanglePoints, buildRibbon } from "../utils/geometry.js";
import {
  STRAIGHT_HALF,
  BOWL_TOP_RADIUS,
  BOWL_TOP_HEIGHT,
  ARC_SEGMENTS,
} from "./config.js";

/**
 * The stadium's exterior architecture: a light concrete facade wrapping the
 * outside of the seating bowl, plus a ring of structural support pillars.
 *
 * Without this you see the dark back of the seating ribbon (a "smooth UFO").
 * The facade is a vertical wall at the bowl's outer radius, rising to the rim
 * (BOWL_TOP_HEIGHT) so it hides the seats' backs and reads as real architecture;
 * the pillars stand a little proud of it as external columns.
 *
 * Light concrete + low metalness + mid roughness so the surface catches the
 * dusk sky / floodlights nicely (high metalness would look flat/dark here since
 * the scene has no reflection environment map).
 *
 * @returns {{ group: THREE.Group, dispose: () => void }}
 */
export function createExterior() {
  const group = new THREE.Group();
  group.name = "Exterior";
  const disposables = [];

  // Shared light-concrete material for the facade and the pillars.
  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0xd5d2c8, // warm light concrete / off-white
    roughness: 0.6,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  const darkPanelMat = new THREE.MeshStandardMaterial({
    color: 0x1f252b,
    roughness: 0.72,
    metalness: 0.15,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x5f91a8,
    roughness: 0.28,
    metalness: 0.05,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const ledMat = new THREE.MeshStandardMaterial({
    color: 0x26d9ff,
    emissive: 0x26d9ff,
    emissiveIntensity: 2.4,
    roughness: 0.32,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const warmLedMat = new THREE.MeshStandardMaterial({
    color: 0xffc36a,
    emissive: 0xffa85c,
    emissiveIntensity: 1.6,
    roughness: 0.36,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const bannerBlueMat = new THREE.MeshStandardMaterial({
    color: 0x123d72,
    roughness: 0.72,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const bannerGoldMat = new THREE.MeshStandardMaterial({
    color: 0xd8a928,
    roughness: 0.68,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const bannerRedMat = new THREE.MeshStandardMaterial({
    color: 0x9c2632,
    roughness: 0.72,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const whiteDetailMat = new THREE.MeshStandardMaterial({
    color: 0xe8e9e5,
    roughness: 0.78,
    metalness: 0.0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const sharedBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(
    concreteMat,
    darkPanelMat,
    glassMat,
    ledMat,
    warmLedMat,
    bannerBlueMat,
    bannerGoldMat,
    bannerRedMat,
    whiteDetailMat,
    sharedBoxGeo,
  );

  // --- Facade ----------------------------------------------------------------
  // A vertical wall at the bowl's outer radius, from the ground up to the rim.
  // Its top edge meets the seating bowl's top outer edge, closing the rim line.
  const outerLoop = discorectanglePoints(
    STRAIGHT_HALF,
    BOWL_TOP_RADIUS,
    ARC_SEGMENTS,
  );
  const facadeGeo = buildRibbon(outerLoop, 0, outerLoop, BOWL_TOP_HEIGHT);
  const facade = new THREE.Mesh(facadeGeo, concreteMat);
  facade.name = "Facade";
  facade.receiveShadow = true;
  group.add(facade);
  disposables.push(facadeGeo);

  // --- Structural pillars ----------------------------------------------------
  // A ring of vertical concrete cylinders standing just outside the facade,
  // following the oval perimeter as architectural supports.
  const PILLAR_COUNT = 60;
  const PILLAR_OFFSET = 1.6; // how far the columns sit outside the facade
  const PILLAR_RADIUS = 1.4;

  // One shared, slightly tapered cylinder; base translated to sit on the ground.
  const pillarGeo = new THREE.CylinderGeometry(
    PILLAR_RADIUS,
    PILLAR_RADIUS * 1.2,
    BOWL_TOP_HEIGHT,
    12,
  );
  pillarGeo.translate(0, BOWL_TOP_HEIGHT / 2, 0);
  disposables.push(pillarGeo);

  // Sample the oval outline (denser than PILLAR_COUNT) and step along it so the
  // columns hug the perimeter on the straights and the curves alike.
  const ring = discorectanglePoints(
    STRAIGHT_HALF,
    BOWL_TOP_RADIUS + PILLAR_OFFSET,
    ARC_SEGMENTS * 2,
  );
  for (let i = 0; i < PILLAR_COUNT; i++) {
    const p = ring[Math.floor((i / PILLAR_COUNT) * ring.length)];
    const pillar = new THREE.Mesh(pillarGeo, concreteMat);
    pillar.position.set(p.x, 0, p.y);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    group.add(pillar);
  }

  createFacadeDetails(group, sharedBoxGeo, {
    concrete: concreteMat,
    darkPanel: darkPanelMat,
    glass: glassMat,
    led: ledMat,
    warmLed: warmLedMat,
    bannerBlue: bannerBlueMat,
    bannerGold: bannerGoldMat,
    bannerRed: bannerRedMat,
    whiteDetail: whiteDetailMat,
  });

  return {
    group,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

function createFacadeDetails(group, boxGeo, materials) {
  const FACADE_MOUNT_OFFSET = 0.28;
  const frontZ = BOWL_TOP_RADIUS + FACADE_MOUNT_OFFSET;
  const backZ = -BOWL_TOP_RADIUS - FACADE_MOUNT_OFFSET;

  addMainEntrance(group, boxGeo, materials, frontZ);
  addFacadeBanners(group, boxGeo, materials, frontZ, backZ);
  addVerticalLedPanels(group, boxGeo, materials, frontZ, backZ);
  addUpperFacadeBands(group, boxGeo, materials, frontZ, backZ);
}

function addMainEntrance(group, boxGeo, materials, frontZ) {
  const entrance = new THREE.Group();
  entrance.name = "MainEntrancePortal";

  addBox(
    entrance,
    boxGeo,
    materials.darkPanel,
    [112, 11.2, 0.9],
    [0, 5.8, frontZ],
  );
  addBox(
    entrance,
    boxGeo,
    materials.concrete,
    [128, 1.45, 5.2],
    [0, 0.74, frontZ + 2.9],
  );
  addBox(
    entrance,
    boxGeo,
    materials.concrete,
    [104, 0.65, 1.6],
    [0, 1.6, frontZ + 5.9],
  );
  addBox(
    entrance,
    boxGeo,
    materials.glass,
    [78, 6.8, 0.46],
    [0, 5.8, frontZ + 0.32],
  );
  addBox(
    entrance,
    boxGeo,
    materials.led,
    [70, 2.05, 0.42],
    [0, 10.55, frontZ + 0.48],
  );
  addBox(
    entrance,
    boxGeo,
    materials.whiteDetail,
    [42, 0.32, 0.48],
    [0, 11.05, frontZ + 0.68],
  );

  for (const offsetX of [-50, -34, -18, 18, 34, 50]) {
    addBox(
      entrance,
      boxGeo,
      materials.warmLed,
      [8.2, 0.36, 0.5],
      [offsetX, 4.25, frontZ + 0.64],
    );
    addBox(
      entrance,
      boxGeo,
      materials.darkPanel,
      [8.9, 3.2, 0.48],
      [offsetX, 2.35, frontZ + 0.52],
    );
  }

  for (let stepIndex = 0; stepIndex < 4; stepIndex++) {
    addBox(
      entrance,
      boxGeo,
      materials.concrete,
      [116 - stepIndex * 12, 0.2, 1.25],
      [0, 0.11 + stepIndex * 0.18, frontZ + 6.9 + stepIndex * 1.1],
    );
  }

  group.add(entrance);
}

function addFacadeBanners(group, boxGeo, materials, frontZ, backZ) {
  const bannerGroup = new THREE.Group();
  bannerGroup.name = "FacadeBanners";

  const bannerMaterials = [
    materials.bannerBlue,
    materials.bannerGold,
    materials.bannerRed,
    materials.bannerBlue,
  ];
  const frontBannerXs = [-60, -20, 20, 60];
  frontBannerXs.forEach((positionX, index) => {
    addBanner(
      bannerGroup,
      boxGeo,
      bannerMaterials[index],
      materials.whiteDetail,
      [positionX, BOWL_TOP_HEIGHT * 0.58, frontZ],
      [28, 6.8, 0.24],
      0,
    );
  });

  for (const [positionX, material] of [
    [-44, materials.bannerGold],
    [44, materials.bannerRed],
  ]) {
    addBanner(
      bannerGroup,
      boxGeo,
      material,
      materials.whiteDetail,
      [positionX, BOWL_TOP_HEIGHT * 0.54, backZ],
      [28, 5.8, 0.24],
      Math.PI,
    );
  }

  group.add(bannerGroup);
}

function addVerticalLedPanels(group, boxGeo, materials, frontZ, backZ) {
  const frontXs = [-82, -54, -26, 26, 54, 82];
  const backXs = [-66, -33, 0, 33, 66];
  const totalPanels = frontXs.length + backXs.length;
  const detailPanels = new THREE.InstancedMesh(boxGeo, materials.darkPanel, totalPanels);
  const ledPanels = new THREE.InstancedMesh(boxGeo, materials.led, totalPanels);
  detailPanels.name = "ExteriorDetailPanels";
  ledPanels.name = "ExteriorLedPanels";
  detailPanels.receiveShadow = true;

  const matrixObject = new THREE.Object3D();
  let panelIndex = 0;
  const addPanelInstance = (position, rotationY, detailScale, ledScale) => {
    const normalX = Math.sin(rotationY);
    const normalZ = Math.cos(rotationY);

    matrixObject.position.set(position[0], position[1], position[2]);
    matrixObject.rotation.set(0, rotationY, 0);
    matrixObject.scale.set(detailScale[0], detailScale[1], detailScale[2]);
    matrixObject.updateMatrix();
    detailPanels.setMatrixAt(panelIndex, matrixObject.matrix);

    matrixObject.position.set(
      position[0] + normalX * 0.18,
      position[1],
      position[2] + normalZ * 0.18,
    );
    matrixObject.rotation.set(0, rotationY, 0);
    matrixObject.scale.set(ledScale[0], ledScale[1], ledScale[2]);
    matrixObject.updateMatrix();
    ledPanels.setMatrixAt(panelIndex, matrixObject.matrix);
    panelIndex += 1;
  };

  frontXs.forEach((positionX) => {
    addPanelInstance(
      [positionX, 12.5, frontZ - 0.03],
      0,
      [3.0, 13, 0.28],
      [1.45, 10.0, 0.16],
    );
  });
  backXs.forEach((positionX) => {
    addPanelInstance(
      [positionX, 11.5, backZ + 0.03],
      Math.PI,
      [2.6, 10.5, 0.28],
      [1.25, 7.8, 0.16],
    );
  });

  detailPanels.instanceMatrix.needsUpdate = true;
  ledPanels.instanceMatrix.needsUpdate = true;
  group.add(detailPanels, ledPanels);
}

function addUpperFacadeBands(group, boxGeo, materials, frontZ, backZ) {
  const bandGroup = new THREE.Group();
  bandGroup.name = "UpperFacadeBands";

  addBox(
    bandGroup,
    boxGeo,
    materials.glass,
    [168, 2.8, 0.28],
    [0, BOWL_TOP_HEIGHT - 6.2, frontZ + 0.08],
  );
  addBox(
    bandGroup,
    boxGeo,
    materials.darkPanel,
    [178, 0.8, 0.32],
    [0, BOWL_TOP_HEIGHT - 8.0, frontZ + 0.12],
  );
  addBox(
    bandGroup,
    boxGeo,
    materials.warmLed,
    [132, 0.32, 0.38],
    [0, BOWL_TOP_HEIGHT - 4.65, frontZ + 0.18],
  );
  addBox(
    bandGroup,
    boxGeo,
    materials.darkPanel,
    [128, 0.64, 0.32],
    [0, BOWL_TOP_HEIGHT - 5.45, backZ - 0.08],
    Math.PI,
  );
  addBox(
    bandGroup,
    boxGeo,
    materials.glass,
    [108, 2.2, 0.28],
    [0, BOWL_TOP_HEIGHT - 7.1, backZ - 0.08],
    Math.PI,
  );

  group.add(bandGroup);
}

function addBanner(group, boxGeo, material, stripeMat, position, scale, rotationY) {
  addBox(group, boxGeo, material, scale, position, rotationY);

  const normalX = Math.sin(rotationY);
  const normalZ = Math.cos(rotationY);
  const stripeScale = [scale[0] * 0.74, 0.28, scale[2] + 0.05];
  for (let stripeIndex = 0; stripeIndex < 3; stripeIndex++) {
    addBox(
      group,
      boxGeo,
      stripeMat,
      stripeScale,
      [
        position[0] + normalX * 0.18,
        position[1] - scale[1] * 0.22 + stripeIndex * scale[1] * 0.22,
        position[2] + normalZ * 0.18,
      ],
      rotationY,
    );
  }
}

function addBox(group, geometry, material, scale, position, rotationY = 0) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.scale.set(scale[0], scale[1], scale[2]);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.y = rotationY;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
