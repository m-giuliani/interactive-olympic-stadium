import * as THREE from "three";
import * as TWEEN from "tween";

import { Athlete } from "../athletes/athlete.js";
import { Coach, COACH_KITS } from "../athletes/coach.js";
import { ResultsMonitor } from "../stadium/resultsMonitor.js";
import { Podium, createMedal } from "../stadium/podium.js";
import {
  LJ_Z,
  LJ_BOARD_X,
  LJ_PIT_START_X,
  LJ_PIT_END_X,
  LJ_PIT_WIDTH,
  LJ_RUNWAY_START_X,
  LJ_RUNWAY_WIDTH,
  TRACK_Y,
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
const TAKEOFF_VY = 4.5; // m/s vertical launch — higher arc reads as a clear leap
const TAKEOFF_PLANT_S = 0.14; // s single-foot board strike (no stopping)

// --- choreography ------------------------------------------------------------
const COMPETITORS = 3;
const STEPUP_MS = 4500; // calm walk to the start mark
// Constant walking pace for the post-jump exit. Each leave segment's duration is
// derived from its length (dist / WALK_SPEED) so the athlete holds ONE steady,
// natural speed the whole way out — no per-waypoint accelerate/decelerate.
const WALK_SPEED = 1.8; // m/s — a brisk, even walking pace
const GETUP_S = 1.1; // seconds spent pushing up out of the sand
const SAND_SINK_S = 0.22; // seconds for the body to settle (sink) into the sand

// --- post-jump results + interaction sequence -------------------------------
// After the jump the athlete reads the distance off the results monitor, then
// walks across the field to talk to their assigned coach(es). These drive the
// WALK_TO_MONITOR → READING_RESULT → WALK_TO_COACH → TALKING states.
const READ_HOLD_MS = 2600; // pause in front of the monitor so the result reads
const TALK_PER_COACH_MS = 3000; // chat time spent with each assigned coach
const TALK_DIST = 1.75; // m the athlete stands from the coach (clear of arm reach)

// The results monitor sits just BEYOND the pit's far (+X) end, a touch to the
// field side, and is ANGLED back toward the runway (its screen aimed up the
// run-up, not flat at the stands) by pointing it at MONITOR_LOOKAT. The athlete
// reads it from monitor.viewSpot (computed from these two points). Tweak the two
// Vector3s to move/aim the monitor; the walk sequence follows automatically.
const MONITOR_POS = new THREE.Vector3(LJ_PIT_END_X + 4, 0, LJ_Z - 1); // ≈ (24, 0, 47.8)
const MONITOR_LOOKAT = new THREE.Vector3(LJ_BOARD_X, 0, LJ_Z - 3); // up the runway, angled
const MONITOR_VIEW_DIST = 2.6; // how far in front of the screen the athlete stands

// Coaches are scattered across the field area BEYOND the runway (the infield/apron
// on the −Z side), each in a DIFFERENT spot, already in place "waiting". There is
// exactly ONE coach per athlete (COACH_COUNT === COMPETITORS) and each athlete is
// dealt a UNIQUE one (a shuffled 1:1 mapping, see _assignCoaches) — so no two
// athletes ever end up at the same coach, and none overlap.
const COACH_COUNT = COMPETITORS; // one coach per athlete (8)
const COACH_FIELD = { cx: 12, cz: LJ_Z - 9, hx: 13, hz: 5.5 }; // scatter box (field side)
const COACH_MIN_GAP = 3.5; // m kept between scattered coaches (also keeps athletes apart)
const ATHLETE_MIN_GAP = 1.3; // m kept between athletes milling in the warm-up cluster
// A waypoint just past the measurement board's far (+X) end, on the field side, so
// the walk from the monitor to the field clears the board instead of cutting
// through it (the board spans the pit's −Z edge over X = pit start…end).
const BOARD_CLEAR = new THREE.Vector3(LJ_PIT_END_X + 0.8, 0, LJ_Z - 3.5); // ≈ (20.8, 45.3)
const PIT_CENTER = new THREE.Vector3((LJ_PIT_START_X + LJ_PIT_END_X) / 2, 0, LJ_Z);

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

// --- footstep-quantized approach walk ----------------------------------------
// The athletes WALK UP to the monitor / a coach / the podium one footstep at a
// time at a constant pace (no eased "glide" that brakes into a foot-dragging
// shuffle). Each footfall covers HALF_STRIDE of ground; the steps are full-size
// until the last one, which SHORTENS (or is skipped) so the final footfall lands
// within STOP_BAND of the target instead of forcing an exact landing. Then the
// trailing foot closes up beside the planted one and the gait eases to a stand.
const HALF_STRIDE = STRIDE_LENGTH / 2; // ground distance per footfall (~1.3 m)
const WALK_AMP = 0.6; // full, even walking stride amplitude (feet clear the ground)
const STOP_BAND = 0.3; // m tolerance around the target the final footfall may land in
const CLOSE_STEP = 0.3; // forward drift as the trailing foot comes up beside the lead

/**
 * Plan the forward ground-distances of each footfall to cover `dist` and land the
 * LAST footfall within `band` of the end, with a possibly-shorter final step (and
 * never an awkward tiny stutter). Returns [] when already within the band.
 *
 * Walking in: full HALF_STRIDE footfalls leave a remainder `rem` short of the end.
 *  - rem ≤ band               → the last full footfall is already within range: stop.
 *  - HALF_STRIDE − rem ≤ band  → one more FULL step overshoots only within range: take it.
 *  - otherwise                 → a full step would overshoot past the range, so take a
 *                                SHORTER final step of length `rem` to land on the mark.
 */
function planStepLengths(dist, band) {
  if (dist <= band) return [];
  const nFull = Math.floor(dist / HALF_STRIDE);
  const rem = dist - nFull * HALF_STRIDE;
  const steps = [];
  for (let i = 0; i < nFull; i++) steps.push(HALF_STRIDE);
  if (rem <= band) {
    // last full footfall already lands within the band — stop a touch short.
  } else if (HALF_STRIDE - rem <= band) {
    steps.push(HALF_STRIDE); // one more full step lands within the band
  } else {
    steps.push(rem); // a shorter final step lands on the mark
  }
  return steps;
}

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

// The run-up runway is a thin slab raised to TRACK_Y (≈2 cm) above the infield
// grass the athletes rest on (feet planted at root.y = 0). Without compensating,
// the planted foot sinks into the runway by exactly that gap. runwaySurfaceY()
// returns the runway top height under a given world (x, z), ramping smoothly to 0
// just outside the slab so the call-up walk steps ON and OFF it without popping.
const RUNWAY_TOP_Y = TRACK_Y; // runway box top — matches the track surface
const RUNWAY_EDGE_RAMP = 0.35; // m over which the height blends in at the slab edge
function runwaySurfaceY(x, z) {
  if (x < LJ_RUNWAY_START_X - RUNWAY_EDGE_RAMP || x > LJ_PIT_START_X) return 0;
  const dz = Math.abs(z - LJ_Z);
  const half = LJ_RUNWAY_WIDTH / 2;
  const t = THREE.MathUtils.clamp(
    (half + RUNWAY_EDGE_RAMP - dz) / RUNWAY_EDGE_RAMP,
    0,
    1,
  );
  return RUNWAY_TOP_Y * t;
}

// Organic "warm-up" cluster on the infield side of the runway (smaller Z).
// Competitors take a randomised spot + facing inside this box so they loosely
// stand around rather than lining up. Every corner stays inside the seating bowl
// (radius < ~51 m). { cx,cz: centre, hx,hz: half-extent }. After jumping, athletes
// no longer return to a "finished" cluster — they walk to the monitor and then a
// coach (the post-jump results + interaction sequence below).
const WARMUP = { cx: -19, cz: LJ_Z - 6.5, hx: 3.5, hz: 3 }; // beside the start

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

// --- medal ceremony (the long-jump finale) -----------------------------------
// The podium sits on the clear infield, CENTRED on X (for symmetric broadcast
// framing) and pulled back to z ≈ 30.76 so it stays well clear of the coach
// scatter box (z ≈ 34..45), the runway/pit (z ≈ 48.76) and the seating bowl
// (radius < 50: sqrt(2.1² + 30.76²) ≈ 30.8). The medalists FACE +Z toward the
// near grandstand (rig faces +X, so facing +Z is a −π/2 yaw).
const PODIUM_POS = new THREE.Vector3(0, 0, LJ_Z - 18); // ≈ (0, 0, 30.76)
const PODIUM_FACE_YAW = -Math.PI / 2; // athlete root.y to face +Z (the crowd)
const PODIUM_STEPUP_MS = 850; // duration of ONE climb stride (ground→riser→block)
const CEREMONY_STAGGER_MS = 1300; // gap between medalists starting their walk-up
const MEDAL_SCALE_MS = 350; // medal "appears" (scales in) as the athlete settles

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

    // Results monitor: angled back toward the runway (see MONITOR_* constants).
    this.monitor = new ResultsMonitor({
      position: MONITOR_POS,
      lookAt: MONITOR_LOOKAT,
      viewDistance: MONITOR_VIEW_DIST,
    });
    scene.add(this.monitor.group);

    // Coach pool: reuse the Athlete rig (via Coach), scattered across the field
    // beyond the runway and left there "waiting". Each athlete is later assigned
    // 1–2 of them at random (in reset()/_assignCoaches).
    /** @type {Coach[]} */
    this.coaches = [];
    for (let i = 0; i < COACH_COUNT; i++) {
      const coach = new Coach(COACH_KITS[i % COACH_KITS.length]);
      const pos = this._scatterCoachPos();
      coach.root.position.copy(pos);
      // Resting facing: watch the runway/pit (so they read as waiting coaches).
      coach.faceToward(PIT_CENTER.x, PIT_CENTER.z);
      coach.homeYaw = coach.root.rotation.y;
      scene.add(coach.root);
      this.coaches.push(coach);
    }
    /** The coach the active athlete is currently chatting with (if any). */
    this._talkCoach = null;

    // Medal podium (OWNED by this event, like the monitor/coaches): built hidden
    // and revealed for the finale (CLAUDE.md §6). Its number plates and the
    // medalists' faces point along +Z toward the near grandstand.
    this.podium = new Podium({ position: PODIUM_POS, faceYaw: 0 });
    this.podium.group.visible = false;
    scene.add(this.podium.group);

    // Everything the ceremony spawns (medals' geos/mats) is tracked here so a
    // re-run / teardown frees it. ceremonyActive gates the finale in update().
    this._ceremonyDisposables = [];
    this.ceremonyActive = false;
    this._medalists = [];
    this._nonMedalists = [];

    this.reset();
  }

  /** A random spot in the field scatter box, kept COACH_MIN_GAP from other coaches. */
  _scatterCoachPos() {
    let pos = new THREE.Vector3();
    for (let attempt = 0; attempt < 60; attempt++) {
      pos.set(
        COACH_FIELD.cx + (Math.random() * 2 - 1) * COACH_FIELD.hx,
        0,
        COACH_FIELD.cz + (Math.random() * 2 - 1) * COACH_FIELD.hz,
      );
      const clash = this.coaches.some(
        (c) => c.root.position.distanceTo(pos) < COACH_MIN_GAP,
      );
      if (!clash) break;
    }
    return pos;
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
    this._teardownCeremony(); // hide podium, detach + dispose any prior medals
    this.sand?.reset(); // flatten any craters and clear leftover splash grains
    this.broadcast?.hide(); // clear any lingering scoreboard panels
    this.monitor?.clear(); // blank the results screen back to "READY"
    this._talkCoach = null;
    this.coaches?.forEach((c) => c.setTalking(false)); // back to watching the field
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
    // a random facing — standing around naturally rather than in a line, and kept
    // ATHLETE_MIN_GAP apart so no two athletes overlap while milling.
    const placed = [];
    this.competitors.forEach((j) => {
      let spot = this._randomSpot(WARMUP);
      for (let attempt = 0; attempt < 40; attempt++) {
        spot = this._randomSpot(WARMUP);
        if (!placed.some((p) => p.distanceTo(spot) < ATHLETE_MIN_GAP)) break;
      }
      placed.push(spot);
      j.root.position.copy(spot);
      j.root.rotation.set(0, Math.random() * Math.PI * 2, 0);
      j._sw = null; // clear any in-flight stepped-walk state from a prior run
      j.idle();
    });

    // Assign each athlete their coach at random for this competition.
    this._assignCoaches();

    this.onStatus('Press "Start long jump"');
  }

  /**
   * Deal each competitor a UNIQUE coach: shuffle the pool (Fisher–Yates) and hand
   * out one per athlete. With COACH_COUNT === COMPETITORS this is a clean 1:1
   * mapping, so every athlete has their own coach in a distinct spot and no two
   * athletes are ever sent to the same place. (If the pool were ever smaller than
   * the field it would wrap, sharing the surplus — but it isn't here.)
   */
  _assignCoaches() {
    const pool = [...this.coaches];
    for (let i = pool.length - 1; i > 0; i--) {
      const k = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[k]] = [pool[k], pool[i]];
    }
    this.competitors.forEach((j, i) => {
      j.coaches = [pool[i % pool.length]];
    });
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

    // Keep the infield alive: the coaches' procedural idle/chat and the monitor's
    // subtle screen breathing run every frame, regardless of the jump state.
    for (const c of this.coaches) c.update(delta);
    this.monitor.update(delta);

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

    // Once the competition is over, the medal ceremony finale takes over: the top
    // three walk to the podium, step up onto their blocks, receive medals and
    // celebrate while everyone else idles (drives itself; see _enterCeremony).
    if (this.ceremonyActive) {
      this._updateCeremony(delta);
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
    // The previous athlete's chat ends as the next jumper is called up: the coach
    // goes back to watching the field and the athlete drops to the relaxed idle
    // (handled by update's non-active loop).
    this._talkCoach?.setTalking(false);
    this._talkCoach = null;

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

  // === Post-jump results + interaction sequence ==============================
  // After the get-up (react), the athlete plays out a small state machine driven
  // from the same update() loop:
  //   WALK_TO_MONITOR  → walk to the angled scoreboard beyond the pit
  //   READING_RESULT   → pause and read the distance off the screen
  //   WALK_TO_COACH    → walk across the field to their assigned coach
  //   TALKING          → casual chat (both procedurally animated)
  // The WALK_TO_COACH → TALKING pair repeats once per assigned coach, so it still
  // handles more than one if COACHES_PER_ATHLETE is widened.
  // The walks are tween-driven (position) with the gait driven each frame by the
  // real distance covered — exactly the reusable pattern the old leave walk used.

  /** WALK_TO_MONITOR: commit the result, then walk to the monitor's viewing spot. */
  _enterWalkToMonitor() {
    const j = this.active;
    j.phaseC = 0;
    this._printStride = 0; // re-arm the walk-out footprint trail (one per π of gait)

    // Record the result NOW (read off the SAME this.distance the jump computed) so
    // the monitor, the broadcast lower-third and the per-jumper record all agree.
    j.result = this.distance;
    this.monitor.setResult(this.distance, true);
    this.broadcast?.showResult(this.distance.toFixed(2) + " m");

    this._enter("walkToMonitor", "");

    // The monitor sits just beyond the pit's far (+X) end and its viewing spot
    // stays on the pit/runway side of the LED board, so a direct walk out of the
    // sand to it never crosses the board. Step in and settle within the band.
    this._startWalk(j, this.monitor.viewSpot.clone(), {
      onArrive: () => this._enterReadingResult(),
    });
  }

  /** READING_RESULT: face the monitor and hold so the distance can be read. */
  _enterReadingResult() {
    const j = this.active;
    // Look at the screen.
    j.faceDir(MONITOR_POS.x - j.root.position.x, MONITOR_POS.z - j.root.position.z);
    // Now that the athlete is well clear of the pit, flatten the churned sand and
    // snap the board's green measuring line to this jump (as the old flow did).
    this.sand?.reset();
    this.sand?.setMark(this.distance);

    this._enter("readingResult", "");
    new TWEEN.Tween({ d: 0 }, this.tweens)
      .to({ d: 1 }, READ_HOLD_MS)
      .onComplete(() => this._enterCoachVisits())
      .start();
  }

  /** Begin the chain of visits to this athlete's assigned coach(es). */
  _enterCoachVisits() {
    const j = this.active;
    this._talkList = j.coaches && j.coaches.length ? [...j.coaches] : [this.coaches[0]];
    this._talkIdx = 0;
    this._enterWalkToCoach();
  }

  /** WALK_TO_COACH: walk across the field to the current assigned coach. */
  _enterWalkToCoach() {
    const j = this.active;
    j.phaseC = 0;
    const coach = this._talkList[this._talkIdx];
    this._talkCoach = coach;
    this._enter("walkToCoach", "");

    // For the FIRST coach the athlete is still beside the pit, so route via a
    // waypoint past the measurement board's +X end (BOARD_CLEAR) before heading out
    // into the field — that leg does NOT settle (close:false), it flows straight
    // into the approach. Later coaches are already in the field — walk straight
    // there. The final approach steps in and closes up within the band.
    const approach = () => {
      const spot = this._talkSpotFor(coach, j.root.position);
      this._startWalk(j, spot, { onArrive: () => this._enterTalking() });
    };
    if (this._talkIdx === 0) {
      this._startWalk(j, BOARD_CLEAR.clone(), { close: false, band: 0.4, onArrive: approach });
    } else {
      approach();
    }
  }

  /** TALKING: face the coach and chat; then move to the next coach or next jumper. */
  _enterTalking() {
    const j = this.active;
    const coach = this._talkCoach;
    // Turn to face each other.
    j.faceDir(coach.root.position.x - j.root.position.x, coach.root.position.z - j.root.position.z);
    coach.faceToward(j.root.position.x, j.root.position.z);
    coach.setTalking(true);

    this._talkT = 0;
    this._enter("talking", "");

    new TWEEN.Tween({ d: 0 }, this.tweens)
      .to({ d: 1 }, TALK_PER_COACH_MS)
      .onComplete(() => {
        coach.setTalking(false); // that coach goes back to watching the field
        this._talkIdx += 1;
        if (this._talkIdx < this._talkList.length) {
          this._enterWalkToCoach(); // on to their next assigned coach
        } else {
          // Done with all assigned coaches: the athlete stays put (idled by the
          // non-active loop) and the next jumper is called up.
          this.finished.push(j);
          this.active = null;
          this._beginNext();
        }
      })
      .start();
  }

  /** A standing spot TALK_DIST in front of the coach, on the side the athlete is on. */
  _talkSpotFor(coach, from) {
    const dx = from.x - coach.root.position.x;
    const dz = from.z - coach.root.position.z;
    const len = Math.hypot(dx, dz) || 1;
    return new THREE.Vector3(
      coach.root.position.x + (dx / len) * TALK_DIST,
      0,
      coach.root.position.z + (dz / len) * TALK_DIST,
    );
  }

  /**
   * Begin a footstep-quantized walk to `target`, driven each frame by
   * _updateWalk(j, dt). The athlete faces the travel direction and steps in at a
   * constant pace; the final footfall is shortened so it lands within `band` of
   * the target, then (unless `close` is false) the trailing foot comes up beside
   * the planted one and the gait eases to a stand before `onArrive` fires.
   *
   * Self-contained per-jumper state (on j._sw) so the SAME driver serves both the
   * single active athlete (walkToMonitor / walkToCoach) and the ceremony medalists.
   * @param {Jumper} j
   * @param {THREE.Vector3} target  world stop point.
   * @param {{ band?: number, close?: boolean, onArrive?: Function }} [opts]
   */
  _startWalk(j, target, { band = STOP_BAND, close = true, onArrive } = {}) {
    const dx = target.x - j.root.position.x;
    const dz = target.z - j.root.position.z;
    const dist = Math.hypot(dx, dz);
    const heading = dist > 1e-4 ? { x: dx / dist, z: dz / dist } : { x: 1, z: 0 };
    j.faceDir(heading.x, heading.z);
    if (j.phaseC == null) j.phaseC = 0;
    // Aim the forward stepping to stop CLOSE_STEP short, so the trailing-foot
    // close-up drifts the body the rest of the way onto the mark (within band).
    const forwardDist = close ? Math.max(0, dist - CLOSE_STEP) : dist;
    j._sw = {
      steps: planStepLengths(forwardDist, band),
      idx: 0,
      heading,
      close,
      onArrive,
      target: target.clone(),
    };
    this._beginWalkStep(j);
  }

  /** Arm the next footfall (a forward step, the closing step, or arrival). */
  _beginWalkStep(j) {
    const sw = j._sw;
    if (sw.idx >= sw.steps.length) {
      if (!sw.close) {
        // Intermediate waypoint (e.g. routing past the board): no settle, just go.
        j._sw = null;
        sw.onArrive && sw.onArrive();
        return;
      }
      // Closing step: bring the trailing foot up beside the planted one. Drift the
      // body the small remaining distance to the mark while the stride fades out.
      const rem = Math.hypot(sw.target.x - j.root.position.x, sw.target.z - j.root.position.z);
      sw.closing = true;
      sw.fromX = j.root.position.x;
      sw.fromZ = j.root.position.z;
      sw.len = Math.min(CLOSE_STEP, rem);
      sw.dur = Math.max(0.22, sw.len / WALK_SPEED);
      sw.t = 0;
      sw.phase0 = j.phaseC;
      sw.amp0 = WALK_AMP;
      return;
    }
    sw.closing = false;
    sw.fromX = j.root.position.x;
    sw.fromZ = j.root.position.z;
    sw.len = sw.steps[sw.idx];
    sw.dur = Math.max(0.12, sw.len / WALK_SPEED);
    sw.t = 0;
    sw.phase0 = j.phaseC;
    // Scale the swing amplitude to the step length so a shorter step also reaches
    // less far (the foot keeps clearing the ground but doesn't overstride/slide).
    sw.amp = WALK_AMP * THREE.MathUtils.clamp(sw.len / HALF_STRIDE, 0.45, 1);
  }

  /**
   * Advance the current footfall. Each step is exactly one half gait-cycle (π of
   * phase) over its ground length, so the walk always ends on a clean foot-plant;
   * the closing step fades the amplitude to ~0 so both feet settle together.
   */
  _updateWalk(j, dt) {
    const sw = j._sw;
    if (!sw) return;
    const a = j.athlete;
    sw.t += dt;
    const u = Math.min(1, sw.dur > 0 ? sw.t / sw.dur : 1);
    j.root.position.x = sw.fromX + sw.heading.x * sw.len * u;
    j.root.position.z = sw.fromZ + sw.heading.z * sw.len * u;
    j.phaseC = sw.phase0 + u * Math.PI;

    if (sw.closing) {
      const amp = sw.amp0 * (1 - u); // stride fades → the trailing foot draws level
      a.applyRun(j.phaseC, Math.max(0.03, amp));
      j.root.position.y = 0.03 * amp * Math.abs(Math.sin(j.phaseC));
      if (u >= 1) {
        a.applyIdle();
        j.root.position.y = 0;
        const cb = sw.onArrive;
        j._sw = null;
        cb && cb();
      }
      return;
    }

    a.applyRun(j.phaseC, sw.amp);
    j.root.position.y = 0.03 * sw.amp * Math.abs(Math.sin(j.phaseC));
    if (u >= 1) {
      sw.idx += 1;
      this._beginWalkStep(j);
    }
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

    // Replace the old in-place single-winner celebration with the full ceremony.
    this._enterCeremony(ranked);
  }

  // === Medal ceremony ========================================================
  // All ceremony motion is HAND-WRITTEN and hierarchy-driven (CLAUDE.md §2): the
  // walk-up is the footstep-quantized gait (applyRun via _updateWalk), the step-up
  // is the hand-keyframed applyStepUp, and the celebration loops are applyCelebrate
  // / applyWave. tween.js drives only the stagger delays and the medal's scale-in
  // pop, all in this.tweens for clean teardown.

  /**
   * Kick off the podium ceremony: pick the medalists (best three by distance),
   * reveal the podium, point the broadcast camera at it, and stagger each
   * medalist's walk-up. Non-medalists idle where they finished (the podium sits
   * clear of the coach field, so they never overlap it).
   * @param {Jumper[]} [ranked] competitors already sorted best-first (from _finish).
   */
  _enterCeremony(ranked) {
    const order =
      ranked ??
      [...this.competitors].sort((a, b) => (b.result ?? 0) - (a.result ?? 0));
    this._medalists = order.slice(0, 3);
    this._nonMedalists = order.slice(3);
    this.active = null;
    this.ceremonyActive = true;

    this.podium.group.visible = true;
    if (this.director) this.director.setSubject(this.podium.centerObject, "podium");
    this.onStatus("🏅 Medal Ceremony");

    this._medalists.forEach((j, place) => {
      j._place = place;
      j._cstate = "toApproach";
      j._approachSpot = this.podium.approachSpots[place];
      j._riserSpot = this.podium.riserSpots[place];
      j._standSpot = this.podium.standSpots[place];
      j.phaseC = 0; // per-jumper gait phase (re-seeded when the walk-up starts)
      j._celebT = 0;
      j.medal = null;

      // Stagger the walk-ups so the three arrive one after another (gold first).
      const delay = place * CEREMONY_STAGGER_MS;
      if (delay <= 0) {
        this._ceremonyWalk(j);
      } else {
        new TWEEN.Tween({ t: 0 }, this.tweens)
          .to({ t: 1 }, delay)
          .onComplete(() => this._ceremonyWalk(j))
          .start();
      }
    });
  }

  /** Walk one medalist to the spot in front of their block, then begin the climb. */
  _ceremonyWalk(j) {
    if (!this.ceremonyActive) return; // a reset may have fired during the stagger
    j._cstate = "walking";
    j.phaseC = 0;
    // Footstep-quantized walk (constant pace, last step shortened into the band,
    // trailing foot closes up) — the same driver the post-jump walks use.
    this._startWalk(j, j._approachSpot, {
      onArrive: () => {
        if (this.ceremonyActive) this._ceremonyStepUp(j);
      },
    });
  }

  /**
   * Begin the two-stride climb up onto the block: stride 1 steps up onto the front
   * edge of the block top (riserSpot), stride 2 steps flat forward to the centre
   * (standSpot) while pivoting to face the crowd. Both are hand-keyframed strides
   * (applyStepUp) driven in _updateCeremony. The medalist squares up to the block
   * first (the walk-in may have been angled).
   */
  _ceremonyStepUp(j) {
    if (!this.ceremonyActive) return;
    j._cstate = "stepping";
    j.faceDir(j._standSpot.x - j.root.position.x, j._standSpot.z - j.root.position.z);
    j._climb = [j._riserSpot, j._standSpot]; // front edge of the top, then centre
    j._climbIdx = 0;
    this._beginClimbStage(j);
  }

  /** Arm one stride of the climb toward j._climb[j._climbIdx] (alternating legs). */
  _beginClimbStage(j) {
    j._stepT = 0;
    j._stepFromX = j.root.position.x;
    j._stepFromZ = j.root.position.z;
    j._stepFromY = j.root.position.y;
    j._stepFromYaw = j.root.rotation.y;
    j._stepLead = j._climbIdx % 2 === 0 ? 1 : -1; // alternate the lead leg each step
    // Only the last stride pivots to face the crowd; earlier ones face the block.
    if (j._climbIdx === j._climb.length - 1) {
      const d = PODIUM_FACE_YAW - j._stepFromYaw;
      j._yawDelta = Math.atan2(Math.sin(d), Math.cos(d));
    } else {
      j._yawDelta = 0;
    }
  }

  /** Create the medal, hang it on the medalist's chest and pop it in (scale tween). */
  _settleMedal(j) {
    const medal = createMedal(j._place);
    j.athlete.joints.torso.add(medal.group);
    medal.group.position.set(0.13, 0.33, 0); // front of the chest (rides the rig)
    medal.group.scale.setScalar(0.01);
    j.medal = medal;
    this._ceremonyDisposables.push(...medal.disposables);
    new TWEEN.Tween(medal.group.scale, this.tweens)
      .to({ x: 1, y: 1, z: 1 }, MEDAL_SCALE_MS)
      .easing(TWEEN.Easing.Back.Out)
      .start();
  }

  /** Per-frame ceremony driver: walk gait / step-up lerp / celebration loops. */
  _updateCeremony(dt) {
    // Non-medalists hold a relaxed idle where they finished.
    for (const j of this._nonMedalists) j.idle();

    for (const j of this._medalists) {
      switch (j._cstate) {
        case "toApproach":
          j.idle(); // waiting its staggered turn
          break;

        case "walking":
          // Footstep-quantized walk to the approach spot (constant pace, last
          // step shortened into the band, trailing foot closes up), then _startWalk
          // fires onArrive → _ceremonyStepUp.
          this._updateWalk(j, dt);
          break;

        case "stepping": {
          // One stride at a time: up onto the block front edge, then flat to centre.
          j._stepT += dt;
          const target = j._climb[j._climbIdx];
          const p = Math.min(1, j._stepT / (PODIUM_STEPUP_MS / 1000));
          const e = THREE.MathUtils.smoothstep(p, 0, 1);
          j.athlete.applyStepUp(p, j._stepLead);
          j.root.position.x = THREE.MathUtils.lerp(j._stepFromX, target.x, e);
          j.root.position.z = THREE.MathUtils.lerp(j._stepFromZ, target.z, e);
          j.root.position.y = THREE.MathUtils.lerp(j._stepFromY, target.y, e);
          j.root.rotation.y = j._stepFromYaw + e * j._yawDelta; // pivot on the last step
          if (p >= 1) {
            j._climbIdx += 1;
            if (j._climbIdx < j._climb.length) {
              this._beginClimbStage(j); // next stride: up onto the block
            } else {
              j._cstate = "celebrating";
              j._celebT = 0;
              j.root.rotation.y = PODIUM_FACE_YAW;
              this._settleMedal(j);
            }
          }
          break;
        }

        case "celebrating": {
          j._celebT += dt;
          if (j._place === 0) {
            // Gold: the big arms-up celebration with a little hop on the block.
            j.athlete.applyCelebrate(j._celebT);
            j.root.position.y =
              j._standSpot.y + 0.05 * Math.abs(Math.sin(j._celebT * 5));
          } else {
            // Silver / bronze: a proud wave to the crowd, planted on the block.
            j.athlete.applyWave(j._celebT);
            j.root.position.y = j._standSpot.y;
          }
          break;
        }

        default:
          break;
      }
    }
  }

  /** Tear down a ceremony: hide the podium, detach + free the medals, reset state. */
  _teardownCeremony() {
    this.ceremonyActive = false;
    if (this.podium) this.podium.group.visible = false;
    for (const j of this.competitors) {
      if (j.medal) {
        j.athlete.joints.torso.remove(j.medal.group);
        j.medal = null;
      }
      j._cstate = null;
    }
    this._ceremonyDisposables.forEach((d) => d.dispose());
    this._ceremonyDisposables = [];
    this._medalists = [];
    this._nonMedalists = [];
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
        root.position.y =
          runwaySurfaceY(root.position.x, root.position.z) +
          0.025 * amp * Math.abs(Math.sin(this.phase));
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
        root.position.y =
          runwaySurfaceY(root.position.x, root.position.z) +
          0.04 * Math.abs(Math.sin(this.phase));
        if (root.position.x >= (this.boardX)) {

          const randomVertical = (Math.random() * 0.5) - 0.25;   
          const randomHorizontal = (Math.random() * 1.0) - 0.5;  

          this.vy = TAKEOFF_VY + randomVertical;
          this.vx = Math.max(this.speed, 6) + randomHorizontal;
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
        if (p >= 1) this._enterWalkToMonitor();
        break;
      }

      case "walkToMonitor": {
        // Footstep-quantized walk in (constant pace, last step shortened to land
        // in range, then the trailing foot closes up). Stamp a quiet footprint
        // trail while over the sand.
        this._updateWalk(this.active, dt);
        this._stampWalkFootprints();
        break;
      }

      case "walkToCoach": {
        this._updateWalk(this.active, dt);
        break;
      }

      case "readingResult": {
        // Stand and study the screen — a relaxed pose with a small reading nod and
        // one hand resting up (kept facing the monitor, set on enter).
        a.applyIdle();
        a.joints.head.rotation.z += 0.05 * Math.sin(this.t * 1.6);
        a.joints.armR.shoulder.rotation.z = -0.2;
        a.joints.armR.elbow.rotation.z = 1.15;
        break;
      }

      case "talking": {
        // Casual two-person chat, facing the coach (set on enter). The gesturing
        // RIGHT arm stays in the athlete's OWN space: the upper arm hangs close to
        // the body (it does not swing forward toward the coach) and only the
        // forearm lifts/turns a little — so the hands never reach across the gap
        // into the coach. The coach plays its own modest loop via Coach.update().
        this._talkT += dt;
        const g = this._talkT * 2.6;
        a.applyIdle();
        const jt = a.joints;
        jt.armR.shoulder.rotation.z = -0.1; // upper arm hangs, not reaching out
        jt.armR.shoulder.rotation.x = -0.32; // tucked slightly across own chest
        jt.armR.elbow.rotation.z = 1.0 + 0.28 * Math.abs(Math.sin(g)); // forearm gesture
        jt.head.rotation.z += 0.04 * Math.sin(g * 1.3);
        jt.head.rotation.y = 0.08 * Math.sin(g * 0.7); // small nod/glance
        jt.torso.rotation.z += 0.025 * Math.sin(g * 0.9);
        root.position.y = 0.01 * Math.max(0, Math.sin(g));
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
    const stride = Math.floor((this.active.phaseC ?? 0) / Math.PI);
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
    // Detach + free any medals and hide the podium before the rest of teardown.
    this._teardownCeremony();
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

    // The monitor and coaches ARE owned by this event (built in the constructor),
    // so remove them from the scene and free their GPU resources (CLAUDE.md §6).
    this.scene?.remove(this.monitor.group);
    this.monitor.dispose();
    for (const c of this.coaches) {
      this.scene?.remove(c.root);
      c.dispose();
    }

    // The podium is owned by this event too — remove it and free its GPU resources.
    this.scene?.remove(this.podium.group);
    this.podium.dispose();
  }
}
