import * as THREE from "three";

/**
 * The articulated athlete — the graded centrepiece (CLAUDE.md §7).
 *
 * Built as a parent/child Object3D tree so animation happens by ROTATING JOINTS,
 * never by translating rigid blobs (CLAUDE.md §2). Each limb has three joints
 * (shoulder→elbow→wrist, hip→knee→ankle), comfortably past the "two joints"
 * minimum, so the hierarchy is visibly doing the work.
 *
 * Convention: the athlete faces +X (its running direction). The sagittal plane
 * is therefore X–Y, so all gait swinging is rotation about each joint's local
 * Z axis. Limb segments hang along −Y from their pivot; child joints sit at the
 * end of the parent segment.
 *
 * Every pose method (applyIdle / applySet / applyRun / applyCelebrate) is
 * hand-written from sine waves and constants — no imported animation clips.
 */

// Proportions in metres (sums to ~1.8 m tall).
const P = {
  hipY: 0.98, // pelvis pivot height above the feet
  thigh: 0.46,
  shin: 0.45,
  footLen: 0.24,
  torso: 0.52,
  neck: 0.08,
  headR: 0.12,
  upperArm: 0.3,
  forearm: 0.27,
  hand: 0.09,
  hipHalf: 0.11, // half hip width (along Z)
  shoulderHalf: 0.2, // half shoulder width (along Z)
};

export class Athlete {
  /**
   * @param {{ skin?: number, singlet?: number, shorts?: number, shoe?: number }} [kit]
   *   Optional kit colours so the same parametric rig can field different teams
   *   (CLAUDE.md §7: reusable). Defaults preserve the original athletics look.
   */
  constructor(kit = {}) {
    this.root = new THREE.Group();
    this.root.name = "Athlete";

    this._geos = [];
    this.materials = {
      skin: new THREE.MeshStandardMaterial({
        color: kit.skin ?? 0xd9a06b,
        roughness: 0.7,
      }),
      singlet: new THREE.MeshStandardMaterial({
        color: kit.singlet ?? 0x1565c0,
        roughness: 0.6,
      }),
      shorts: new THREE.MeshStandardMaterial({
        color: kit.shorts ?? 0x0d3b8c,
        roughness: 0.6,
      }),
      shoe: new THREE.MeshStandardMaterial({
        color: kit.shoe ?? 0xf5f5f5,
        roughness: 0.5,
      }),
    };

    this._build();
    this.applyIdle();
  }

  // --- rig construction ------------------------------------------------------

  _joint(parent, x, y, z) {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    parent.add(o);
    return o;
  }

  /** A capsule limb segment hanging `dir`·length from its joint. */
  _limb(joint, length, radius, material, dir = -1) {
    const cyl = Math.max(0.002, length - 2 * radius);
    const geo = new THREE.CapsuleGeometry(radius, cyl, 6, 12);
    this._geos.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.y = (dir * length) / 2;
    mesh.castShadow = true;
    joint.add(mesh);
    return mesh;
  }

  _box(joint, w, h, d, material, offset = [0, 0, 0]) {
    const geo = new THREE.BoxGeometry(w, h, d);
    this._geos.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(offset[0], offset[1], offset[2]);
    mesh.castShadow = true;
    joint.add(mesh);
    return mesh;
  }

  _buildArm(torso, sideZ) {
    const m = this.materials;
    const shoulder = this._joint(torso, 0.02, P.torso - 0.08, sideZ);
    this._limb(shoulder, P.upperArm, 0.05, m.skin);
    const elbow = this._joint(shoulder, 0, -P.upperArm, 0);
    this._limb(elbow, P.forearm, 0.045, m.skin);
    const wrist = this._joint(elbow, 0, -P.forearm, 0);
    this._limb(wrist, P.hand, 0.04, m.skin);
    return { shoulder, elbow, wrist };
  }

  _buildLeg(pelvis, sideZ) {
    const m = this.materials;
    const hip = this._joint(pelvis, 0, -0.04, sideZ);
    this._limb(hip, P.thigh, 0.09, m.shorts); // upper part wears shorts
    const knee = this._joint(hip, 0, -P.thigh, 0);
    this._limb(knee, P.shin, 0.07, m.skin);
    const ankle = this._joint(knee, 0, -P.shin, 0);
    // Foot points forward (+X) and rests on the ground.
    this._box(ankle, P.footLen, 0.06, 0.11, m.shoe, [P.footLen / 2 - 0.05, -0.03, 0]);
    return { hip, knee, ankle };
  }

