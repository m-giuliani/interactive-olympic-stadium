import { createRenderer } from "./core/renderer.js";
import { createScene } from "./core/scene.js";
import { createCamera } from "./core/camera.js";
import { handleResize } from "./core/resize.js";
import { Loop } from "./core/loop.js";

import { createPostProcessing } from "./core/postprocessing.js";
import { createStadium } from "./stadium/stadium.js";
import { createLedRibbon } from "./stadium/ledRibbon.js";
import { createLighting } from "./lighting/lighting.js";
import { Athlete } from "./athletes/athlete.js";
import { SprintEvent } from "./events/sprint.js";
import { Ceremony } from "./events/ceremony.js";
import { CameraRig } from "./cameras/cameraRig.js";
import { createGUI } from "./ui/gui.js";

/**
 * Application bootstrap.
 *
 * Wires together the core modules, the stadium + lighting, the articulated
 * athlete, the sprint event, the camera rig, and the lil-gui controls, then
 * starts the single animation loop.
 */
function init() {
  const container = document.getElementById("app");

  const renderer = createRenderer(container);
  const scene = createScene();
  const { camera, controls } = createCamera(renderer.domElement);

  handleResize(renderer, camera);

  const loop = new Loop(renderer, scene, camera);

  // Post-processing chain (used for the ceremony bloom); route the loop's
  // rendering through it.
  const postFx = createPostProcessing(renderer, scene, camera);
  loop.setRenderFunction(postFx.render);

  // Stadium geometry, then the lighting rig (positioned from the tower heads).
  const stadium = createStadium();
  scene.add(stadium.group);

  const led = createLedRibbon();
  scene.add(led.mesh);

  const lighting = createLighting(stadium.towerHeads);
  scene.add(lighting.group);

  // Athlete + sprint event.
  const athlete = new Athlete();
  scene.add(athlete.root);

  const hud = makeHud();
  const sprint = new SprintEvent(athlete, { onStatus: hud });

  // Cameras: free orbit by default, with optional follow + cinematic modes.
  const cameraRig = new CameraRig(camera, controls);
  cameraRig.follow(athlete.root);

  // Ceremony mode (dynamic lights, LED/emissive, bloom, cinematic camera).
  const ceremony = new Ceremony({
    scene,
    lighting,
    ledMaterial: led.material,
    bloomPass: postFx.bloomPass,
    cameraRig,
    onStatus: hud,
  });

  // GUI controls.
  createGUI({ sprint, cameraRig, ceremony, lighting, renderer });

  // Per-frame updates (single loop, CLAUDE.md §6).
  loop.add((delta) => {
    sprint.update(delta);
    ceremony.update(delta);
    cameraRig.update(delta);
  });

  loop.start();

  // Reveal the scene once the first frame is on screen.
  requestAnimationFrame(() => {
    document.getElementById("loading")?.classList.add("hidden");
  });
}

/**
 * Returns an onStatus(text) callback that flashes race announcements in the HUD
 * and fades them out shortly after.
 */
function makeHud() {
  const el = document.getElementById("hud");
  let timer = null;
  return (text) => {
    if (!el) return;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(timer);
    timer = setTimeout(() => el.classList.remove("show"), 2200);
  };
}

init();
