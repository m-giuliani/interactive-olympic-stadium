import {
  STRAIGHT_HALF,
  TRACK_INNER_RADIUS,
  LANE_WIDTH,
} from "../stadium/config.js";

/**
 * The sprint event state machine (CLAUDE.md §8, priority 2):
 *
 *   idle → marks → set → run → finish → celebrate
 *
 * The athlete runs down one straight of the track. All motion is driven here
 * frame-by-frame: the root translates along +X while the hand-written gait
 * (Athlete.applyRun) animates the joints. Nothing is a baked clip.
 */

const LANE_INDEX = 3; // 0-based; lane 4
const V_MAX = 10; // m/s, sprinter top speed
const ACCEL = 6; // m/s²
const DECEL = 8; // m/s² after the line
const PHASE_RATE = 20; // gait radians/sec at top speed

export class SprintEvent {
  /**
   * @param {import("../athletes/athlete.js").Athlete} athlete
   * @param {{ onStatus?: (text: string) => void }} [opts]
   */
  constructor(athlete, opts = {}) {
    this.athlete = athlete;
    this.onStatus = opts.onStatus ?? (() => {});

    this.laneZ = TRACK_INNER_RADIUS + (LANE_INDEX + 0.5) * LANE_WIDTH;
    this.startX = -STRAIGHT_HALF + 2;
    this.finishX = STRAIGHT_HALF - 2;

    this.reset();
  }

  reset() {
    this.state = "idle";
    this.t = 0;
    this.phase = 0;
    this.speed = 0;
    this.athlete.root.position.set(this.startX, 0, this.laneZ);
    this.athlete.root.rotation.y = 0; // facing +X, down the straight
    this.athlete.applyIdle();
    this.onStatus('Press "Start race"');
  }

  /** Begin the countdown (only from a settled state). */
  start() {
    if (this.state === "marks" || this.state === "set" || this.state === "run") {
      return;
    }
    this.reset();
    this.state = "marks";
    this.t = 0;
    this.athlete.applySet();
    this.onStatus("On your marks…");
  }

  get running() {
    return this.state === "run" || this.state === "finish";
  }

  update(delta) {
    this.t += delta;

    switch (this.state) {
      case "marks":
        if (this.t > 1.6) this._enter("set", "Set…");
        break;

      case "set":
        if (this.t > 1.2) {
          this._enter("run", "GO! 🔫");
          this.speed = 0;
        }
        break;

      case "run":
        this.speed = Math.min(V_MAX, this.speed + ACCEL * delta);
        this._advance(delta);
        if (this.athlete.root.position.x >= this.finishX) {
          this._enter("finish", "Finish! 🏁");
        }
        break;

      case "finish":
        this.speed = Math.max(0, this.speed - DECEL * delta);
        this._advance(delta);
        if (this.speed <= 0.05) {
          this._enter("celebrate", "🏆 Winner!");
          this.athlete.root.position.y = 0;
        }
        break;

      case "celebrate":
        this.athlete.applyCelebrate(this.t);
        this.athlete.root.position.y = 0.06 * Math.abs(Math.sin(this.t * 5));
        break;

      case "idle":
      default:
        break;
    }
  }

  // --- helpers ---------------------------------------------------------------

  _enter(state, status) {
    this.state = state;
    this.t = 0;
    this.onStatus(status);
  }

  /** Translate along the straight and drive the gait from the current speed. */
  _advance(delta) {
    const f = this.speed / V_MAX;
    this.athlete.root.position.x += this.speed * delta;
    this.phase += delta * f * PHASE_RATE;
    const amp = Math.min(1, 0.4 + f);
    this.athlete.applyRun(this.phase, amp);
    this.athlete.root.position.y = 0.04 * Math.abs(Math.sin(this.phase));
  }
}