  _build() {
    const m = this.materials;

    // Pelvis (root of the body hierarchy): a rounded, hip-wide mass — a flattened
    // capsule instead of a rigid box, so the hips read as organic.
    const pelvis = this._joint(this.root, 0, P.hipY, 0);
    const pelvisGeo = new THREE.CapsuleGeometry(0.12, 0.06, 6, 16);
    this._geos.push(pelvisGeo);
    const pelvisMesh = new THREE.Mesh(pelvisGeo, m.shorts);
    pelvisMesh.scale.set(0.85, 0.7, 1.25); // shallow front-back, wide across the hips
    pelvisMesh.castShadow = true;
    pelvis.add(pelvisMesh);

    // Torso: a gently tapered, athletic trunk — broad across the chest/shoulders
    // narrowing to the waist (a tapered cylinder, not a box).
    const torso = this._joint(pelvis, 0, 0.09, 0);
    const torsoGeo = new THREE.CylinderGeometry(0.17, 0.12, P.torso, 16, 1);
    this._geos.push(torsoGeo);
    const torsoMesh = new THREE.Mesh(torsoGeo, m.singlet);
    torsoMesh.position.y = P.torso / 2;
    torsoMesh.scale.set(0.8, 1, 1.2); // flatten front-back, widen across the shoulders
    torsoMesh.castShadow = true;
    torso.add(torsoMesh);

    // Neck → head.
    const neck = this._joint(torso, 0, P.torso, 0);
    this._limb(neck, P.neck, 0.045, m.skin, 1);
    const head = this._joint(neck, 0, P.neck, 0);
    const headGeo = new THREE.SphereGeometry(P.headR, 20, 16);
    this._geos.push(headGeo);
    const headMesh = new THREE.Mesh(headGeo, m.skin);
    headMesh.position.y = P.headR;
    headMesh.castShadow = true;
    head.add(headMesh);

    // Limbs (left = +Z, right = −Z).
    const armL = this._buildArm(torso, P.shoulderHalf);
    const armR = this._buildArm(torso, -P.shoulderHalf);
    const legL = this._buildLeg(pelvis, P.hipHalf);
    const legR = this._buildLeg(pelvis, -P.hipHalf);

    this.joints = { pelvis, torso, neck, head, armL, armR, legL, legR };
  }

  // --- poses (all hand-written) ----------------------------------------------

  /** Reset every joint rotation to zero. */
  _zero() {
    const j = this.joints;
    for (const key of ["pelvis", "torso", "neck", "head"]) {
      j[key].rotation.set(0, 0, 0);
    }
    for (const limb of [j.armL, j.armR, j.legL, j.legR]) {
      for (const part of Object.values(limb)) part.rotation.set(0, 0, 0);
    }
  }

  /** Relaxed standing pose. */
  applyIdle() {
    this._zero();
    const j = this.joints;
    // Arms hang slightly away from the body (abducted) with a soft elbow bend,
    // and a touch of asymmetry so the stance doesn't read as a rigid mannequin.
    j.armL.shoulder.rotation.x = -0.13; // left arm splayed out a hair
    j.armR.shoulder.rotation.x = 0.16; // right arm splayed a little more
    j.armL.shoulder.rotation.z = 0.07; // soft forward hang
    j.armR.shoulder.rotation.z = 0.1;
    j.armL.elbow.rotation.z = 0.18;
    j.armR.elbow.rotation.z = 0.26;
    j.torso.rotation.z = -0.04; // barely-there easy lean
    j.head.rotation.y = 0.12; // glance slightly to one side
    this.root.position.y = 0;
  }

  /** Crouched "on the blocks" set position. */
  applySet() {
    this._zero();
    const j = this.joints;
    j.torso.rotation.z = -0.7; // deep forward lean
    // Staggered legs: front leg more bent than the rear.
    j.legR.hip.rotation.z = 0.6;
    j.legR.knee.rotation.z = -1.2;
    j.legL.hip.rotation.z = -0.25;
    j.legL.knee.rotation.z = -1.7;
    j.legL.ankle.rotation.z = 0.6;
    // Hands reaching down to the line.
    for (const arm of [j.armL, j.armR]) {
      arm.shoulder.rotation.z = -1.5;
      arm.elbow.rotation.z = 0.1;
    }
    this.root.position.y = 0;
  }

