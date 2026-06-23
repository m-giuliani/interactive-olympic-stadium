import * as THREE from "three";
import * as TWEEN from "tween";

import { BOWL_TOP_HEIGHT } from "../stadium/config.js";

const BEAM_COUNT = 8;
const BEAM_RING_RADIUS = 95;
const BEAM_HEIGHT = BOWL_TOP_HEIGHT + 10;

/**
 * Ceremony mode — the "wow" feature (CLAUDE.md §8 priority 3).
 *
 * Turning it on:
 *  - dims the floodlights & moon (tweened),
 *  - raises a ring of coloured SpotLights that sweep the infield and cycle hue
 *    (dynamic lighting),
 *  - cranks the LED ribbon's emissive intensity and cycles its colour,
 *  - tweens the bloom strength up so the emissives glow,
 *  - switches the camera into its cinematic aerial sweep.
 *
 * All transitions use tween.js; all per-frame motion is hand-written. Turning it
 * off tweens everything back to the stored baseline.
 */
export class Ceremony {
  /**
   * @param {{
   *   scene: THREE.Scene,
   *   lighting: { floodlights: THREE.SpotLight[], moon: THREE.DirectionalLight },
   *   ledMaterial: THREE.MeshStandardMaterial,
   *   bloomPass: import("three/addons/postprocessing/UnrealBloomPass.js").UnrealBloomPass,
   *   cameraRig: import("../cameras/cameraRig.js").CameraRig,
   *   onStatus?: (text: string) => void,
   * }} ctx
   */
  constructor({ scene, lighting, ledMaterial, bloomPass, cameraRig, onStatus }) {
    this.lighting = lighting;
    this.ledMaterial = ledMaterial;
    this.bloomPass = bloomPass;
    this.cameraRig = cameraRig;
    this.onStatus = onStatus ?? (() => {});

    this.active = false;
    this.time = 0;

    // Baselines to restore when the ceremony ends.
    this._floodBase = lighting.floodlights.map((s) => s.intensity);
    this._moonBase = lighting.moon.intensity;
    this._ledBase = ledMaterial.emissiveIntensity;

    // Ring of coloured sweeping beams (off until the show starts).
    this.group = new THREE.Group();
    this.group.name = "CeremonyBeams";
    this.beams = [];
    for (let i = 0; i < BEAM_COUNT; i++) {
      const ang = (i / BEAM_COUNT) * Math.PI * 2;
      const spot = new THREE.SpotLight(0xffffff, 0, 0, Math.PI / 9, 0.7, 0);
      spot.position.set(
        Math.cos(ang) * BEAM_RING_RADIUS,
        BEAM_HEIGHT,
        Math.sin(ang) * BEAM_RING_RADIUS,
      );
      spot.color.setHSL(i / BEAM_COUNT, 1, 0.55);

      const target = new THREE.Object3D();
      target.position.set(0, 0, 0);
      this.group.add(target);
      spot.target = target;

      this.group.add(spot);
      this.beams.push({ spot, target, phase: ang });
    }
    scene.add(this.group);
  }

  toggle() {
    this.active ? this.stop() : this.start();
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.onStatus("✨ Opening Ceremony ✨");

    this.lighting.floodlights.forEach((s) => this._tween(s, "intensity", 0.4));
    this._tween(this.lighting.moon, "intensity", 0.2);
    this.beams.forEach((b) => this._tween(b.spot, "intensity", 6));
    this._tween(this.ledMaterial, "emissiveIntensity", 2.4, 1200);
    this._tween(this.bloomPass, "strength", 1.3, 1200);

    this.cameraRig.setMode("cinematic");
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.onStatus("");

    this.lighting.floodlights.forEach((s, i) =>
      this._tween(s, "intensity", this._floodBase[i]),
    );
    this._tween(this.lighting.moon, "intensity", this._moonBase);
    this.beams.forEach((b) => this._tween(b.spot, "intensity", 0));
    this._tween(this.ledMaterial, "emissiveIntensity", this._ledBase, 1000);
    this._tween(this.bloomPass, "strength", 0, 1000);

    this.cameraRig.setMode("orbit");
  }

  update(delta) {
    if (!this.active) return;
    this.time += delta;
    const t = this.time;

    // Sweep each beam across the infield and cycle its colour.
    this.beams.forEach((b, i) => {
      b.target.position.set(
        Math.sin(t * 0.8 + b.phase) * 45,
        2,
        Math.cos(t * 0.6 + b.phase * 1.3) * 30,
      );
      b.spot.color.setHSL((i / BEAM_COUNT + t * 0.05) % 1, 1, 0.55);
    });

    // Rolling rainbow on the LED ribbon.
    this.ledMaterial.emissive.setHSL((t * 0.1) % 1, 0.9, 0.5);
  }

  _tween(obj, prop, to, duration = 1000) {
    new TWEEN.Tween(obj).to({ [prop]: to }, duration).start();
  }

  dispose() {
    this.beams.forEach((b) => b.spot.dispose());
  }
}
