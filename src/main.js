import { createRenderer } from "./core/renderer.js";
import { createScene } from "./core/scene.js";
import { createCamera } from "./core/camera.js";
import { handleResize } from "./core/resize.js";
import { Loop } from "./core/loop.js";

import { createPostProcessing } from "./core/postprocessing.js";
import { createStadium } from "./stadium/stadium.js";
import { createStadiumPlan } from "./stadium/stadiumPlan.js";
import { createStadiumPlanDebug } from "./stadium/stadiumPlanDebug.js";
import { createEnvironment } from "./stadium/environment.js";
import { createLedRibbon } from "./stadium/ledRibbon.js";
import { createLongJumpPit } from "./stadium/longJumpPit.js";
import { createGoal } from "./stadium/goal.js";
import { createLighting } from "./lighting/lighting.js";
import { LightingManager } from "./lighting/lightingManager.js";
import { SprintEvent } from "./events/sprint.js";
import { LongJumpEvent } from "./events/longJump.js";
import { FootballEvent } from "./events/football.js";
import { EventManager } from "./events/eventManager.js";
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

  // Seating-bowl refactor: the StadiumPlan footprint + a debug overlay to verify
  // it (press 'P' to toggle). The plan now also drives the seating geometry in
  // stadium/stands.js (BowlGenerator).
  const stadiumPlan = createStadiumPlan();
  const planDebug = createStadiumPlanDebug(stadiumPlan);
  planDebug.group.visible = false; // off by default now; press 'P' to compare
  scene.add(planDebug.group);
  console.log(
    `[StadiumPlan] perimeter ${stadiumPlan.perimeter.toFixed(1)} m`,
    stadiumPlan.sectors.map(
      (s) => `${s.id}: u ${s.u0.toFixed(3)}→${s.u1.toFixed(3)} (${s.kind})`,
    ),
  );

  // Procedural exterior: a Day/Night sky dome with sun + clouds or moon + stars.
  // The LightingManager switches it in lockstep with the lights.
  const environment = createEnvironment();
  scene.add(environment.group);

  const led = createLedRibbon();
  scene.add(led.mesh);

  const longJumpPit = createLongJumpPit();
  scene.add(longJumpPit.group);

  const goal = createGoal();
  scene.add(goal.group);

  const lighting = createLighting(stadium.lightAnchors);
  scene.add(lighting.group);

  // Central Lighting Controller: enforces the mutually-exclusive Day/Night state
  // across the sun, the 8 roof floodlights, and their emissive enclosures.
  const lightingManager = new LightingManager(
    lighting,
    stadium.roofLeds,
    scene,
    environment,
  );

  const hud = makeHud();

  // Quick keyboard test: 'L' flips Day/Night; 'P' toggles the StadiumPlan debug.
  window.addEventListener("keydown", (e) => {
    if (e.key === "l" || e.key === "L") {
      const isDay = lightingManager.toggle();
      hud(isDay ? "☀️ Day" : "🌙 Night");
    } else if (e.key === "p" || e.key === "P") {
      planDebug.group.visible = !planDebug.group.visible;
      hud(planDebug.group.visible ? "Plan debug ON" : "Plan debug OFF");
    }
  });

  // Director AI (broadcast / spider / action / free). Created before the events
  // so the football can re-point it at the ball mid-flight; drives DoF focus.
  const director = new Director(camera, controls, {
    bokehPass: postFx.bokehPass,
  });

  // "One sport at a time" controller (CLAUDE.md §6): each event is registered as
  // a FACTORY so it is built fresh on demand and fully torn down (athletes,
  // materials, textures disposed) when the next sport is triggered. The manager
  // also resets the camera to the default Broadcast view on every switch.
  const events = new EventManager({ scene, director, onStatus: hud });
  events
    .register("sprint", (ctx) => new SprintEvent(ctx))
    .register("longJump", (ctx) => new LongJumpEvent(ctx))
    .register("football", (ctx) => new FootballEvent(ctx));

  // Ceremony mode (dynamic lights, LED/emissive, bloom, cinematic camera).
  const ceremony = new Ceremony({
    scene,
    lighting,
    ledMaterial: led.material,
    roofLeds: stadium.roofLeds,
    bloomPass: postFx.bloomPass,
    director,
    onStatus: hud,
  });

  // Start in the default Broadcast view (CLAUDE.md: Broadcast is the default).
  director.setMode("broadcast");

  // GUI controls (director mode + sports events + ceremony toggle).
  createGUI({
    events,
    ceremony,
    director,
    lightingManager,
  });

  // Per-frame updates (single loop, CLAUDE.md §6).
  // ORDER MATTERS: every subject must move BEFORE the director reads its position,
  // otherwise the camera tracks last frame's pose and stutters. Keep
  // director.update() strictly LAST.
  loop.add((delta) => {
    events.update(delta);
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
