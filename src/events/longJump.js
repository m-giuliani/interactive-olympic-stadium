import * as THREE from "three";
import * as TWEEN from "tween";

import { Athlete } from "../athletes/athlete.js";
import { LJ_Z, LJ_BOARD_X, LJ_PIT_START_X, LJ_PIT_END_X, LJ_PIT_WIDTH } from "../stadium/config.js";

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
// Constant walking pace for the post-jump exit. Each leave segment's duration is
// derived from its length (dist / WALK_SPEED) so the athlete holds ONE steady,
// natural speed the whole way out — no per-waypoint accelerate/decelerate.
const WALK_SPEED = 1.8; // m/s — a brisk, even walking pace
const SCOREBOARD_MS = 3500; // pause for official measurement before the next jumper
const GETUP_S = 1.1; // seconds spent pushing up out of the sand
const SAND_SINK_S = 0.22; // seconds for the body to settle (sink) into the sand

// Heel-strike marks. The heels bite a leg-length AHEAD of the pelvis and keep
// plowing for a short distance as the body decelerates, leaving shallow furrows.
const HEEL_SKID_DIST = 0.4; // m of forward slide over which the heels keep furrowing
const HEEL_FWD_MARGIN = 1.5; // m kept clear of the pit's far end (the gouge drags
//                              ~1.4 m forward of the foot, so clamp to stay off the kerb)
// Scratch vectors for reading the heel/foot world positions off the rig.
const _heelL = new THREE.Vector3();
const _heelR = new THREE.Vector3();

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

// Invented athletes for the broadcast overlay (NOT real people), indexed 1:1
// with KITS. The kit colour doubles as each athlete's colour chip (no flags).
const ROSTER = [
  { name: "Diego Marlin", country: "ESP" },
  { name: "Tomas Reuben", country: "GER" },
  { name: "Niko Aalto", country: "FIN" },
  { name: "Marcus Vale", country: "GBR" },
  { name: "Andre Costa", country: "BRA" },
  { name: "Yuki Harada", country: "JPN" },
  { name: "Kwame Osei", country: "GHA" },
  { name: "Liam Forsberg", country: "SWE" },
];

