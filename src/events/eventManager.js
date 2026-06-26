/**
 * EventManager — the central "one sport at a time" controller.
 *
 * The stadium hosts exactly one sport at a time. Triggering an event from the
 * GUI must:
 *   1. completely TEAR DOWN the previous event — remove its athletes/props from
 *      the scene and dispose their geometries, materials and textures (no GPU
 *      leaks, CLAUDE.md §6);
 *   2. reset the camera to the default BROADCAST view;
 *   3. build the requested event FRESH and start its sequence.
 *
 * Events are registered as factories so they are constructed lazily, on demand,
 * and discarded on teardown. Each event a factory returns must implement:
 *
 *   - update(delta)                  per-frame driver
 *   - dispose()                      remove from scene + free all GPU resources
 *   - start()            (optional)  begin the sequence
 *   - subject            (optional)  THREE.Object3D for the camera to follow
 *   - subjectType        (optional)  director subject tag ("sprinter" | …)
 */
export class EventManager {
  /**
   * @param {{ scene: import("three").Scene,
   *           director: import("../cameras/director.js").Director,
   *           onStatus?: (text: string) => void }} ctx
   */
  constructor({ scene, director, onStatus } = {}) {
    this.scene = scene;
    this.director = director;
    this.onStatus = onStatus ?? (() => {});

    /** @type {Map<string, (ctx: object) => object>} */
    this._factories = new Map();

    this.current = null; // active event instance
    this.currentKey = null;
  }

  /**
   * Register an event factory under a key.
   * @param {string} key
   * @param {(ctx: { scene, director, onStatus }) => object} factory
   */
  register(key, factory) {
    this._factories.set(key, factory);
    return this;
  }

  /**
   * Tear down the current event, reset the camera to Broadcast, then build and
   * start the requested one. This is the single entry point the GUI calls.
   * @param {string} key
   */
  play(key) {
    const factory = this._factories.get(key);
    if (!factory) {
      console.warn(`[EventManager] unknown event "${key}"`);
      return;
    }

    // 1. Clear the field (dispose the previous event entirely).
    this.clear();

    // 2. Reset the camera to the default Broadcast view.
    this.director.setMode("broadcast");

    // 3. Build the new event fresh and start it.
    this.current = factory({
      scene: this.scene,
      director: this.director,
      onStatus: this.onStatus,
    });
    this.currentKey = key;

    if (this.current.subject) {
      this.director.setSubject(this.current.subject, this.current.subjectType);
    }
    this.current.start?.();
  }

  /**
   * Dispose the active event and empty the field. Safe to call when idle.
   */
  clear() {
    if (!this.current) return;
    this.current.dispose?.();
    this.current = null;
    this.currentKey = null;
    // Hand the camera back to the roaming drone (a calm pitch view).
    this.director.setSubject(null);
    this.onStatus("");
  }

  /** Advance the active event (called once per frame, before the director). */
  update(delta) {
    this.current?.update?.(delta);
  }
}
