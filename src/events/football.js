import * as THREE from "three";

import { makeFootballTexture } from "../utils/textures.js";
import {
  FB_Z,
  FB_GOAL_X,
  FB_BALL_START_X,
  FB_PLAYER_START_X,
  BALL_RADIUS,
} from "../stadium/config.js";

/**
 * The football exhibition state machine (CLAUDE.md §8, priority 4):
 *
 *   idle → approach → juggle → kick → flight → goal → celebrate
 *
 * Reuses the articulated Athlete rig (a third instance). The player faces −X and
 * shoots into the goal on the −X goal line. The ball is a hand-written
 * projectile (no physics engine, CLAUDE.md §2): a parabola plus rolling spin.
 */

const DIR = -1; // play/shoot toward −X
const G = 9.81;
const RUN_VMAX = 6;
const ACCEL = 6;
const PHASE_RATE = 18;
const APPROACH_TARGET_X = FB_BALL_START_X + 1; // stop just behind the ball
const JUGGLE_TIME = 3.0;
const KICK_TIME = 0.5;
const KICK_CONTACT = 0.55; // p at which the ball is struck
const SHOT_VY = 6.0;

export class FootballEvent {
  /**
   * @param {import("../athletes/athlete.js").Athlete} athlete
   * @param {{ onStatus?: (text: string) => void,
   *           director?: import("../cameras/director.js").Director }} [opts]
   */
  constructor(athlete, opts = {}) {
    this.athlete = athlete;
    this.onStatus = opts.onStatus ?? (() => {});
    this.director = opts.director ?? null;

    // The ball entity this event owns.
    const tex = makeFootballTexture();
    const geo = new THREE.SphereGeometry(BALL_RADIUS, 24, 16);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
    this.ball = new THREE.Mesh(geo, mat);
    this.ball.name = "Football";
    this.ball.castShadow = true;
    this._ballDisposables = [tex, geo, mat];

    this.reset();
  }

  reset() {
    this.state = "idle";
    this.t = 0;
    this.phase = 0;
    this.speed = 0;
    this.launched = false;
    this.flightT = 0;
    this.flightDur = 1;
    this.vx = 0;

    this.athlete.root.position.set(FB_PLAYER_START_X, 0, FB_Z);
    this.athlete.root.rotation.y = Math.PI; // face −X
    this.athlete.applyIdle();

    this.ball.position.set(FB_BALL_START_X, BALL_RADIUS, FB_Z);
    this.ball.rotation.set(0, 0, 0);

    this.onStatus('Press "Start football"');
  }

  start() {
    if (["approach", "juggle", "kick", "flight"].includes(this.state)) return;
    this.reset();
    this._enter("approach", "Approaching…");
  }

  get running() {
    return this.state !== "idle";
  }

  update(delta) {
    this.t += delta;
    const p = this.athlete.root.position;

    switch (this.state) {
      case "approach": {
        this.speed = Math.min(RUN_VMAX, this.speed + ACCEL * delta);
        const f = this.speed / RUN_VMAX;
        p.x += DIR * this.speed * delta;
        this.phase += delta * f * PHASE_RATE;
        this.athlete.applyRun(this.phase, Math.min(1, 0.5 + f));
        p.y = 0.04 * Math.abs(Math.sin(this.phase));
        // Reached the ball? (moving in −X, so x has dropped to the target)
        if ((p.x - APPROACH_TARGET_X) * DIR >= 0) {
          p.y = 0;
          this._enter("juggle", "Keepie-uppies! ⚽");
        }
        break;
      }

      case "juggle": {
        this.athlete.applyJuggle(this.t);
        // Ball bobs above the foot in front of the player.
        const bob = 0.4 + 0.45 * Math.abs(Math.sin(this.t * 4));
        this.ball.position.set(p.x + DIR * 0.6, bob, FB_Z);
        this.ball.rotation.x += delta * 3;
        if (this.t > JUGGLE_TIME) {
          // Drop the ball to the ground in front of the kicking foot.
          this.ball.position.set(p.x + DIR * 0.7, BALL_RADIUS, FB_Z);
          this._enter("kick", "Strike!");
        }
        break;
      }

      case "kick": {
        const prog = Math.min(1, this.t / KICK_TIME);
        this.athlete.applyKick(prog);
        if (!this.launched && prog >= KICK_CONTACT) {
          this.launched = true;
          this.flightT = 0;
          this.flightDur = (2 * SHOT_VY) / G;
          // Horizontal speed chosen so the ball reaches past the goal line.
          const distance = Math.abs(this.ball.position.x - FB_GOAL_X) + 2;
          this.vx = DIR * (distance / this.flightDur);
          this._launchX = this.ball.position.x;
          // Follow the ball so every camera mode tracks the shot — but ONLY if
          // the camera is currently on this player (don't hijack the view if the
          // user has since started watching another sport).
          if (this.director && this.director.subjectObject === this.athlete.root) {
            this.director.setSubject(this.ball, "football");
          }
          this._enter("flight", "⚽💨");
        }
        break;
      }

      case "flight": {
        this.athlete.applyKick(1); // hold the follow-through
        this.flightT += delta;
        this.ball.position.x += this.vx * delta;
        this.ball.position.y =
          BALL_RADIUS + SHOT_VY * this.flightT - 0.5 * G * this.flightT * this.flightT;
        // Rolling spin about Z as it travels in X.
        this.ball.rotation.z += (this.vx * delta) / BALL_RADIUS;

        if ((this.ball.position.x - FB_GOAL_X) * DIR >= 0) {
          this.ball.position.x = FB_GOAL_X - 0.8; // nestle into the net
          this._enter("goal", "GOAL! 🥅");
        } else if (this.ball.position.y <= BALL_RADIUS && this.flightT > 0.1) {
          this.ball.position.y = BALL_RADIUS;
          this._enter("goal", "GOAL! 🥅"); // landed; roll it in
        }
        break;
      }

      case "goal": {
        // Settle the ball onto the ground, then celebrate.
        this.ball.position.y = THREE.MathUtils.lerp(
          this.ball.position.y,
          BALL_RADIUS,
          Math.min(1, delta * 6),
        );
        if (this.t > 0.6) {
          // Hand the camera back to the player, but only if it was on the ball.
          if (this.director && this.director.subjectObject === this.ball) {
            this.director.setSubject(this.athlete.root, "football");
          }
          this._enter("celebrate", "⚽ What a strike!");
        }
        break;
      }

      case "celebrate":
        this.athlete.applyCelebrate(this.t);
        p.y = 0.05 * Math.abs(Math.sin(this.t * 5));
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

  dispose() {
    this._ballDisposables.forEach((d) => d.dispose());
  }
}