const START_LIST_MS = 3500; // broadcast "start list" hold before the first jumper

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
   *           pit?: { sand?: { impact: Function, update: Function, reset: Function } },
   *           broadcast?: { showStartList: Function, showCompetitor: Function,
   *             showResult: Function, showResults: Function, hide: Function } }} ctx
   */
  constructor({ scene, onStatus, director, pit, broadcast } = {}) {
    this.scene = scene;
    this.onStatus = onStatus ?? (() => {});
    this.director = director ?? null;

    // The persistent sand pit's responsive-sand API (crater + splash). The pit
    // is owned by the stadium (NOT this event), so we only drive and reset it —
    // never dispose it. See createLongJumpPit().
    this.sand = pit?.sand ?? null;

    // Broadcast scoreboard overlay (start list / lower-third / results). Like the
    // pit it's a shared singleton owned by main.js — we only drive & hide it.
    this.broadcast = broadcast ?? null;

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
      j.name = ROSTER[i].name; // broadcast overlay identity
      j.country = ROSTER[i].country;
      j.color = KITS[i].singlet; // kit colour doubles as the overlay colour chip
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
    this.broadcast?.hide(); // clear any lingering scoreboard panels
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
    this._footOffsetX = 0; // heel-strike state, set per landing at touchdown
    this._footZ = this.z;
    this._landX = 0;

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
    // Phase A: the broadcast start list, held briefly before the first jumper is
    // called up (so it actually reads on screen, like a real TV intro).
    this.broadcast?.showStartList(
      this.competitors.map((j) => ({
        rank: j.index + 1,
        name: j.name,
        country: j.country,
        color: j.color,
      })),
    );
    new TWEEN.Tween({ t: 0 }, this.tweens)
      .to({ t: 1 }, START_LIST_MS)
      .onComplete(() => this._beginNext())
      .start();
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
    // Phase B: the per-athlete lower-third (name + country + "Attempt 1").
    this.broadcast?.showCompetitor({
      index: j.index,
      name: j.name,
      country: j.country,
      color: j.color,
    });
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
    this._printStride = 0; // re-arm the walk-out footprint trail (one per π of gait)

    // The measurement board now stands along the infield (−Z) edge of the pit,
    // spanning the full pit length in X. So the athlete can't cut straight across
    // to the finished cluster — they'd walk through it. Route an L around the
    // board's far (+X) end instead:
    //   1. climb forward out of the sand, PAST the board end, staying pit-side;
    //   2. round the corner to the infield side at x beyond the board;
    //   3. saunter to a random spot in the organic "finished" cluster.
    const PAST_BOARD_X = LJ_PIT_END_X + 1.2; // clear of the board's far edge (x=20)
    const exit = new THREE.Vector3(PAST_BOARD_X, 0, this.z);
    const round = new THREE.Vector3(PAST_BOARD_X, 0, FINISHED.cz);
    const spot = this._randomSpot(FINISHED);
    j._restRot = Math.random() * Math.PI * 2;

    // One steady pace the whole way: constant-speed segments that pass THROUGH the
    // corners without stopping (Linear easing), easing only into the final spot.
    this._walkSegment(j, exit, TWEEN.Easing.Linear.None, () => {
      this._walkSegment(j, round, TWEEN.Easing.Linear.None, () => {
        this._walkSegment(j, spot, TWEEN.Easing.Quadratic.Out, () =>
          this._onLeaveComplete(),
        );
      });
    });
  }

  /**
   * Walk the athlete to a target at the constant WALK_SPEED: the tween duration is
   * derived from the distance so every segment moves at the same even pace. Faces
   * the direction of travel first. Used to chain the post-jump exit walk.
   */
  _walkSegment(j, to, easing, onComplete) {
    const dx = to.x - j.root.position.x;
    const dz = to.z - j.root.position.z;
    j.faceDir(dx, dz);
    const ms = Math.max(200, (Math.hypot(dx, dz) / WALK_SPEED) * 1000);
    new TWEEN.Tween(j.root.position, this.tweens)
      .to({ x: to.x, z: to.z }, ms)
      .easing(easing)
      .onComplete(onComplete)
      .start();
  }

  _onLeaveComplete() {
    const j = this.active;
    j.root.rotation.y = j._restRot ?? 0; // settle into a relaxed, natural facing
    this.finished.push(j);

    this.sand?.reset();
    // Snap the board's green result line to the just-measured distance.
    this.sand?.setMark(this.distance);
    // Record the result and flash it in the lower-third (phase B → result).
    j.result = this.distance;
    this.broadcast?.showResult(this.distance.toFixed(2) + " m");

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

    // Phase C: the sorted results table, best jump first, winner highlighted.
    const ranked = [...this.competitors].sort(
      (a, b) => (b.result ?? 0) - (a.result ?? 0),
    );
    this.broadcast?.showResults(
      ranked.map((j, i) => ({
        rank: i + 1,
        name: j.name,
        country: j.country,
        color: j.color,
        distanceText: (j.result ?? 0).toFixed(2) + " m",
        isWinner: i === 0,
      })),
    );
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

        // const timeLeft = this.flightDur - this.flightT;
        

        // if (timeLeft < 0.2) {
        //     root.position.y = THREE.MathUtils.lerp(Math.max(0, y), 0, (0.2 - timeLeft) / 0.2);
        // } else {
        //     root.position.y = Math.max(0, y);
        // }
        const seat = THREE.MathUtils.smoothstep(p, 0.45, 1);
        root.position.y = Math.max(0, y) - 0.72 * seat;

        a.applyFlight(p);

        if (this.flightT >= this.flightDur) {
          // Foot contact: the heels bite FIRST, a leg-length AHEAD of the pelvis.
          // Read the actual foot position off the rig (so it tracks the seated
          // pose and the model's proportions) and carve shallow furrows + a small
          // forward kick THERE. The deep body crater forms later, back at the
          // pelvis, in the land state — so the two marks separate naturally and in
          // the right order (feet bite, then the body sits back).
          this._landStrength = THREE.MathUtils.clamp(this.vx / 7, 0.4, 1.6);
          const heel = this._heelCenter();
          this._footOffsetX = heel.x - root.position.x; // feet lead the pelvis by this
          this._footZ = heel.z;
          this._landX = root.position.x;
          this._heelStrikeAt(heel.x, heel.z, 0.5, 0.4); // shallow furrows + small puff

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
          // Heel skid: the feet keep plowing forward a moment as the body
          // decelerates — extend the furrows ahead (very shallow, furrow only, no
          // extra splash) for the first HEEL_SKID_DIST of the slide.
          if (this._slideStampX - this._landX < HEEL_SKID_DIST) {
            this._heelStrikeAt(this._slideStampX + this._footOffsetX, this._footZ, 0.3, 0);
          }
        }

        // a.applySandLanding();
        // const sink = THREE.MathUtils.smoothstep(this.t, 0, SAND_SINK_S);
        // root.position.y = THREE.MathUtils.lerp(0, -0.72, sink);

        // // Big eruption: once, when the seat has driven into the sand (sink past
        // // halfway). This is the main burst — a broad body crater and a thick
        // // sheet of sand thrown up right where the athlete crashes in.
        // if (!this._bodySplashed && sink > 0.5) {
        //   this._bodySplashed = true;
        //   this.sand?.impact(root.position.x, root.position.z, this._landStrength * 1.35);
        // }
        a.applySandLanding();
        root.position.y = -0.72;

        if (!this._bodySplashed) {
          this._bodySplashed = true;
          this.sand?.impact(root.position.x, root.position.z, this._landStrength * 1.35);
        }

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
        this._stampWalkFootprints(); // quiet trail while walking out across the sand
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
    this._bodySplashed = false; // re-arm the body-crash eruption for each landing
    if (status) this.onStatus(status);
  }

  /**
   * World-space midpoint of the two heels, read live off the rig (the ankle pivot
   * carries the foot box). Used to place the heel furrows where the feet actually
   * are — a leg-length ahead of the pelvis in the seated landing pose — instead
   * of at root.position, so the furrow tracks the pose and model proportions.
   * @returns {{ x: number, z: number }}
   */
  _heelCenter() {
    const j = this.active.athlete.joints;
    j.legL.ankle.getWorldPosition(_heelL); // forces a fresh world matrix
    j.legR.ankle.getWorldPosition(_heelR);
    return {
      x: (_heelL.x + _heelR.x) / 2,
      z: (_heelL.z + _heelR.z) / 2,
    };
  }

  /**
   * Leave a quiet trail of shallow footprints while the athlete WALKS OUT across
   * the sand. One print per foot-plant — every half gait cycle (π of phase) —
   * placed under whichever ankle is currently lowest (the planted/stance foot),
   * and only while that foot is actually over the pit. The dimples are far smaller
   * and shallower than the landing gouges (see sand.footprint) so the exit trail
   * reads as footsteps, not craters.
   */
  _stampWalkFootprints() {
    const stride = Math.floor(this.phase / Math.PI);
    if (stride === this._printStride) return; // same foot still down — one print only
    this._printStride = stride;

    const j = this.active.athlete.joints;
    j.legL.ankle.getWorldPosition(_heelL); // fresh world matrices
    j.legR.ankle.getWorldPosition(_heelR);
    const foot = _heelL.y <= _heelR.y ? _heelL : _heelR; // the lower foot is planted

    // Only stamp while the foot is over the sand. The x margin keeps the dragged
    // dimple off the far kerb; the z test keeps it within the pit width.
    if (
      foot.x < LJ_PIT_START_X + 0.2 ||
      foot.x > LJ_PIT_END_X - 0.3 ||
      Math.abs(foot.z - LJ_Z) > LJ_PIT_WIDTH / 2
    ) {
      return;
    }
    this.sand?.footprint(foot.x, foot.z, stride * 7.3);
  }

  /**
   * Carve the shallow two-furrow heel mark at (x,z). The forward X is clamped to
   * the pit so the furrow — which the gouge drags ~1.4 m forward of the foot —
   * never runs into the kerb/apron at the far end (depth is capped elsewhere, so
   * this is just to keep the furrows on the sand visually).
   * @param {number} splashScale 0 = furrow only; >0 also kicks a small forward puff.
   */
  _heelStrikeAt(x, z, strength, splashScale) {
    const cx = THREE.MathUtils.clamp(
      x,
      LJ_PIT_START_X + 0.4,
      LJ_PIT_END_X - HEEL_FWD_MARGIN,
    );
    this.sand?.impact(cx, z, strength, { heels: true, splashScale });
  }

  /** Remove all athletes from the scene and free all GPU resources. */
  dispose() {
    this.tweens.removeAll();
    // The sand pit is persistent stadium geometry (owned by createLongJumpPit,
    // disposed there) — we only restore it to a clean, flat state on teardown so
    // the next event doesn't inherit this competition's craters or stray grains.
    this.sand?.reset();
    // The broadcast overlay is a shared singleton (owned by main.js) — just hide
    // it so switching sports clears the panels (don't dispose its DOM).
    this.broadcast?.hide();
    for (const j of this.competitors) {
      this.scene?.remove(j.root);
      j.athlete.dispose();
    }
  }
}
