import GUI from "lil-gui";

/**
 * lil-gui control panel (CLAUDE.md §3, MVP requirement).
 *
 * The user may: choose a Director (camera) mode, start/reset the sports events,
 * and toggle the opening ceremony.
 *
 * @param {{ sprint: import("../events/sprint.js").SprintEvent,
 *           longJump?: import("../events/longJump.js").LongJumpEvent,
 *           football?: import("../events/football.js").FootballEvent,
 *           ceremony?: import("../events/ceremony.js").Ceremony,
 *           environment?: ReturnType<typeof import("../stadium/environment.js").createEnvironment>,
 *           director: import("../cameras/director.js").Director }} ctx
 * @returns {GUI}
 */
export function createGUI({
  sprint,
  longJump,
  football,
  ceremony,
  environment,
  director,
}) {
  const gui = new GUI({ title: "Olympic Stadium" });

  // --- Director (camera) modes ----------------------------------------------
  const camFolder = gui.addFolder("Director");
  const camModes = {
    "Broadcast TV": "broadcast",
    "Spider-cam": "spider",
    "Action Track": "action",
    "Free Explore": "free",
  };
  const camState = { mode: "free" };
  const modeCtrl = camFolder
    .add(camState, "mode", camModes)
    .name("Mode")
    .onChange((v) => director.setMode(v));

  // --- Sports events ---------------------------------------------------------
  // Starting an event makes it the Director's active subject. If the user is in
  // Free Explore (which ignores the subject), snap to Action Track so the event
  // is actually framed instead of the view appearing "stuck".
  const wireEvent = (folderName, event, startLabel, subjectType) => {
    const folder = gui.addFolder(folderName);
    const actions = {
      start: () => {
        event.start();
        director.setSubject(event.athlete.root, subjectType);
        if (director.mode === "free") modeCtrl.setValue("action");
      },
      reset: () => event.reset(),
    };
    folder.add(actions, "start").name(startLabel);
    folder.add(actions, "reset").name("↺ Reset");
  };

  wireEvent("Sprint event", sprint, "▶ Start race", "sprinter");
  if (longJump) wireEvent("Long jump", longJump, "▶ Start long jump", "jumper");
  if (football) wireEvent("Football", football, "▶ Start football", "football");

  // --- Environment -----------------------------------------------------------
  if (environment) {
    const envFolder = gui.addFolder("Environment");
    const envState = {
      trees: true,
      skyline: true,
      fog: environment.fog ? environment.fog.density : 0.0011,
    };
    envFolder
      .add(envState, "trees")
      .name("🌲 Trees")
      .onChange((v) => environment.trees.forEach((m) => (m.visible = v)));
    envFolder
      .add(envState, "skyline")
      .name("🏙 Skyline")
      .onChange((v) => environment.skyline.forEach((m) => (m.visible = v)));
    if (environment.fog) {
      envFolder
        .add(envState, "fog", 0, 0.004, 0.0001)
        .name("Fog density")
        .onChange((v) => (environment.fog.density = v));
    }
    envFolder.close(); // tidy by default
  }

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
