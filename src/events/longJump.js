import * as THREE from "three";
import * as TWEEN from "tween";

import { Athlete } from "../athletes/athlete.js";
import {
  LJ_Z,
  LJ_RUNWAY_START_X,
  LJ_BOARD_X,
  LJ_PIT_END_X,
} from "../stadium/config.js";

/**
 * The long jump competition — 8 athletes queueing (CLAUDE.md §8).
 *
 *   idle → (per athlete) stepUp → runup → takeoff → flight → land → react → leave
 *        → next athlete … → done
 *
 * Eight competitors mill around an organic warm-up cluster beside the runway —
 * each at a randomised spot and facing, so they look like real athletes standing
 * around (some watching the track, some resting), never a strict line or lane.
 * One at a time the next athlete is called up: they walk to the start mark, run
 * up, jump, react to the distance, then climb out of the pit and walk forward to
 * a loose "finished" cluster beyond it, settling into an idle pose.
 *
 * CLAUDE.md §2: every limb pose is a HAND-WRITTEN joint method on the articulated
 * Athlete rig, and the run-up/flight are frame-by-frame kinematics (acceleration
 * + a projectile parabola) — nothing is a baked clip. tween.js drives ONLY the
 * non-jump choreography: the call-up walk to the runway and the return walk back
 * to the cluster. All tweens live in a private group for clean teardown (§6).
 *
 * Spatial note: the facility sits on the narrow apron at LJ_Z (~48.8 m) and the
 * seating bowl starts at radius ~51 m, so both clusters are placed on the
 * INFIELD side (smaller Z), verified to stay clear of the stands at every corner.
 */

// --- jump kinematics (unchanged, hand-written) -------------------------------
const G = 9.81; // gravity, m/s²
const RUN_VMAX = 8.5; // m/s approach speed
const ACCEL = 7; // m/s²
const TAKEOFF_VY = 4.5; // m/s vertical launch
const TAKEOFF_HOLD = 0.12; // s plant on the board
const PHASE_RATE = 18; // gait radians/sec at top speed

// --- choreography ------------------------------------------------------------
const COMPETITORS = 8;
const START_X = LJ_RUNWAY_START_X + 1; // where the run-up begins (~-19)
const WALK_RATE = 9; // gait radians/sec while walking/jogging
const STEPUP_MS = 1200; // call-up walk to the start mark
const PIT_EXIT_MS = 700; // climbing forward out of the sand
const LEAVE_MS = 1400; // walk on to the finished cluster

// Organic "warm-up" and "finished" clusters, both on the infield side of the
// runway (smaller Z). Athletes take a randomised spot + facing inside these
// boxes so they loosely stand around rather than lining up. Every corner stays
// inside the seating bowl (radius < ~51 m). { cx,cz: centre, hx,hz: half-extent }.
// The warm-up cluster sits beside the start; the finished cluster sits BEYOND
// the landing pit (far +X, the opposite side of the take-off board) so athletes
// walk forward out of the pit rather than back across the runway.
const WARMUP = { cx: -19, cz: LJ_Z - 6.5, hx: 3.5, hz: 3 }; // beside the start
const FINISHED = { cx: 19, cz: LJ_Z - 6.5, hx: 3, hz: 2.5 }; // beyond the pit

// Distinct singlet colours so the eight competitors read apart.
const KITS = [
  { singlet: 0x1565c0 },
  { singlet: 0xd32f2f },
  { singlet: 0x2e7d32 },
  { singlet: 0xf9a825 },
  { singlet: 0x6a1b9a },
  { singlet: 0x00838f },
  { singlet: 0xe65100 },
  { singlet: 0x37474f },
];

/**
 * One competitor: an Athlete with a relaxed idle pose for the waiting phases.
 * The athlete currently jumping is driven directly by the event each frame.
 */
class Jumper {
  /** @param {Athlete} athlete */
  constructor(athlete) {
    this.athlete = athlete;
    this.phase = Math.random() * Math.PI * 2;
  }

  get root() {
    return this.athlete.root;
  }

