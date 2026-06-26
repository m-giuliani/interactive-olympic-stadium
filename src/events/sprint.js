import * as THREE from "three";

import { Athlete } from "../athletes/athlete.js";
import {
  STRAIGHT_HALF,
  TRACK_INNER_RADIUS,
  LANE_WIDTH,
} from "../stadium/config.js";

/**
 * The 100 m sprint — an 8-lane race (CLAUDE.md §8, priority 2):
 *
 *   idle → marks → set → racing → over
 *
 * Eight sprinters line up one per lane and race down the +Z straight. Each runs
 * with its own randomised top speed / acceleration / reaction time, so there is
 * a genuine finishing order. The first across the line wins and celebrates; the
 * rest decelerate and settle.
 *
 * CLAUDE.md §2: all motion is frame-by-frame and hand-written — each root
 * translates along +X while the gait (Athlete.applyRun) rotates the joints.
 * Nothing is a baked clip, and there are no tweens here to leak.
 */

const LANES = 8;
const DECEL = 8; // m/s² after the line
const PHASE_RATE = 20; // gait radians/sec at top speed
const MARKS_TIME = 1.6; // "on your marks" hold
const SET_TIME = 1.2; // "set" hold

// Per-lane physical spread (randomised each race within these bands).
const VMAX_MIN = 9.6;
const VMAX_SPAN = 1.2; // → 9.6 .. 10.8 m/s
const ACCEL_MIN = 5.6;
const ACCEL_SPAN = 1.0; // → 5.6 .. 6.6 m/s²
const REACTION_SPAN = 0.16; // up to 0.16 s of reaction stagger at the gun

// Distinct singlet colours so the eight lanes read apart.
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

const laneZ = (lane) => TRACK_INNER_RADIUS + (lane + 0.5) * LANE_WIDTH;

/** One runner: an Athlete plus its per-race physical state. */
class Sprinter {
  /** @param {Athlete} athlete @param {number} lane */
  constructor(athlete, lane) {
    this.athlete = athlete;
    this.lane = lane;
    this.laneZ = laneZ(lane);
    this.phase = 0;
    this.speed = 0;
    this.vmax = 10;
    this.accel = 6;
    this.reaction = 0;
    this.finished = false;
    this.rank = 0;
    this.winner = false;
    this.celeT = 0;
  }

  get root() {
    return this.athlete.root;
  }
}

export class SprintEvent {
  /**
   * The event OWNS all 8 runners: it builds them, adds them to the scene, and
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

    this.subjectType = "sprinter";

    this.startX = -STRAIGHT_HALF + 2;
    this.finishX = STRAIGHT_HALF - 2;
    this.centerZ = TRACK_INNER_RADIUS + 4 * LANE_WIDTH; // middle of the 8 lanes

    /** @type {Sprinter[]} */
    this.sprinters = [];
    for (let lane = 0; lane < LANES; lane++) {
      const athlete = new Athlete(KITS[lane]);
      scene.add(athlete.root);
      this.sprinters.push(new Sprinter(athlete, lane));
    }

    // A virtual subject the camera tracks: it rides the leading edge of the race
    // down the straight, centred across the lanes (kept out of the scene graph;
    // the director only reads its transform).
    this.leaderProxy = new THREE.Object3D();

    this.reset();
  }

  /** The director follows the leading edge of the race. */
  get subject() {
    return this.leaderProxy;
  }

  // --- lifecycle -------------------------------------------------------------

  reset() {
    this.state = "idle";
    this.t = 0;
    this.raceT = 0;
    this.finishCount = 0;
    this.winner = null;

    for (const s of this.sprinters) {
      s.phase = 0;
      s.speed = 0;
      s.finished = false;
      s.rank = 0;
      s.winner = false;
      s.celeT = 0;
      // Fresh randomised abilities so every race differs.
      s.vmax = VMAX_MIN + Math.random() * VMAX_SPAN;
      s.accel = ACCEL_MIN + Math.random() * ACCEL_SPAN;
      s.reaction = Math.random() * REACTION_SPAN;
      s.root.position.set(this.startX, 0, s.laneZ);
      s.root.rotation.y = 0; // facing +X, down the straight
      s.athlete.applyIdle();
    }

    this.leaderProxy.position.set(this.startX, 1, this.centerZ);
    this.onStatus('Press "Start race"');
  }

  start() {
    if (["marks", "set", "racing"].includes(this.state)) return;
    this.reset();
    this._enter("marks", "On your marks…");
    for (const s of this.sprinters) s.athlete.applySet();
  }

  update(delta) {
    switch (this.state) {
      case "marks":
        this.t += delta;
        if (this.t > MARKS_TIME) this._enter("set", "Set…");
        break;

      case "set":
        this.t += delta;
        if (this.t > SET_TIME) {
          this._enter("racing", "GO! 🔫");
          this.raceT = 0;
        }
        break;

      case "racing":
        this.raceT += delta;
        for (const s of this.sprinters) this._runSprinter(s, delta);
        this._updateLeader();
        if (this.finishCount === this.sprinters.length) {
          this._enter("over", "");
          if (this.director && this.winner) {
            this.director.setSubject(this.winner.root, "sprinter");
          }
        }
        break;

      case "over":
        for (const s of this.sprinters) this._runSprinter(s, delta);
        break;

      case "idle":
      default:
        break;
    }
  }

  // --- per-runner driver -----------------------------------------------------

  _runSprinter(s, dt) {
    if (s.finished) {
      // Decelerate past the line, then celebrate (winner) or settle (rest).
      if (s.speed > 0.05) {
        s.speed = Math.max(0, s.speed - DECEL * dt);
        this._stride(s, dt);
      } else if (s.winner) {
        s.celeT += dt;
        s.athlete.applyCelebrate(s.celeT);
        s.root.position.y = 0.06 * Math.abs(Math.sin(s.celeT * 5));
      } else {
        s.athlete.applyIdle();
        s.root.position.y = 0;
      }
      return;
    }

    // Reaction stagger: hold the set crouch until this runner's gun reaction.
    if (this.raceT < s.reaction) {
      s.athlete.applySet();
      return;
    }

    s.speed = Math.min(s.vmax, s.speed + s.accel * dt);
    this._stride(s, dt);

    if (s.root.position.x >= this.finishX) {
      s.finished = true;
      s.rank = ++this.finishCount;
      if (s.rank === 1) {
        s.winner = true;
        this.winner = s;
        this.onStatus(`🏁 Lane ${s.lane + 1} wins!`);
      }
    }
  }

  /** Translate along the straight and drive the gait from the current speed. */
  _stride(s, dt) {
    const f = s.speed / s.vmax;
    s.root.position.x += s.speed * dt;
    s.phase += dt * f * PHASE_RATE;
    s.athlete.applyRun(s.phase, Math.min(1, 0.4 + f));
    s.root.position.y = 0.04 * Math.abs(Math.sin(s.phase));
  }

  /** Ride the camera proxy along the front of the field. */
  _updateLeader() {
    let lead = this.startX;
    for (const s of this.sprinters) lead = Math.max(lead, s.root.position.x);
    this.leaderProxy.position.set(
      Math.min(lead, this.finishX),
      1,
      this.centerZ,
    );
  }

  _enter(state, status) {
    this.state = state;
    this.t = 0;
    if (status) this.onStatus(status);
  }

  /** Remove all runners from the scene and free all GPU resources. */
  dispose() {
    for (const s of this.sprinters) {
      this.scene?.remove(s.root);
      s.athlete.dispose();
    }
  }
}
