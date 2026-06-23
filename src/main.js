import { createRenderer } from "./core/renderer.js";
import { createScene } from "./core/scene.js";
import { createCamera } from "./core/camera.js";
import { handleResize } from "./core/resize.js";
import { Loop } from "./core/loop.js";

import { createPostProcessing } from "./core/postprocessing.js";
import { createStadium } from "./stadium/stadium.js";
import { createLedRibbon } from "./stadium/ledRibbon.js";
import { createLongJumpPit } from "./stadium/longJumpPit.js";
import { createGoal } from "./stadium/goal.js";
import { createLighting } from "./lighting/lighting.js";
import { Athlete } from "./athletes/athlete.js";
import { SprintEvent } from "./events/sprint.js";
import { LongJumpEvent } from "./events/longJump.js";
import { FootballEvent } from "./events/football.js";
import { Ceremony } from "./events/ceremony.js";
import { Director } from "./cameras/director.js";
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

  const longJumpPit = createLongJumpPit();
  scene.add(longJumpPit.group);

  const goal = createGoal();
  scene.add(goal.group);

  const lighting = createLighting(stadium.towerHeads);
  scene.add(lighting.group);

  const hud = makeHud();

  // Director AI (broadcast / spider / action / free). Created before the events
  // so the football can re-point it at the ball mid-flight; drives DoF focus.
  const director = new Director(camera, controls, {
    bokehPass: postFx.bokehPass,
  });

  // Sprint athlete + event.
  const athlete = new Athlete();
  scene.add(athlete.root);
  const sprint = new SprintEvent(athlete, { onStatus: hud });

  // A second instance of the same parametric rig drives the long jump (§7).
  const jumper = new Athlete();
  scene.add(jumper.root);
  const longJump = new LongJumpEvent(jumper, { onStatus: hud });

  // A third instance drives the football exhibition; the event owns the ball.
  const footballer = new Athlete();
  scene.add(footballer.root);
  const football = new FootballEvent(footballer, { onStatus: hud, director });
  scene.add(football.ball);

  // Ceremony mode (dynamic lights, LED/emissive, bloom, cinematic camera).
  const ceremony = new Ceremony({
    scene,
    lighting,
    ledMaterial: led.material,
    bloomPass: postFx.bloomPass,
    director,
    onStatus: hud,
  });

  // GUI controls (director mode + sports events + ceremony toggle).
  createGUI({ sprint, longJump, football, ceremony, director });

  // Per-frame updates (single loop, CLAUDE.md §6).
  // ORDER MATTERS: every subject must move BEFORE the director reads its position,
  // otherwise the camera tracks last frame's pose and stutters. Keep
  // director.update() strictly LAST.
  loop.add((delta) => {
    sprint.update(delta);
    longJump.update(delta);
    football.update(delta);
    ceremony.update(delta);
    director.update(delta);
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