  faceDir(dx, dz) {
    if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) return;
    this.root.rotation.y = Math.atan2(-dz, dx);
  }

  idle() {
    this.athlete.applyIdle();
    this.root.position.y = 0;
  }
}

export class LongJumpEvent {
  /**
   * The event OWNS all 8 athletes: it builds them, adds them to the scene, and
   * disposes them on teardown (EventManager "one sport at a time", CLAUDE.md §6).
   *
   * @param {{ scene: import("three").Scene,
   *           onStatus?: (text: string) => void,
   *           director?: import("../cameras/director.js").Director }} ctx
   */
  constructor({ scene, onStatus, director } = {}) {
    this.scene = scene;
    this.onStatus = onStatus ?? (() => {});
    this.director = director ?? null;

    this.subjectType = "jumper";
    this.tweens = new TWEEN.Group();

    this.boardX = LJ_BOARD_X;
    this.z = LJ_Z;

    /** @type {Jumper[]} */
    this.competitors = [];
    for (let i = 0; i < COMPETITORS; i++) {
      const athlete = new Athlete(KITS[i]);
      scene.add(athlete.root);
      const j = new Jumper(athlete);
      j.index = i;
      this.competitors.push(j);
    }

    this.reset();
  }

  /** The director follows the active jumper (or the front of the queue). */
  get subject() {
    return (this.active ?? this.competitors[0]).root;
  }

  /** A random standing spot inside one of the organic clusters. */
  _randomSpot(zone) {
    return new THREE.Vector3(
      zone.cx + (Math.random() * 2 - 1) * zone.hx,
      0,
      zone.cz + (Math.random() * 2 - 1) * zone.hz,
    );
  }

  // --- lifecycle -------------------------------------------------------------

  reset() {
    this.tweens.removeAll();
    this.activeState = "idle";
    this.done = false;
    this.t = 0;
    this.phase = 0;
    this.speed = 0;
    this.vx = 0;
    this.vy = 0;
    this.flightT = 0;
    this.flightDur = 1;
    this.distance = 0;

    this.active = null;
    this.waiting = [...this.competitors];
    this.finished = [];

    // Scatter the competitors organically around the warm-up cluster, each with
    // a random facing — standing around naturally rather than in a line.
    this.competitors.forEach((j) => {
      j.root.position.copy(this._randomSpot(WARMUP));
      j.root.rotation.set(0, Math.random() * Math.PI * 2, 0);
      j.idle();
    });

    this.onStatus('Press "Start long jump"');
  }

  start() {
    if (this.activeState !== "idle" && !this.done) return;
    this.reset();
    this._beginNext();
  }

  update(delta) {
    this.tweens.update();

    // Every athlete except the one currently jumping stands relaxed in a cluster.
    for (const j of this.competitors) {
      if (j !== this.active) j.idle();
    }

    this._updateActive(delta);
  }

  // --- per-athlete sequence --------------------------------------------------

  _beginNext() {
    if (this.waiting.length === 0) {
      this._finish();
      return;
    }
    this.active = this.waiting.shift();
    if (this.director) this.director.setSubject(this.active.root, "jumper");
    this._enterStepUp();
  }

  _enterStepUp() {
    const j = this.active;
    const target = new THREE.Vector3(START_X, 0, this.z);
    j.faceDir(target.x - j.root.position.x, target.z - j.root.position.z);
    this._enter("stepUp", `Athlete ${j.index + 1} — up next`);
    this.phase = 0;
    new TWEEN.Tween(j.root.position, this.tweens)
      .to({ x: target.x, z: target.z }, STEPUP_MS)
      .easing(TWEEN.Easing.Quadratic.InOut)
      .onComplete(() => {
        j.faceDir(1, 0);
        this.speed = 0;
        this._enter("runup", "Run-up!");
      })
      .start();
  }

