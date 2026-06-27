import * as THREE from "three";
import * as TWEEN from "tween";

import { Athlete } from "../athletes/athlete.js";
import { LJ_Z, LJ_BOARD_X, LJ_PIT_END_X } from "../stadium/config.js";

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
const TAKEOFF_VY = 4.5; // m/s vertical launch — higher arc reads as a clear leap
const TAKEOFF_PLANT_S = 0.14; // s single-foot board strike (no stopping)

// --- choreography ------------------------------------------------------------
const COMPETITORS = 8;
const STEPUP_MS = 4500; // calm walk to the start mark
const PIT_EXIT_MS = 1800; // climbing forward out of the sand (relaxed pace)
const LEAVE_MS = 3800; // chill walk on to the finished cluster
const SCOREBOARD_MS = 3500; // pause for official measurement before the next jumper
const GETUP_S = 1.1; // seconds spent pushing up out of the sand
const SAND_SINK_S = 0.22; // seconds for the body to settle (sink) into the sand

// One full gait cycle (2π of phase) advances the body one stride; tying the
// phase to the distance ACTUALLY travelled at this ratio keeps the stance foot
// planted instead of sliding ("moonwalking"). ~1.3 m per stride reads natural.
const STRIDE_LENGTH = 2.6; // metres covered per full gait cycle. Chosen so that at
// the RUN_VMAX approach speed the leg cadence (speed / STRIDE_LENGTH ≈ 3.3 Hz)
// matches the 100 m sprint's cadence — the legs no longer churn unnaturally fast.
const PHASE_PER_M = (2 * Math.PI) / STRIDE_LENGTH; // radians of phase per metre

