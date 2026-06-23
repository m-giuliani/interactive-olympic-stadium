import GUI from "lil-gui";

/**
 * lil-gui control panel (CLAUDE.md §3, MVP requirement).
 *
 * Wires user interaction to the sprint event and the camera rig.
 *
 * @param {{ sprint: import("../events/sprint.js").SprintEvent,
 *           cameraRig: import("../cameras/cameraRig.js").CameraRig,
 *           ceremony?: import("../events/ceremony.js").Ceremony,
 *           lighting?: import("../lighting/lighting.js").createLighting,
 *           renderer?: THREE.WebGLRenderer }} ctx
 * @returns {GUI}
 */
export function createGUI({ sprint, cameraRig, ceremony, lighting, renderer }) {
  const gui = new GUI({ title: "Olympic Stadium" });

  const sprintFolder = gui.addFolder("Sprint event");
  const actions = {
    start: () => sprint.start(),
    reset: () => sprint.reset(),
  };
  sprintFolder.add(actions, "start").name("▶ Start race");
  sprintFolder.add(actions, "reset").name("↺ Reset");

  if (ceremony) {
    const cerFolder = gui.addFolder("Ceremony");
    const cerState = { active: false };
    cerFolder
      .add(cerState, "active")
      .name("✨ Opening ceremony")
      .onChange((v) => (v ? ceremony.start() : ceremony.stop()));
  }

  const camFolder = gui.addFolder("Camera");
  const camState = { follow: false };
  camFolder
    .add(camState, "follow")
    .name("Follow runner")
    .onChange((v) => cameraRig.setMode(v ? "follow" : "orbit"));

  // Live lighting tuning (handy while judging the look at night).
  if (lighting || renderer) {
    const lightFolder = gui.addFolder("Lighting");
    if (lighting?.floodlights?.length) {
      const flood = { intensity: lighting.floodlights[0].intensity };
      lightFolder
        .add(flood, "intensity", 0, 20, 0.5)
        .name("Floodlights")
        .onChange((v) => lighting.floodlights.forEach((s) => (s.intensity = v)));
    }
    if (lighting?.moon) {
      lightFolder.add(lighting.moon, "intensity", 0, 4, 0.1).name("Moonlight");
    }
    if (lighting?.hemisphere) {
      lightFolder
        .add(lighting.hemisphere, "intensity", 0, 3, 0.1)
        .name("Ambient");
    }
    if (renderer) {
      lightFolder
        .add(renderer, "toneMappingExposure", 0.4, 2.5, 0.05)
        .name("Exposure");
    }
  }

  return gui;
}