  _enterLeave() {
    const j = this.active;
    this._enter("leave", "");
    this.phase = 0;

    // Stage 1: climb forward out of the sand toward the pit's infield corner.
    const exit = new THREE.Vector3(LJ_PIT_END_X, 0, this.z - 4);
    // Stage 2: settle at a random spot in the organic "finished" cluster, which
    // sits beyond the pit (not a line) — facing some natural direction.
    const spot = this._randomSpot(FINISHED);
    j._restRot = Math.random() * Math.PI * 2;

    j.faceDir(exit.x - j.root.position.x, exit.z - j.root.position.z);
    new TWEEN.Tween(j.root.position, this.tweens)
      .to({ x: exit.x, z: exit.z }, PIT_EXIT_MS)
      .easing(TWEEN.Easing.Quadratic.Out)
      .onComplete(() => {
        j.faceDir(spot.x - j.root.position.x, spot.z - j.root.position.z);
        new TWEEN.Tween(j.root.position, this.tweens)
          .to({ x: spot.x, z: spot.z }, LEAVE_MS)
          .easing(TWEEN.Easing.Quadratic.InOut)
          .onComplete(() => this._onLeaveComplete())
          .start();
      })
      .start();
  }

  _onLeaveComplete() {
    const j = this.active;
    j.root.rotation.y = j._restRot ?? 0; // settle into a relaxed, natural facing
    this.finished.push(j);
    this.active = null;
    this._beginNext();
  }

  _finish() {
    this.activeState = "done";
    this.done = true;
    this.onStatus("Competition over 🏁");
  }

  // --- active-athlete frame driver (jump kinematics, hand-written) -----------

  _updateActive(dt) {
    if (!this.active) return;
    const a = this.active.athlete;
    const root = this.active.root;
    this.t += dt;

    switch (this.activeState) {
      case "stepUp": {
        // Position is tween-driven; just play a walking gait.
        this.phase += dt * WALK_RATE;
        a.applyRun(this.phase, 0.45);
        root.position.y = 0.03 * Math.abs(Math.sin(this.phase));
        break;
      }

      case "runup": {
        this.speed = Math.min(RUN_VMAX, this.speed + ACCEL * dt);
        const f = this.speed / RUN_VMAX;
        root.position.x += this.speed * dt;
        this.phase += dt * f * PHASE_RATE;
        a.applyRun(this.phase, Math.min(1, 0.5 + f));
        root.position.y = 0.04 * Math.abs(Math.sin(this.phase));
        if (root.position.x >= this.boardX) this._enter("takeoff", "Takeoff! 🦘");
        break;
      }

      case "takeoff": {
        a.applyGather();
        root.position.y = 0;
        if (this.t >= TAKEOFF_HOLD) {
          this.vy = TAKEOFF_VY;
          this.vx = Math.max(this.speed, 6);
          this.flightT = 0;
          this.flightDur = (2 * this.vy) / G;
          this._enter("flight", "✈️");
        }
        break;
      }

      case "flight": {
        this.flightT += dt;
        const p = Math.min(1, this.flightT / this.flightDur);
        root.position.x += this.vx * dt;
        const y = this.vy * this.flightT - 0.5 * G * this.flightT * this.flightT;
        root.position.y = Math.max(0, y);
        a.applyFlight(p);
        if (this.flightT >= this.flightDur) {
          root.position.y = 0;
          this.distance = root.position.x - this.boardX;
          this._enter("land", `Jump: ${this.distance.toFixed(2)} m`);
        }
        break;
      }

      case "land": {
        a.applyGather();
        if (this.t > 0.7) this._enter("react", `🏅 ${this.distance.toFixed(2)} m!`);
        break;
      }

      case "react": {
        a.applyCelebrate(this.t);
        root.position.y = 0.05 * Math.abs(Math.sin(this.t * 5));
        if (this.t > 1.4) this._enterLeave();
        break;
      }

      default:
        break;
    }
  }

  _enter(state, status) {
    this.activeState = state;
    this.t = 0;
    if (status) this.onStatus(status);
  }

  /** Remove all athletes from the scene and free all GPU resources. */
  dispose() {
    this.tweens.removeAll();
    for (const j of this.competitors) {
      this.scene?.remove(j.root);
      j.athlete.dispose();
    }
  }
}
