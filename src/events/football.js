import * as THREE from "three";
import * as TWEEN from "tween";

import { Athlete } from "../athletes/athlete.js";
import { makeFootballTexture } from "../utils/textures.js";
import { FB_GOAL_X, BALL_RADIUS } from "../stadium/config.js";

/**
 * The football exhibition — a 22-player choreographed match (CLAUDE.md §8).
 *
 *   idle → entrance → play → done
 *
 * Two teams of 11 (a 4-3-3 each) jog onto the pitch from opposite touchlines,
 * then a short, fast passing move is played out and finished into the −X goal
 * before the event settles into a celebration.
 *
 * IMPORTANT (CLAUDE.md §2): every limb animation is a HAND-WRITTEN joint pose on
 * the articulated Athlete rig (applyRun / applyKick / applyCelebrate / …). tween.js
 * is used ONLY to drive the high-level choreography — where players run to and
 * the ball's flight between them — never to play a baked animation clip.
 *
 * All tweens live in a PRIVATE TWEEN.Group owned by this event and advanced from
 * update(), so teardown (dispose → group.removeAll()) cleanly stops everything
 * and there are no leaks (CLAUDE.md §6).
 */

// Team kit colours (singlet / shorts). Goalkeepers wear a distinct strip.
const KIT = {
  A: { singlet: 0x1e88e5, shorts: 0xffffff },
  B: { singlet: 0xe53935, shorts: 0x1a1a1a },
  GK_A: { singlet: 0x43a047, shorts: 0x111111 },
  GK_B: { singlet: 0xfdd835, shorts: 0x111111 },
};

const ENTRANCE_MS = 2400; // jog-on duration
const STAGGER_MS = 60; // per-player entrance offset (a flowing line, not lockstep)
const SETTLE_MS = 600; // pause after the last player arrives before kick-off
const KICK_WINDUP_MS = 300; // the kick pose plays before the ball is struck
const RUN_RATE = 15; // gait phase radians/sec while a player is running

/**
 * One footballer: an articulated Athlete driven by a tiny pose state machine.
 * Movement across the pitch is tweened (event-level); the limbs are all the
 * rig's hand-written joint poses.
 */
class Footballer {
  /** @param {Athlete} athlete */
  constructor(athlete) {
    this.athlete = athlete;
    this.phase = Math.random() * Math.PI * 2; // desync gaits
    this.state = "idle";
    this.t = 0;
  }

  get root() {
    return this.athlete.root;
  }

  setState(s) {
    this.state = s;
    this.t = 0;
  }

  /** Face the horizontal direction (dx,dz); the rig's local forward is +X. */
  faceDir(dx, dz) {
    if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) return;
    this.root.rotation.y = Math.atan2(-dz, dx);
  }

  update(dt) {
    this.t += dt;
    const a = this.athlete;
    switch (this.state) {
      case "run":
        this.phase += dt * RUN_RATE;
        a.applyRun(this.phase, 0.9);
        this.root.position.y = 0.04 * Math.abs(Math.sin(this.phase));
        break;

      case "kick": {
        const p = Math.min(1, this.t / 0.5);
        a.applyKick(p);
        this.root.position.y = 0;
        if (this.t > 0.7) this.setState("idle"); // back to a ready stance
        break;
      }

      case "celebrate":
        a.applyCelebrate(this.t);
        this.root.position.y = 0.05 * Math.abs(Math.sin(this.t * 5));
        break;

      case "dejected": // hands-low slump after conceding
        a.applyIdle();
        a.joints.torso.rotation.z = -0.18;
        a.joints.head.rotation.z = 0.3;
        this.root.position.y = 0;
        break;

      case "keeper": // alert crouch, ready to spring
        a.applyGather();
        this.root.position.y = 0;
        break;

      case "dive": // reach toward the dive side; the event tweens the root roll/slide
        a.applyDive(this.diveSide ?? 1);
        break;

      case "idle":
      default:
        a.applyIdle();
        this.root.position.y = 0;
        break;
    }
  }
}

export class FootballEvent {
  /**
   * The event OWNS both teams AND the ball: it builds them, adds them to the
   * scene, and disposes them on teardown (EventManager "one sport at a time",
   * CLAUDE.md §6).
   *
   * @param {{ scene: import("three").Scene,
   *           onStatus?: (text: string) => void,
   *           director?: import("../cameras/director.js").Director }} ctx
   */
  constructor({ scene, onStatus, director } = {}) {
    this.scene = scene;
    this.onStatus = onStatus ?? (() => {});
    this.director = director ?? null;

    this.subjectType = "football"; // the camera chases the ball
    this.tweens = new TWEEN.Group(); // private group → clean teardown
    this._axis = new THREE.Vector3(); // scratch for rolling spin

    /** @type {Footballer[]} */ this.players = [];
    /** @type {Footballer[]} */ this.teamA = [];
    /** @type {Footballer[]} */ this.teamB = [];

    // The ball this event owns.
    const tex = makeFootballTexture();
    const geo = new THREE.SphereGeometry(BALL_RADIUS, 24, 16);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
    this.ball = new THREE.Mesh(geo, mat);
    this.ball.name = "Football";
    this.ball.castShadow = true;
    this._ballDisposables = [tex, geo, mat];
    scene.add(this.ball);

    this._buildTeams();
    this.reset();
  }