  /**
   * Running gait at a given phase and amplitude (0..1). Legs are π out of phase;
   * each arm counter-swings against the same-side leg.
   * @param {number} phase accumulated gait phase in radians.
   * @param {number} amp stride amplitude scaling, 0..1.
   */
  applyRun(phase, amp = 1) {
    const j = this.joints;
    this._zero(); // clear any leftover axes from a prior pose (idle/celebrate)
    this._legPose(j.legR, phase, amp);
    this._legPose(j.legL, phase + Math.PI, amp);
    this._armPose(j.armR, phase + Math.PI, amp);
    this._armPose(j.armL, phase, amp);

    j.torso.rotation.z = -0.28 * amp; // natural forward lean into the run
    j.head.rotation.z = 0.22 * amp; // counter the lean so the gaze stays level/ahead
  }

  _legPose(leg, ph, amp) {
    leg.hip.rotation.z = 0.85 * amp * Math.sin(ph);
    const flex = Math.max(0, Math.sin(ph - 1.2)); // knee flexes during recovery
    leg.knee.rotation.z = -(0.15 + 1.3 * amp * flex);
    leg.ankle.rotation.z = 0.25 * amp * Math.sin(ph + 0.5);
  }

  _armPose(arm, ph, amp) {
    arm.shoulder.rotation.z = 0.7 * amp * Math.sin(ph);
    arm.elbow.rotation.z = 1.1 + 0.3 * amp * Math.sin(ph); // ~90° pumping elbow
  }

  /**
   * Takeoff gather / landing absorb: a two-footed crouch with the arms drawn
   * back, ready to drive upward (or to cushion the landing).
   */
  applyGather() {
    this._zero();
    const j = this.joints;
    for (const leg of [j.legL, j.legR]) {
      leg.hip.rotation.z = 0.35;
      leg.knee.rotation.z = -0.85;
      leg.ankle.rotation.z = 0.35;
    }
    j.torso.rotation.z = -0.25;
    for (const arm of [j.armL, j.armR]) {
      arm.shoulder.rotation.z = -1.0; // arms swept back
      arm.elbow.rotation.z = 0.3;
    }
  }

  /**
   * Long jump flight, parameterised 0..1 across the arc: an early "sail" (knees
   * tucked, arms overhead) that morphs into a "reach" (legs extended forward,
   * arms swinging down) for the landing.
   * @param {number} p flight progress, 0 (takeoff) → 1 (landing).
   */
  applyFlight(p) {
    this._zero();
    const j = this.joints;
    const reach = THREE.MathUtils.smoothstep(p, 0.45, 1.0); // 0 early → 1 late

    const hipFlex = 0.6 + 1.0 * reach; // thighs swing up/forward for the reach
    const kneeBend = -(1.2 * (1 - reach) + 0.1); // tucked early, straight late
    for (const leg of [j.legL, j.legR]) {
      leg.hip.rotation.z = hipFlex;
      leg.knee.rotation.z = kneeBend;
      leg.ankle.rotation.z = 0.2 + 0.3 * reach;
    }
    j.legR.hip.rotation.z = hipFlex * 0.92; // slight asymmetry

    const armAngle = 2.4 * (1 - reach) + 0.5 * reach; // overhead → forward/down
    for (const [arm, splay] of [
      [j.armL, 0.2],
      [j.armR, -0.2],
    ]) {
      arm.shoulder.rotation.z = armAngle;
      arm.shoulder.rotation.x = splay * (1 - reach);
      arm.elbow.rotation.z = 0.2;
    }

    j.torso.rotation.z = -0.1 + 0.5 * reach; // arch back, then fold for landing
  }

