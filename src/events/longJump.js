import { LJ_Z, LJ_RUNWAY_START_X, LJ_BOARD_X } from "../stadium/config.js";

/**
 * The long jump event state machine (CLAUDE.md §8, priority 4):
 *
 *   idle → runup → takeoff → flight → land → celebrate
 *
 * Reuses the same articulated Athlete rig as the sprint (CLAUDE.md §7: the rig
 * is parametric and reusable). The run-up uses the hand-written gait; the flight
 * is a transform-driven projectile parabola with a hand-written sail→reach pose.
 * Nothing is a baked clip.
 */

const G = 9.81; // gravity, m/s²
const RUN_VMAX = 8.5; // m/s approach speed
const ACCEL = 7; // m/s²
const TAKEOFF_VY = 4.5; // m/s vertical launch
const TAKEOFF_HOLD = 0.12; // s plant on the board
const PHASE_RATE = 18; // gait radians/sec at top speed

export class LongJumpEvent {
  /**
   * @param {import("../athletes/athlete.js").Athlete} athlete
   * @param {{ onStatus?: (text: string) => void }} [opts]
   */
  constructor(athlete, opts = {}) {
    this.athlete = athlete;
    this.onStatus = opts.onStatus ?? (() => {});

    this.startX = LJ_RUNWAY_START_X + 1;
    this.boardX = LJ_BOARD_X;
    this.z = LJ_Z;

    this.reset();
  }

  reset() {
    this.state = "idle";
    this.t = 0;
    this.phase = 0;
    this.speed = 0;
    this.vx = 0;
    this.vy = 0;
    this.flightT = 0;
    this.flightDur = 1;
    this.distance = 0;
    this.athlete.root.position.set(this.startX, 0, this.z);
    this.athlete.root.rotation.y = 0; // facing +X, down the runway
    this.athlete.applyIdle();
    this.onStatus('Press "Start long jump"');
  }

  start() {
    if (["runup", "takeoff", "flight"].includes(this.state)) return;
    this.reset();
    this._enter("runup", "Run-up!");
  }

  get running() {
    return this.state === "runup" || this.state === "flight";
  }

  update(delta) {
    this.t += delta;

    switch (this.state) {
      case "runup": {
        this.speed = Math.min(RUN_VMAX, this.speed + ACCEL * delta);
        const f = this.speed / RUN_VMAX;
        this.athlete.root.position.x += this.speed * delta;
        this.phase += delta * f * PHASE_RATE;
        this.athlete.applyRun(this.phase, Math.min(1, 0.5 + f));
        this.athlete.root.position.y = 0.04 * Math.abs(Math.sin(this.phase));
        if (this.athlete.root.position.x >= this.boardX) {
          this._enter("takeoff", "Takeoff! 🦘");
        }
        break;
      }

      case "takeoff": {
        // Brief plant on the board before launching.
        this.athlete.applyGather();
        this.athlete.root.position.y = 0;
        if (this.t >= TAKEOFF_HOLD) {
          this.vy = TAKEOFF_VY;
          this.vx = Math.max(this.speed, 6);
          this.flightT = 0;
          this.flightDur = (2 * this.vy) / G; // time back to ground
          this._enter("flight", "✈️");
        }
        break;
      }

      case "flight": {
        this.flightT += delta;
        const p = Math.min(1, this.flightT / this.flightDur);
        this.athlete.root.position.x += this.vx * delta;
        // Vertical kinematics: y = vy·t − ½g·t²
        const y = this.vy * this.flightT - 0.5 * G * this.flightT * this.flightT;
        this.athlete.root.position.y = Math.max(0, y);
        this.athlete.applyFlight(p);
        if (this.flightT >= this.flightDur) {
          this.athlete.root.position.y = 0;
          this.distance = this.athlete.root.position.x - this.boardX;
          this._enter("land", `Jump: ${this.distance.toFixed(2)} m`);
        }
        break;
      }

      case "land": {
        this.athlete.applyGather(); // absorb the landing
        if (this.t > 0.7) this._enter("celebrate", `🏅 ${this.distance.toFixed(2)} m!`);
        break;
      }

      case "celebrate":
        this.athlete.applyCelebrate(this.t);
        this.athlete.root.position.y = 0.05 * Math.abs(Math.sin(this.t * 5));
        break;

      case "idle":
      default:
        break;
    }
  }

  _enter(state, status) {
    this.state = state;
    this.t = 0;
    this.onStatus(status);
  }
}
