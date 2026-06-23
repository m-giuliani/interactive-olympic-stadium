import * as THREE from "three";

/**
 * Manages the active camera behaviour (CLAUDE.md §8 priority 2: tracking camera).
 *
 * Two modes share the single scene camera:
 *  - "orbit"  : free OrbitControls (the default).
 *  - "follow" : a trackside broadcast view that smoothly trucks alongside the
 *               runner. OrbitControls are disabled so they don't fight it.
 *
 * Everything is plain interpolation in update(delta) — no extra cameras to
 * swap, so the renderer keeps drawing through the same camera.
 */
export class CameraRig {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {import("three/addons/controls/OrbitControls.js").OrbitControls} controls
   */
  constructor(camera, controls) {
    this.camera = camera;
    this.controls = controls;
    this.mode = "orbit";
    this.target = null;

    // Offset relative to the runner. NOTE the negative Z: the sprint lane sits
    // at +Z, so the camera must sit on the INFIELD side (smaller Z) to stay
    // clear of the seating bowl — a positive Z offset would bury the camera
    // inside the dark stands and the view would read as black.
    this.offset = new THREE.Vector3(3, 3.5, -11);
    this._look = controls.target.clone();
    this._tmp = new THREE.Vector3();

    // Cinematic (ceremony) auto-sweep state.
    this._cineTime = 0;
  }

  /** Object whose position the follow camera tracks. */
  follow(object3d) {
    this.target = object3d;
  }

  setMode(mode) {
    this.mode = mode;
    this.controls.enabled = mode === "orbit";
    if (mode === "orbit") {
      // Hand control back smoothly from wherever we are looking.
      this.controls.target.copy(this._look);
      this.controls.update();
    }
  }

  update(delta) {
    // Clamp delta so a tab-switch pause (or a bad value) can't blow up the lerp
    // and feed a NaN into the camera matrix.
    const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), 0.1) : 0;

    if (this.mode === "cinematic") {
      // Slow, grand aerial orbit of the whole stadium for the ceremony, with
      // gently breathing radius and height for drama.
      this._cineTime += dt;
      const t = this._cineTime;
      const angle = t * 0.15;
      const radius = 135 + 25 * Math.sin(t * 0.1);
      const height = 40 + 18 * Math.sin(t * 0.07);
      this.camera.position.set(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius,
      );
      this.camera.lookAt(0, 8, 0);
      return;
    }

    if (this.mode === "follow" && this.target) {
      const p = this.target.position;

      // Defensive: never track a non-finite position — it would NaN the matrix
      // and black out the screen. Fall back to orbit-style update instead.
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
        this.controls.update();
        return;
      }

      const k = 1 - Math.exp(-dt * 3); // frame-rate independent smoothing

      this._tmp.copy(p).add(this.offset);
      this.camera.position.lerp(this._tmp, k);

      this._tmp.set(p.x + 1, p.y + 1, p.z);
      this._look.lerp(this._tmp, k);
      this.camera.lookAt(this._look);
    } else {
      this.controls.update();
    }
  }
}
