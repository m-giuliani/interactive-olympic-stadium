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
   *   roofLeds?: THREE.InstancedMesh,
   *   bloomPass: import("three/addons/postprocessing/UnrealBloomPass.js").UnrealBloomPass,
   *   director: import("../cameras/director.js").Director,
   *   onStatus?: (text: string) => void,
   * }} ctx
   */
  constructor({
    scene,
    lighting,
    ledMaterial,
    roofLeds,
    bloomPass,
    director,
    onStatus,
  }) {
    this.lighting = lighting;
    this.ledMaterial = ledMaterial;
    this.roofLeds = roofLeds ?? null;
    this.bloomPass = bloomPass;
    this.director = director;
    this.onStatus = onStatus ?? (() => {});

    this.active = false;
    this.time = 0;

    // Scratch colour reused for the per-LED chase wave (no per-frame allocation).
    this._ledColor = new THREE.Color();

    // Baselines to restore when the ceremony ends.
    this._floodBase = lighting.floodlights.map((s) => s.intensity);
    this._moonBase = lighting.moon.intensity;
    this._ledBase = ledMaterial.emissiveIntensity;
    this._ledBaseColor = ledMaterial.emissive.clone();

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
    // The LED emissive and bloom strength are driven (pulsed) in update() while
    // active, ramped in over the first ~1.2 s — see update().

    this.director.setMode("cinematic");
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
    // update() stops writing these once inactive, so the tweens win.
    this._tween(this.ledMaterial, "emissiveIntensity", this._ledBase, 1000);
    // Fade the rainbow hue back to the default grey. Tween a plain 0→1 scalar
    // and lerp the colour in onUpdate (more robust than animating emissive.r/g/b
    // directly); `from` is whatever rainbow hue the LED froze on at stop time.
    const from = this.ledMaterial.emissive.clone();
    const fade = { k: 0 };
    new TWEEN.Tween(fade)
      .to({ k: 1 }, 1000)
      .onUpdate(() => {
        this.ledMaterial.emissive.lerpColors(from, this._ledBaseColor, fade.k);
      })
      .start();
    this._tween(this.bloomPass, "strength", 0, 1000);

    // Fade the roof LED matrix from its current chase colours back to idle grey.
    if (this.roofLeds) {
      const leds = this.roofLeds;
      const off = leds.userData.offColor;
      const n = leds.count;
      const fromColors = [];
      for (let i = 0; i < n; i++) {
        const cc = new THREE.Color();
        leds.getColorAt(i, cc);
        fromColors.push(cc);
      }
      const tmp = new THREE.Color();
      const ledFade = { k: 0 };
      new TWEEN.Tween(ledFade)
        .to({ k: 1 }, 1000)
        .onUpdate(() => {
          for (let i = 0; i < n; i++) {
            tmp.lerpColors(fromColors[i], off, ledFade.k);
            leds.setColorAt(i, tmp);
          }
          leds.instanceColor.needsUpdate = true;
        })
        .start();
    }

    this.director.setMode("free");
  }

  update(delta) {
    if (!this.active) return;
    this.time += delta;
    const t = this.time;
    const ramp = Math.min(1, t / 1.2); // ease the effects in

    // Sweep each beam across the infield and cycle its colour.
    this.beams.forEach((b, i) => {
      b.target.position.set(
        Math.sin(t * 0.8 + b.phase) * 45,
        2,
        Math.cos(t * 0.6 + b.phase * 1.3) * 30,
      );
      b.spot.color.setHSL((i / BEAM_COUNT + t * 0.05) % 1, 1, 0.55);
    });

    // LED ribbon: rolling rainbow + a bright, pulsing emissive glow.
    this.ledMaterial.emissive.setHSL((t * 0.1) % 1, 0.9, 0.5);
    const pulse = 2.2 + 0.9 * Math.sin(t * 4); // 1.3 .. 3.1
    this.ledMaterial.emissiveIntensity = THREE.MathUtils.lerp(
      this._ledBase,
      pulse,
      ramp,
    );

    // Roof LED matrix: a rotating rainbow chase wave around the inner rim.
    // Index i runs in order around the ring, so a phase term in i makes crests
    // of light travel; HDR (>1) magnitude makes the lit LEDs bloom.
    if (this.roofLeds) {
      const leds = this.roofLeds;
      const n = leds.count;
      const c = this._ledColor;
      for (let i = 0; i < n; i++) {
        const f = i / n;
        const hue = (f * 2 + t * 0.08) % 1; // two colour bands, slowly rotating
        const wave = 0.5 + 0.5 * Math.sin(f * Math.PI * 2 * 3 - t * 3); // 3 crests chasing
        const intensity = ramp * (1.0 + 2.4 * wave);
        c.setHSL(hue, 1.0, 0.5).multiplyScalar(intensity);
        leds.setColorAt(i, c);
      }
      leds.instanceColor.needsUpdate = true;
    }

    // Bloom breathes with the LEDs so the glow visibly pulses.
    this.bloomPass.strength = ramp * (1.1 + 0.4 * Math.abs(Math.sin(t * 2)));
  }

  _tween(obj, prop, to, duration = 1000) {
    new TWEEN.Tween(obj).to({ [prop]: to }, duration).start();
  }

  dispose() {
    this.beams.forEach((b) => b.spot.dispose());
  }
}
