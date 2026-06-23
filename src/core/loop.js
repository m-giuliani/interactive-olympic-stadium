import * as THREE from "three";
import * as TWEEN from "tween";

/**
 * The single requestAnimationFrame loop for the whole experience
 * (CLAUDE.md §6). Everything that needs per-frame updates registers a callback
 * here instead of starting its own loop.
 *
 * Each callback receives `(delta, elapsed)` in seconds from a shared
 * THREE.Clock, so animations are frame-rate independent — never hardcode a
 * frame rate. TWEEN.update() is called exactly once per frame here.
 */
export class Loop {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {THREE.Camera} camera
   */
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.clock = new THREE.Clock();
    /** @type {Array<(delta: number, elapsed: number) => void>} */
    this.updatables = [];
    this._running = false;
    // Optional render override (e.g. an EffectComposer for post-processing).
    this.renderFunction = null;
    this._tick = this._tick.bind(this);
  }

  /**
   * Override how the frame is presented. Pass a function that draws the frame
   * (e.g. `() => composer.render()`); pass null to fall back to the plain
   * renderer.
   * @param {(() => void) | null} fn
   */
  setRenderFunction(fn) {
    this.renderFunction = fn;
  }

  /**
   * Register a per-frame update callback.
   * @param {(delta: number, elapsed: number) => void} fn
   * @returns {() => void} an unsubscribe function.
   */
  add(fn) {
    this.updatables.push(fn);
    return () => {
      const i = this.updatables.indexOf(fn);
      if (i !== -1) this.updatables.splice(i, 1);
    };
  }

  start() {
    if (this._running) return;
    this._running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(this._tick);
  }

  stop() {
    this._running = false;
    this.renderer.setAnimationLoop(null);
    this.clock.stop();
  }

  _tick() {
    const delta = this.clock.getDelta();
    const elapsed = this.clock.getElapsedTime();

    // Drive tween.js once per frame. Call with no argument so it uses tween's
    // own clock (the same one Tween.start() stamps against) — passing the
    // THREE.Clock time here would desync every tween.
    TWEEN.update();

    // Guard each callback: a throw in one updatable must NOT stop the render,
    // otherwise the canvas clears to black (preserveDrawingBuffer is false).
    // The error is logged once (de-duplicated) so it stays visible in console.
    for (const fn of this.updatables) {
      try {
        fn(delta, elapsed);
      } catch (err) {
        const msg = String(err && err.stack ? err.stack : err);
        if (this._lastError !== msg) {
          this._lastError = msg;
          console.error("[Loop] update callback threw:", err);
        }
      }
    }

    if (this.renderFunction) this.renderFunction();
    else this.renderer.render(this.scene, this.camera);
  }
}