// Perfect foot placement on the board: make the run-up an EXACT whole number of
// strides and tie the run-up gait phase to displacement, so the plant (left)
// foot lands flat on the take-off board every single time instead of arriving
// mid-air at an arbitrary point. BOARD_PHASE is the gait phase at which the left
// leg is vertical and straight beneath the body (see applyRun / _legPose); we
// seed the run-up at it so, after a whole number of cycles, the phase returns to
// it precisely as root.position.x reaches the board.
const PLANT_STRIDES = 9; // whole gait cycles in the run-up
const RUNUP_DIST = PLANT_STRIDES * STRIDE_LENGTH; // 23.4 m
const START_X = LJ_BOARD_X - RUNUP_DIST; // ≈ -17.4 (inside the runway, > -20)
const BOARD_PHASE = Math.PI; // left leg planted straight down at this phase

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
   *           director?: import("../cameras/director.js").Director,
   *           pit?: { sand?: { impact: Function, update: Function, reset: Function } } }} ctx
   */
  constructor({ scene, onStatus, director, pit } = {}) {
    this.scene = scene;
    this.onStatus = onStatus ?? (() => {});
    this.director = director ?? null;

    // The persistent sand pit's responsive-sand API (crater + splash). The pit
    // is owned by the stadium (NOT this event), so we only drive and reset it —
    // never dispose it. See createLongJumpPit().
    this.sand = pit?.sand ?? null;

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
    this.sand?.reset(); // flatten any craters and clear leftover splash grains
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
    this._slideStampX = null;

    // Winner tracking: the best jump of the competition and who made it. Only
    // this athlete celebrates, and only once the very last jumper has finished.
    this.bestDistance = 0;
    this.winner = null;
    this.celebrateT = 0;

    this.active = null;
    this.waiting = [...this.competitors];
    this.finished = [];

    // Frame-to-frame tracking of the active athlete's ground movement, so the
    // walking gait can be driven by REAL distance covered (no foot sliding).
    this._prevActive = null;
    this._prevPos = null;
    this._frameDist = 0;

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

    // Drive the sand splash physics every frame (hand-written projectile
    // integration in the pit), independent of the athlete state machine, so
    // grains keep arcing and settling after the landing pose has moved on.
    this.sand?.update(delta);

    // Measure how far the active athlete actually moved this frame (the tweens
    // above just updated their position). The leave-phase gait uses this so the
    // stride matches the real ground speed and the feet stay planted.
    if (this.active) {
      const p = this.active.root.position;
      if (this._prevActive === this.active && this._prevPos) {
        this._frameDist = Math.hypot(p.x - this._prevPos.x, p.z - this._prevPos.z);
      } else {
        this._frameDist = 0;
        this._prevPos = new THREE.Vector3();
      }
      this._prevPos.copy(p);
      this._prevActive = this.active;
    }

    // Once the competition is over, the single winner celebrates in place while
    // everyone else holds a relaxed idle pose in the finished cluster.
    if (this.done && this.winner) {
      this.celebrateT += delta;
      for (const j of this.competitors) {
        if (j === this.winner) {
          j.athlete.applyCelebrate(this.celebrateT);
          j.root.position.y = 0.05 * Math.abs(Math.sin(this.celebrateT * 5));
        } else {
          j.idle();
        }
      }
      return;
    }

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
        // Seed the gait phase so that — with the run-up an exact whole number of
        // strides and the phase tied to displacement — the plant (left) foot
        // arrives flat on the board.
        this.phase = BOARD_PHASE;
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

    this.sand?.reset();

    // Realistic broadcast beat: hold on the just-finished athlete while the
    // officials "measure" and the scoreboard updates, before calling the next
    // jumper. They stay this.active so update() leaves them in their idle pose.
    this.activeState = "scoreboard";
    this.onStatus("Waiting for official measurement… 📏");
    new TWEEN.Tween({ d: 0 }, this.tweens)
      .to({ d: 1 }, SCOREBOARD_MS)
      .onComplete(() => {
        this.active = null;
        this._beginNext();
      })
      .start();
  }

  _finish() {
    this.activeState = "done";
    this.done = true;
    this.celebrateT = 0;
    // Everyone has jumped: announce the winner, whose celebration is now driven
    // each frame in update() while the rest hold their idle pose.
    if (this.winner) {
      this.onStatus(
        `🏆 Athlete ${this.winner.index + 1} wins — ${this.bestDistance.toFixed(2)} m`,
      );
    } else {
      this.onStatus("Competition over 🏁");
    }
  }

  // --- active-athlete frame driver (jump kinematics, hand-written) -----------

  _updateActive(dt) {
    if (!this.active) return;
    const a = this.active.athlete;
    const root = this.active.root;
    this.t += dt;

    switch (this.activeState) {
      case "stepUp": {
        // Position is tween-driven; drive the gait by the distance ACTUALLY
        // covered this frame (like the leave walk) so the feet stay planted and
        // the long, calm approach reads as a relaxed natural stride.
        const speed = dt > 0 ? this._frameDist / dt : 0;
        this.phase += this._frameDist * PHASE_PER_M;
        const amp = THREE.MathUtils.clamp(speed / 2.2, 0.12, 0.5);
        a.applyRun(this.phase, amp);
        root.position.y = 0.025 * amp * Math.abs(Math.sin(this.phase));
        break;
      }

      case "runup": {
        this.speed = Math.min(RUN_VMAX, this.speed + ACCEL * dt);
        const f = this.speed / RUN_VMAX;
        const dx = this.speed * dt;
        root.position.x += dx;
        // Phase tied to real displacement → no foot sliding AND the plant foot
        // lands on the board in sync (the run-up is a whole number of strides).
        this.phase += dx * PHASE_PER_M;
        a.applyRun(this.phase, Math.min(1, 0.5 + f));
        root.position.y = 0.04 * Math.abs(Math.sin(this.phase));
        if (root.position.x >= (this.boardX)) {
          this.vy = TAKEOFF_VY;
          this.vx = Math.max(this.speed, 6);
          this.flightT = 0;
          this.flightDur = (2 * this.vy) / G;
          this._enter("flight");
        }
        break;
      }

      case "flight": {
        this.flightT += dt;
        const p = Math.min(1, this.flightT / this.flightDur);
        root.position.x += this.vx * dt;
        const y = this.vy * this.flightT - 0.5 * G * this.flightT * this.flightT;

        const timeLeft = this.flightDur - this.flightT;
        

        if (timeLeft < 0.2) {
            root.position.y = THREE.MathUtils.lerp(Math.max(0, y), 0, (0.2 - timeLeft) / 0.2);
        } else {
            root.position.y = Math.max(0, y);
        }

        a.applyFlight(p);

        if (this.flightT >= this.flightDur) {
          // Touchdown: dent the sand and kick up a splash at the landing spot.
          // Strength scales with horizontal speed so a faster, longer jump digs
          // a deeper crater and throws more grains.
          this.sand?.impact(root.position.x, root.position.z, this.vx / 7);

          this.distance = root.position.x - this.boardX;
          // Record the leader of the competition (the eventual celebrant).
          if (this.distance > this.bestDistance) {
            this.bestDistance = this.distance;
            this.winner = this.active;
          }
          this._enter("land", `Jump: ${this.distance.toFixed(2)} m`);
        }
        break;
      }

      case "land": {
        this.vx *= 0.92;
        const prevX = root.position.x;
        root.position.x += this.vx * dt;

        // carve a furrow along the slide, not one dot
        this._slideStampX ??= prevX;
        while (root.position.x - this._slideStampX > 0.12) {   // every 12 cm
          this._slideStampX += 0.12;
          this.sand?.impact(this._slideStampX, root.position.z, 0.5);  // light stamps
        }

        a.applySandLanding();
        const sink = THREE.MathUtils.smoothstep(this.t, 0, SAND_SINK_S);
        root.position.y = THREE.MathUtils.lerp(0, -0.72, sink);
        if (this.t > 0.7) this._enter("react", `🏅 ${this.distance.toFixed(2)} m!`);
        break;
      }

      case "react": {
        // Push up out of the sand back to the feet. No celebration here — that
        // is deferred to the end of the competition, and only for the winner.
        const p = Math.min(1, this.t / GETUP_S);
        a.applyGetUp(p);
        if (p >= 1) this._enterLeave();
        break;
      }

      case "leave": {
        // Position is tween-driven (out of the pit, on to the finished cluster).
        // Advance the gait by the distance ACTUALLY covered this frame so the
        // stance feet stay planted, and scale stride amplitude with real speed.
        const speed = dt > 0 ? this._frameDist / dt : 0;
        this.phase += this._frameDist * PHASE_PER_M;
        const amp = THREE.MathUtils.clamp(speed / 2.2, 0.12, 0.5);
        a.applyRun(this.phase, amp);
        root.position.y = 0.025 * amp * Math.abs(Math.sin(this.phase));
        break;
      }

      case "scoreboard": {
        // Settled in the finished cluster, waiting out the measurement pause.
        this.active.idle();
        break;
      }

      default:
        break;
    }
  }

  _enter(state, status) {
    this.activeState = state;
    this.t = 0;

    this._slideStampX = null;
    if (status) this.onStatus(status);
  }

  /** Remove all athletes from the scene and free all GPU resources. */
  dispose() {
    this.tweens.removeAll();
    // The sand pit is persistent stadium geometry (owned by createLongJumpPit,
    // disposed there) — we only restore it to a clean, flat state on teardown so
    // the next event doesn't inherit this competition's craters or stray grains.
    this.sand?.reset();
    for (const j of this.competitors) {
      this.scene?.remove(j.root);
      j.athlete.dispose();
    }
  }
}