  /**
   * Keepie-uppie juggling: alternating knee lifts with the arms out for
   * balance. The event bobs the ball above the lifting foot.
   * @param {number} t time in seconds.
   */
  applyJuggle(t) {
    this._zero();
    const j = this.joints;
    const liftR = Math.max(0, Math.sin(t * 4));
    const liftL = Math.max(0, Math.sin(t * 4 + Math.PI));
    j.legR.hip.rotation.z = 0.3 * liftR;
    j.legR.knee.rotation.z = -1.0 * liftR;
    j.legL.hip.rotation.z = 0.3 * liftL;
    j.legL.knee.rotation.z = -1.0 * liftL;
    for (const [arm, splay] of [
      [j.armL, 0.7],
      [j.armR, -0.7],
    ]) {
      arm.shoulder.rotation.x = splay;
      arm.shoulder.rotation.z = -0.2;
      arm.elbow.rotation.z = 0.4;
    }
  }

  /**
   * A kick, parameterised 0..1: the right leg swings from a cocked-back windup
   * through to follow-through while the left leg plants. The event launches the
   * ball around the contact point (p ≈ 0.55).
   * @param {number} p kick progress, 0 (windup) → 1 (follow-through).
   */
  applyKick(p) {
    this._zero();
    const j = this.joints;

    // Plant leg (left) takes the weight, slightly bent.
    j.legL.hip.rotation.z = -0.1;
    j.legL.knee.rotation.z = -0.3;

    // Kicking leg (right): hip swings back then forward; knee whips straight.
    j.legR.hip.rotation.z = THREE.MathUtils.lerp(-0.8, 1.3, p);
    j.legR.knee.rotation.z = -(0.2 + 0.8 * (1 - p)); // cocked early, extends late
    j.legR.ankle.rotation.z = 0.2;

    // Arms counterbalance the swing.
    j.armL.shoulder.rotation.z = 0.8;
    j.armL.elbow.rotation.z = 0.6;
    j.armR.shoulder.rotation.z = -0.6;
    j.armR.elbow.rotation.z = 0.6;

    j.torso.rotation.z = -0.1 + 0.25 * p;
  }

  /**
   * Goalkeeper dive reach: BOTH arms stretch out together in the direction of the
   * dive (as a real keeper reaches for the ball), rather than splaying into a V.
   * The arms go overhead and lean toward the dive side; combined with the body
   * toppling that way (the event tweens the root's roll), they end up pointing
   * along the dive. `side` is +1 to dive toward +Z (the rig's local left) or −1
   * toward −Z.
   * @param {number} side +1 or −1, the lateral dive direction.
   */
  applyDive(side = 1) {
    this._zero();
    const j = this.joints;
    const s = Math.sign(side) || 1;

    // Both arms reach the SAME way (same-sign lean) so they extend toward the
    // ball together; elbows nearly straight for a full, committed reach.
    for (const arm of [j.armL, j.armR]) {
      arm.shoulder.rotation.z = 2.7; // straight up over the head
      arm.shoulder.rotation.x = 0.55 * s; // lean the reach toward the dive side
      arm.elbow.rotation.z = 0.05; // arms almost fully extended
    }

    // Legs trail in a slight split for the airborne, streamlined dive shape.
    j.legL.hip.rotation.z = 0.25;
    j.legR.hip.rotation.z = -0.18;
    j.legL.knee.rotation.z = -0.25;
    j.legR.knee.rotation.z = -0.5;

    j.torso.rotation.z = -0.12; // a little arch toward the ball
  }

  /** Victory celebration: arched back, face to the sky, arms in a wide V. */
  applyCelebrate(t) {
    this._zero();
    const j = this.joints;
    const wave = 0.15 * Math.sin(t * 6);

    // Arch back through the spine and lift the chin to the sky. NB: this rig
    // faces +X with its sagittal plane in X–Y, so a backward arch / head-up tilt
    // is a positive rotation about Z (a rotation about X would tip it sideways).
    j.torso.rotation.z = 0.22; // slight backward arch
    j.head.rotation.z = 0.34; // chin up, looking at the sky

    for (const [arm, splay] of [
      [j.armL, 0.5],
      [j.armR, -0.5],
    ]) {
      arm.shoulder.rotation.z = 2.5 + wave; // raise overhead
      arm.shoulder.rotation.x = splay; // angle outward into a natural V
      arm.elbow.rotation.z = 0.12;
    }
  }

  dispose() {
    this._geos.forEach((g) => g.dispose());
    Object.values(this.materials).forEach((m) => m.dispose());
  }
}