  /** The director follows the ball through the move. */
  get subject() {
    return this.ball;
  }

  // --- construction ----------------------------------------------------------

  /** A 4-3-3 laid out up-field from a team's own goal. */
  _formation(ownGoalX, dir) {
    const at = (dist, z, role) => ({ x: ownGoalX + dir * dist, z, role });
    return [
      at(2, 0, "gk"),
      at(18, -22, "def"),
      at(18, -8, "def"),
      at(18, 8, "def"),
      at(18, 22, "def"),
      at(36, -18, "mid"),
      at(36, 0, "mid"),
      at(36, 18, "mid"),
      at(54, -16, "fwd"),
      at(54, 0, "fwd"),
      at(54, 16, "fwd"),
    ];
  }

  _spawn(team, slot) {
    const kit = slot.role === "gk" ? KIT[`GK_${team}`] : KIT[team];
    const athlete = new Athlete({ singlet: kit.singlet, shorts: kit.shorts });
    this.scene.add(athlete.root);

    const p = new Footballer(athlete);
    p.team = team;
    p.role = slot.role;
    p.home = new THREE.Vector3(slot.x, 0, slot.z);
    // Each team jogs on from its own touchline (A from +Z, B from −Z).
    const sideZ = team === "A" ? 37 : -37;
    p.start = new THREE.Vector3(slot.x, 0, sideZ);
    return p;
  }

  _buildTeams() {
    // Team A attacks −X (toward the goal at FB_GOAL_X); Team B defends it.
    const formA = this._formation(48, -1);
    const formB = this._formation(-48, 1);

    // Stage Team A's passing chain: override four players to spots that march
    // toward the −X goal so the move reads clearly. Slots: mid-centre + 3 fwds.
    const chainSpots = [
      { x: -4, z: -2 }, // C0 — kick-off
      { x: -16, z: -15 }, // C1
      { x: -26, z: 6 }, // C2
      { x: -34, z: -6 }, // C3 — shooter
    ];
    const chainIdx = [6, 8, 9, 10];
    chainIdx.forEach((slot, k) => {
      formA[slot].x = chainSpots[k].x;
      formA[slot].z = chainSpots[k].z;
    });

    this.teamA = formA.map((slot) => this._spawn("A", slot));
    this.teamB = formB.map((slot) => this._spawn("B", slot));
    this.players = [...this.teamA, ...this.teamB];

    this.chain = chainIdx.map((slot) => this.teamA[slot]);
    this.keeperB = this.teamB[0];
  }

  // --- lifecycle -------------------------------------------------------------

  reset() {
    this.tweens.removeAll();
    this.state = "idle";

    for (const p of this.players) {
      p.root.position.copy(p.start);
      p.root.rotation.set(0, 0, 0);
      p.faceDir(p.home.x - p.start.x, p.home.z - p.start.z);
      p.setState("idle");
      p.update(0); // apply the idle pose once
    }

    const c0 = this.chain[0].home;
    this.ball.position.set(c0.x - 0.7, BALL_RADIUS, c0.z);
    this.ball.quaternion.identity();

    this.onStatus('Press "Start football"');
  }

  start() {
    if (this.state === "entrance" || this.state === "play") return;
    this.reset();
    this.state = "entrance";
    this.onStatus("Teams entering… ⚽");
    this._runEntrance();
  }

  update(delta) {
    this.tweens.update(); // advance this event's choreography
    for (const p of this.players) p.update(delta);
  }

  // --- choreography ----------------------------------------------------------

  _runEntrance() {
    this.players.forEach((p, i) => {
      p.setState("run");
      new TWEEN.Tween(p.root.position, this.tweens)
        .to({ x: p.home.x, z: p.home.z }, ENTRANCE_MS)
        .delay((i % 11) * STAGGER_MS)
        .easing(TWEEN.Easing.Quadratic.Out)
        .onComplete(() => {
          p.faceDir(p.team === "A" ? -1 : 1, 0); // turn to face the play
          p.setState(p.role === "gk" ? "keeper" : "idle");
        })
        .start();
    });

    const lastArrival = ENTRANCE_MS + 10 * STAGGER_MS;
    this._delay(lastArrival + SETTLE_MS, () => this._startPlay());
  }

