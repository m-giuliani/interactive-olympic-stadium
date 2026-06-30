import * as THREE from "three";

import { Athlete } from "./athlete.js";

/**
 * A coach standing on the infield. It REUSES the articulated Athlete rig (same
 * mesh-builder, so the proportions match the competitors — CLAUDE.md §7) but is
 * visually distinguished by a dark tracksuit kit, a flat cap on the head and a
 * clipboard held in the right hand. The cap and clipboard are parented to the
 * head and wrist joints respectively, so they ride the hierarchy as the coach
 * moves — no extra bookkeeping.
 *
 * All motion is procedural and hand-written (CLAUDE.md §2): a relaxed idle with
 * breathing, a slow weight-shift and the occasional glance/note-taking, plus a
 * livelier "chatting" loop (small two-handed gestures, head bob) used while an
 * athlete is talking to them.
 */

// Dark tracksuit kits so the coaches read clearly apart from the bright singlets.
export const COACH_KITS = [
  { singlet: 0x26343f, shorts: 0x1b2730, shoe: 0x12181d, skin: 0xcf9b6e },
  { singlet: 0x4e342e, shorts: 0x37241f, shoe: 0x1a1410, skin: 0xb07a52 },
  { singlet: 0x2f3b2c, shorts: 0x222b20, shoe: 0x141811, skin: 0xe0b48a },
];

const CAP_COLOR = 0x11151a;
const CLIPBOARD_COLOR = 0x6d4c33;
const PAPER_COLOR = 0xf4f1e8;

export class Coach {
  /**
   * @param {{ singlet?: number, shorts?: number, shoe?: number, skin?: number }} [kit]
   */
  constructor(kit = COACH_KITS[0]) {
    this.athlete = new Athlete(kit);
    this.root = this.athlete.root;
    this.root.name = "Coach";

    this._geos = [];
    this._mats = [];
    this.t = Math.random() * Math.PI * 2; // desync coaches so they don't move in lockstep
    this.talking = false;
    this.homeYaw = 0;

    this._addCap();
    this._addClipboard();
  }

  _mesh(geo, color, parent, pos) {
    this._geos.push(geo);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
    this._mats.push(mat);
    const m = new THREE.Mesh(geo, mat);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    m.castShadow = true;
    parent.add(m);
    return m;
  }

  /** A flat cap parented to the head joint (rides the head as it turns). */
  _addCap() {
    const head = this.athlete.joints.head;
    // Crown sits just above the head sphere (head mesh centred at +headR ≈ 0.12).
    this._mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 16), CAP_COLOR, head, [0, 0.2, 0]);
    // Forward brim (the rig faces +X), a thin flattened box.
    const brim = this._mesh(new THREE.BoxGeometry(0.16, 0.02, 0.22), CAP_COLOR, head, [0.12, 0.18, 0]);
    brim.castShadow = true;
  }

  /** A clipboard + paper parented to the right wrist, held across the body. */
  _addClipboard() {
    const wrist = this.athlete.joints.armR.wrist;
    const board = this._mesh(new THREE.BoxGeometry(0.02, 0.26, 0.2), CLIPBOARD_COLOR, wrist, [0.04, -0.1, 0]);
    board.rotation.z = Math.PI / 2; // lay it flat in the hand
    this._mesh(new THREE.BoxGeometry(0.005, 0.22, 0.16), PAPER_COLOR, board, [0.014, 0, 0]);
  }

  /** Orient the coach to face a world point (used to turn toward a talker). */
  faceToward(x, z) {
    const dx = x - this.root.position.x;
    const dz = z - this.root.position.z;
    if (Math.abs(dx) < 1e-4 && Math.abs(dz) < 1e-4) return;
    this.root.rotation.y = Math.atan2(-dz, dx);
  }

  /**
   * Toggle the chatting loop. Turning it off restores the coach's resting facing
   * so they go back to watching the field.
   */
  setTalking(on) {
    this.talking = on;
    if (!on) this.root.rotation.y = this.homeYaw;
  }

  /** Per-frame procedural animation (frame-rate independent via dt). */
  update(dt) {
    this.t += dt;
    const a = this.athlete;
    const j = a.joints;

    // Relaxed standing base (zeroes the rig + sets a natural stance), then layer.
    a.applyIdle();

    // Hold the clipboard: right forearm folded up across the front of the body.
    j.armR.shoulder.rotation.z = -0.55;
    j.armR.shoulder.rotation.x = -0.35;
    j.armR.elbow.rotation.z = 1.2;

    // Breathing + a slow weight shift so the stance is never frozen.
    const breathe = Math.sin(this.t * 1.6);
    j.torso.rotation.z += 0.025 * breathe;
    this.root.position.y = 0.012 * Math.max(0, breathe);

    if (this.talking) {
      // Casual chat: a modest left-hand gesture kept in the coach's OWN space —
      // the upper arm stays close to the body (no forward reach toward the
      // athlete) and only the forearm lifts/turns, so the hands never cross the
      // gap into the athlete. Plus a small head bob/glance.
      const g = this.t * 2.6;
      j.armL.shoulder.rotation.z = -0.15;
      j.armL.shoulder.rotation.x = 0.3;
      j.armL.elbow.rotation.z = 1.0 + 0.3 * Math.abs(Math.sin(g));
      j.head.rotation.z += 0.05 * Math.sin(g * 1.1);
      j.head.rotation.y = 0.1 * Math.sin(g * 0.6);
    } else {
      // Idle watching: slow look around + an occasional glance down at the notes.
      const look = Math.sin(this.t * 0.4);
      j.head.rotation.y = 0.3 * look;
      const note = Math.max(0, Math.sin(this.t * 0.5 - 1.0)); // intermittent
      j.armL.shoulder.rotation.z = -0.2 - 0.3 * note;
      j.armL.shoulder.rotation.x = 0.1;
      j.armL.elbow.rotation.z = 0.3 + 0.8 * note;
    }
  }

  dispose() {
    this.athlete.dispose();
    this._geos.forEach((g) => g.dispose());
    this._mats.forEach((m) => m.dispose());
  }
}
