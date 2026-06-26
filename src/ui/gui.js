import GUI from "lil-gui";

/**
 * lil-gui control panel (CLAUDE.md §3, MVP requirement).
 *
 * The user may: choose a Director (camera) mode, start the sports events (one at
 * a time — picking one tears down the previous), clear the field, and toggle the
 * opening ceremony.
 *
 * @param {{ events: import("../events/eventManager.js").EventManager,
 *           ceremony?: import("../events/ceremony.js").Ceremony,
 *           director: import("../cameras/director.js").Director,
 *           lightingManager?: import("../lighting/lightingManager.js").LightingManager }} ctx
 * @returns {GUI}
 */
export function createGUI({ events, ceremony, director, lightingManager }) {
  const gui = new GUI({ title: "Olympic Stadium" });

  // --- Day / Night ----------------------------------------------------------
  // Instant, mutually-exclusive switch: sun on / floods off, or vice-versa.
  if (lightingManager) {
    const lightFolder = gui.addFolder("Lighting");
    const lightState = { day: lightingManager.isDay };
    lightFolder
      .add(lightState, "day")
      .name("☀️ Day mode")
      .onChange((v) => lightingManager.toggleDayNight(v));
  }

  // --- Director (camera) modes ----------------------------------------------
  // Broadcast is the default view; the EventManager also snaps back to it on
  // every event switch, so we keep this dropdown in sync below.
  const camFolder = gui.addFolder("Director");
  const camModes = {
    "Broadcast TV": "broadcast",
    "Spider-cam": "spider",
    "Action Track": "action",
    "Free Explore": "free",
  };
  const camState = { mode: director.mode };
  const modeCtrl = camFolder
    .add(camState, "mode", camModes)
    .name("Mode")
    .onChange((v) => director.setMode(v));

  // --- Sports events (one at a time) ----------------------------------------
  // Triggering an event routes through the EventManager: it tears down the
  // previous sport (disposing its athletes/props), resets the camera to
  // Broadcast, then builds and starts the requested one fresh.
  const playEvent = (key) => {
    events.play(key);
    // Reflect the manager's forced Broadcast reset in the dropdown without
    // re-firing onChange (which would call director.setMode redundantly).
    camState.mode = director.mode;
    modeCtrl.updateDisplay();
  };

  const wireEvent = (folderName, key, startLabel) => {
    const folder = gui.addFolder(folderName);
    folder.add({ start: () => playEvent(key) }, "start").name(startLabel);
  };

  wireEvent("Sprint event", "sprint", "▶ Start race");
  wireEvent("Long jump", "longJump", "▶ Start long jump");
  wireEvent("Football", "football", "▶ Start football");

  // Clear the field entirely (tear down the active sport, hand the camera back
  // to the roaming drone).
  gui
    .add({ clear: () => events.clear() }, "clear")
    .name("■ Clear field");

  // --- Opening ceremony ------------------------------------------------------
  if (ceremony) {
    const cerFolder = gui.addFolder("Ceremony");
    const cerState = { active: false };
    cerFolder
      .add(cerState, "active")
      .name("✨ Opening ceremony")
      .onChange((v) => (v ? ceremony.start() : ceremony.stop()));
  }

  return gui;
}