  _startPlay() {
    if (this.state !== "entrance") return;
    this.state = "play";
    this.onStatus("Kick-off! ⚽");

    const goal = new THREE.Vector3(FB_GOAL_X - 0.6, 0.4, 0); // into the net
    this._segments = [
      { kicker: this.chain[0], to: this.chain[1].home.clone(), dur: 650, arc: 1.6, endY: BALL_RADIUS },
      { kicker: this.chain[1], to: this.chain[2].home.clone(), dur: 720, arc: 1.8, endY: BALL_RADIUS },
      { kicker: this.chain[2], to: this.chain[3].home.clone(), dur: 620, arc: 1.4, endY: BALL_RADIUS },
      { kicker: this.chain[3], to: goal, dur: 720, arc: 1.1, endY: 0.4, shot: true },
    ];
    this._runSegment(0);
  }

  _runSegment(i) {
    if (this.state !== "play") return;
    const seg = this._segments[i];
    const k = seg.kicker;

    k.faceDir(seg.to.x - k.root.position.x, seg.to.z - k.root.position.z);
    k.setState("kick");
    if (seg.shot) {
      this.onStatus("Shot! 🎯");
      this._keeperDive(seg.to);
    }

    this._ballTo(seg.to, seg.dur, seg.arc, seg.endY)
      .delay(KICK_WINDUP_MS) // strike after the wind-up
      .onComplete(() => {
        if (i + 1 < this._segments.length) this._runSegment(i + 1);
        else this._onGoal();
      })
      .start();
  }

  /** Tween the ball from its current spot to `to` along a parabolic arc. */
  _ballTo(to, dur, arc, endY) {
    const from = this.ball.position.clone();
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const ground = Math.hypot(dx, dz);
    const o = { k: 0 };
    return new TWEEN.Tween(o, this.tweens)
      .to({ k: 1 }, dur)
      .easing(TWEEN.Easing.Quadratic.Out)
      .onUpdate(() => {
        const k = o.k;
        this.ball.position.x = from.x + dx * k;
        this.ball.position.z = from.z + dz * k;
        this.ball.position.y = from.y + (endY - from.y) * k + arc * Math.sin(Math.PI * k);
        // Roll about the axis perpendicular to travel.
        if (ground > 1e-3) {
          this._axis.set(-dz, 0, dx).normalize();
          this.ball.quaternion.setFromAxisAngle(this._axis, (ground / BALL_RADIUS) * k);
        }
      });
  }

  /** Goalkeeper springs sideways toward the shot (procedural, not a clip). */
  _keeperDive(target) {
    const gk = this.keeperB;
    const side = target.z >= gk.root.position.z ? 1 : -1;
    gk.diveSide = side; // so the dive pose reaches the right way
    gk.setState("dive");
    const delay = KICK_WINDUP_MS + 100;
    new TWEEN.Tween(gk.root.position, this.tweens)
      .to({ z: gk.root.position.z + side * 2.6, y: 0.45 }, 420)
      .delay(delay)
      .easing(TWEEN.Easing.Quadratic.Out)
      .start();
    new TWEEN.Tween(gk.root.rotation, this.tweens)
      .to({ x: side * 1.1 }, 420) // topple toward the dive side
      .delay(delay)
      .start();
  }

  _onGoal() {
    this.state = "done";
    this.onStatus("GOAL! ⚽🥅");
    this.ball.position.set(FB_GOAL_X - 0.6, 0.4, 0); // settle into the net

    for (const p of this.teamA) if (p.role !== "gk") p.setState("celebrate");
    for (const p of this.teamB) if (p.role !== "gk") p.setState("dejected");

    // Hero shot: swing the camera to the scorer (only if it was on the ball, so
    // we don't hijack a view the user has since changed).
    if (this.director && this.director.subjectObject === this.ball) {
      this.director.setSubject(this.chain[3].root, "football");
    }
  }

  // --- helpers ---------------------------------------------------------------

  /** Fire `cb` after `ms`, sequenced through this event's tween group. */
  _delay(ms, cb) {
    new TWEEN.Tween({}, this.tweens).to({}, ms).onComplete(cb).start();
  }

  /** Remove both teams + the ball from the scene and free all GPU resources. */
  dispose() {
    this.tweens.removeAll();
    for (const p of this.players) {
      this.scene?.remove(p.root);
      p.athlete.dispose();
    }
    this.scene?.remove(this.ball);
    this._ballDisposables.forEach((d) => d.dispose());
  }
}
