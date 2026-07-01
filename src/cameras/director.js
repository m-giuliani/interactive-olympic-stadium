import * as THREE from "three";

/**
 * Director AI — the cinematic broadcast camera system (CLAUDE.md §8: cameras +
 * transitions). There is NO global fulcrum: every mode is driven by the world
 * position of the current `activeSubject` (Sprinter / Jumper / Football / Drone),
 * or, in Free Explore, by a freely movable OrbitControls rig.
 *
 * Modes:
 *  - "broadcast" : fixed gantry high in the stand; lerped lookAt with a filmic
 *                  delay (operator reaction time).
 *  - "campus"    : fixed exterior hero shot framing the +Z Olympic Campus,
 *                  flag avenue, plaza, and stadium entrance.
 *  - "spider"    : flies along a Catmull-Rom spline high above the field, always
 *                  looking down at the subject at roughly constant distance.
 *  - "action"    : sport-specific rail cam — runner dolly, jumper side-profile,
 *                  football ball-chase with height/speed-driven zoom-out.
 *  - "free"      : OrbitControls (orbit/pan/zoom) + WASD/QE fly through the
 *                  stadium volume.
 *  - "cinematic" : grand auto-orbit (used by the ceremony; not in the UI).
 *
 * Also drives the depth-of-field focus distance if a BokehPass is supplied.
 */

const BROADCAST_POS = new THREE.Vector3(0, 20, 80); // gantry in the main stand
const CAMPUS_POS = new THREE.Vector3(0, 55, 245);
const CAMPUS_TARGET = new THREE.Vector3(0, 8, 105);
const SPIDER_HEIGHT = 48;
const SPIDER_TRAIL = 8; // how far the spider-cam trails behind the athlete (m)
const FLY_SPEED = 32; // m/s for WASD movement
const LEAD_MAX = 7; // max look-ahead distance (m) ahead of a moving subject
const UP = new THREE.Vector3(0, 1, 0);

// First-person "Free Explore": OrbitControls is reused, but the orbit target is
// pinned a hair in front of the camera so dragging rotates the head in place
// (look-around) instead of orbiting a distant pivot. LOOK_DIST is that tiny
// pivot radius; DOF_AHEAD is where depth-of-field focuses so the near pivot does
// not blur the whole scene.
const LOOK_DIST = 0.15;
const DOF_AHEAD = 30;

export class Director {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {import("three/addons/controls/OrbitControls.js").OrbitControls} controls
   * @param {{ bokehPass?: import("three/addons/postprocessing/BokehPass.js").BokehPass }} [opts]
   */
  constructor(camera, controls, opts = {}) {
    this.camera = camera;
    this.controls = controls;
    this.bokehPass = opts.bokehPass ?? null;

    this.mode = "free";

    // A roaming "drone" virtual subject used whenever no sport is selected, so
    // the cinematic cameras always have something natural to follow.
    this.drone = new THREE.Object3D();
    this.subjectObject = this.drone;
    this.subjectType = "drone";

    // Spider-cam: a free overhead tracker. A real 4-cable rig can position
    // itself anywhere in the overhead volume, so it simply hovers above the aim
    // point — it is NOT constrained to a fixed path (which made the angle drift
    // as it slid along a curve to stay "nearest" a straight-running athlete).
    this._spiderZoom = 0; // 0 = high overhead, →0.85 = down near the subject

    // Broadcast TV optical (lens) zoom: 0 = wide, →1 = telephoto.
    this._baseFov = camera.fov;
    this._broadcastZoom = 0;

    // Smoothing / scratch state.
    this._focus = new THREE.Vector3(); // smoothed look-at point
    this._prev = new THREE.Vector3(); // previous subject position (for speed)
    this._vel = new THREE.Vector3(); // heavily-smoothed subject velocity
    this._aim = new THREE.Vector3(); // look-ahead (lead) point
    this._smoothedLead = new THREE.Vector3(); // glided look-ahead offset
    this._fwd = new THREE.Vector3(1, 0, 0); // subject heading (for trailing cams)
    this._speed = 0;
    this._desired = new THREE.Vector3();
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._time = 0;
    this._cineTime = 0;
    this._dofFocus = 30;

    // Keyboard state for Free Explore fly.
    this._keys = new Set();
    this._onKeyDown = (e) => this._keys.add(e.code);
    this._onKeyUp = (e) => this._keys.delete(e.code);
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);

    // Mouse-wheel zoom for the fixed-camera modes (OrbitControls is off here, so
    // it handles its own wheel zoom only in Free Explore).
    this._onWheel = (e) => {
      if (this.mode === "spider") {
        e.preventDefault();
        this._spiderZoom = THREE.MathUtils.clamp(
          this._spiderZoom - Math.sign(e.deltaY) * 0.08,
          0,
          0.85,
        );
      } else if (this.mode === "broadcast") {
        e.preventDefault();
        this._broadcastZoom = THREE.MathUtils.clamp(
          this._broadcastZoom - Math.sign(e.deltaY) * 0.08,
          0,
          1,
        );
      }
    };
    this.controls.domElement.addEventListener("wheel", this._onWheel, {
      passive: false,
    });
  }

  setMode(mode) {
    this.mode = mode;
    const free = mode === "free";
    this.controls.enabled = free;
    // Restore the default lens whenever we leave Broadcast TV.
    if (mode !== "broadcast" && this.camera.fov !== this._baseFov) {
      this.camera.fov = this._baseFov;
      this.camera.updateProjectionMatrix();
    }
    if (free) {
      // Reconfigure OrbitControls for first-person look-around: allow the orbit
      // radius to shrink right down to the near pivot, and free up the pitch so
      // the user can look up and down (the orbit-style ground guard no longer
      // applies because the camera no longer orbits a distant point).
      this.controls.minDistance = 0.01;
      this.controls.minPolarAngle = 0.05; // just shy of straight up
      this.controls.maxPolarAngle = Math.PI - 0.05; // just shy of straight down
      this._pinTargetInFront(); // park the target a hair ahead of the camera
      this.controls.update();
    }
  }

  /** Keep the orbit target a tiny distance directly in front of the camera. */
  _pinTargetInFront() {
    const fwd = this.camera.getWorldDirection(this._v1);
    this.controls.target.copy(this.camera.position).addScaledVector(fwd, LOOK_DIST);
  }

  /**
   * Set the active subject. Pass null to fall back to the roaming drone.
   * @param {THREE.Object3D|null} object3d
   * @param {string} [type] "sprinter" | "jumper" | "football" | "drone"
   */
  setSubject(object3d, type) {
    this.subjectObject = object3d ?? this.drone;
    this.subjectType = object3d ? (type ?? this.subjectType) : "drone";
    this._prev.copy(this.subjectObject.position); // avoid a speed spike
    this._vel.set(0, 0, 0); // no stale velocity/lead from the previous subject
    this._smoothedLead.set(0, 0, 0);
  }

  /** Back-compat helpers. */
  setTarget(object3d) {
    this.setSubject(object3d);
  }
  setTracker(type) {
    this.subjectType = type;
  }
  get target() {
    return this.subjectObject === this.drone ? null : this.subjectObject;
  }

  update(delta) {
    const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), 0.1) : 0;
    this._time += dt;

    // Animate the roaming drone over the field (gentle Lissajous path).
    const t = this._time;
    this.drone.position.set(
      Math.sin(t * 0.12) * 45,
      18 + Math.sin(t * 0.2) * 4,
      Math.cos(t * 0.1) * 55,
    );

    if (this.mode === "free") {
      // ORDER MATTERS for the first-person trick:
      // 1) apply this frame's mouse-drag, which rotates the camera about the near
      //    pivot (look-around) since the target sits a hair in front of it;
      // 2) THEN translate with WASD, so the fly move is authoritative and is not
      //    rewritten by OrbitControls until next frame;
      // 3) re-pin the target just ahead of the new pose for the next drag;
      // 4) focus DoF well ahead, not on the 0.15 m pivot, so the scene stays sharp.
      this.controls.update();
      this._flyFree(dt);
      this._pinTargetInFront();
      this._updateDof(
        this._v2.copy(this.camera.position).addScaledVector(
          this.camera.getWorldDirection(this._v1),
          DOF_AHEAD,
        ),
      );
      return;
    }

    if (this.mode === "cinematic") {
      this._cineTime += dt;
      const ct = this._cineTime;
      const angle = ct * 0.15;
      // Elevated aerial sweep: higher altitude + a slightly tighter radius so the
      // camera looks cleanly DOWN onto the pitch as it orbits.
      const radius = 120 + 20 * Math.sin(ct * 0.1);
      const height = 80 + 16 * Math.sin(ct * 0.07);
      this.camera.position.set(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius,
      );
      // Aim low (pitch level) so the elevated camera is angled down and centred.
      this.camera.lookAt(0, 2, 0);
      this._updateDof(this._v1.set(0, 2, 0));
      return;
    }

    if (this.mode === "campus") {
      const kPos = 1 - Math.exp(-dt * 2.2);
      const kLook = 1 - Math.exp(-dt * 2.0);
      this.camera.position.lerp(CAMPUS_POS, kPos);
      this._focus.lerp(CAMPUS_TARGET, kLook);
      this.camera.lookAt(this._focus);
      this._updateDof(CAMPUS_TARGET);
      return;
    }

    const f = this.subjectObject.position;
    if (!Number.isFinite(f.x) || !Number.isFinite(f.y) || !Number.isFinite(f.z)) {
      this.controls.update();
      return;
    }

    // Subject velocity → speed (for the football zoom) and a look-ahead "lead"
    // point so tracking cams frame the space AHEAD of a moving athlete.
    //
    // The velocity is HEAVILY damped: we want the average forward trajectory,
    // not the frame-by-frame gait wiggle. A fast lerp here would amplify those
    // wiggles once the vector is normalised and scaled by the lead distance,
    // swinging the aim point (and the camera angle) left/right — "vector
    // amplification jitter".
    if (dt > 0) {
      this._v1.copy(f).sub(this._prev).multiplyScalar(1 / dt); // instant velocity
      this._vel.lerp(this._v1, Math.min(1, dt * 1.5)); // average trajectory only
      this._prev.copy(f);
    }
    this._speed = this._vel.length();

    // Raw look-ahead offset from the averaged heading...
    const hs = Math.hypot(this._vel.x, this._vel.z); // horizontal speed
    if (hs > 0.2) {
      const lead = Math.min(hs * 0.8, LEAD_MAX);
      this._v2.set((this._vel.x / hs) * lead, 0, (this._vel.z / hs) * lead);
    } else {
      this._v2.set(0, 0, 0); // no clear heading → no lead
    }
    // ...glided independently so the aim point never snaps sideways.
    this._smoothedLead.lerp(this._v2, Math.min(1, dt * 1.5));
    this._aim.copy(f).add(this._smoothedLead);

    // Heading for trailing cams: the (smoothed) velocity when clearly moving,
    // otherwise the subject's facing direction (the rig's local forward is +X).
    if (hs > 0.5) {
      this._fwd.set(this._vel.x, 0, this._vel.z).normalize();
    } else {
      this._fwd.set(1, 0, 0).applyQuaternion(this.subjectObject.quaternion);
      this._fwd.y = 0;
      if (this._fwd.lengthSq() < 1e-6) this._fwd.set(1, 0, 0);
      this._fwd.normalize();
    }

    
    const aim = this._aim;

    const kPos = 1 - Math.exp(-dt * (this.mode === "action" ? 4 : 2.5));
    // Slow, absorbing pan so any residual micro-movement is smoothed out.
    const kLook = 1 - Math.exp(-dt * (this.mode === "broadcast" ? 1.6 : 2.2));

    switch (this.mode) {
      case "broadcast": {
        this.camera.position.copy(BROADCAST_POS); // fixed gantry
        // Optical zoom: narrow the FOV toward telephoto.
        const fov = THREE.MathUtils.lerp(this._baseFov, 16, this._broadcastZoom);
        if (this.camera.fov !== fov) {
          this.camera.fov = fov;
          this.camera.updateProjectionMatrix();
        }
        break;
      }

      case "spider":
        // Trail behind the athlete (position uses f); the lookAt aims ahead.
        // Smoothly damp the position so a straight run stays drift-free.
        this._spiderDesired(f);
        this.camera.position.lerp(this._desired, 1 - Math.exp(-dt * 3));
        break;

      case "action":
      default:
        this._actionDesired(aim);
        this.camera.position.lerp(this._desired, kPos);
        break;
    }

    this._focus.lerp(aim, kLook);
    this.camera.lookAt(this._focus);
    this._updateDof(this._focus);
  }

  /**
   * Spider-cam: glide along the spline to the point above the (lead) aim.
   * @param {THREE.Vector3} f the subject's actual position.
   */
  _spiderDesired(f) {
    // Position BEHIND the athlete (along its heading) at the rig height. Paired
    // with the lookAt projected AHEAD, this tilts the camera forward so the
    // athlete sits low in frame and the track ahead stretches out.
    this._desired.set(
      f.x - this._fwd.x * SPIDER_TRAIL,
      SPIDER_HEIGHT,
      f.z - this._fwd.z * SPIDER_TRAIL,
    );

    // Wheel zoom: descend toward the athlete while keeping the trailing offset
    // (so zooming in deepens the forward tilt rather than going top-down).
    if (this._spiderZoom > 0) {
      this._v3.set(this._desired.x, f.y + 6, this._desired.z);
      this._desired.lerp(this._v3, this._spiderZoom);
    }
  }

  /**
   * Sport-specific Action Track shot, positioned relative to the (lead) aim
   * point so the camera leads a moving athlete.
   * @param {THREE.Vector3} f look-ahead aim point.
   */
  _actionDesired(f) {
    switch (this.subjectType) {
      case "jumper":
        // Side-profile from the stadium (+Z) side that captures the full flight
        // arc, looking across the pit toward the measurement board's lit face.
        this._desired.set(f.x, 2.6, f.z + 9);
        break;

      case "football": {
        // Ball-chase: pull back as the ball goes faster and/or higher.
        const zoom =
          1 +
          Math.min(2, this._speed / 6) +
          Math.min(1.5, Math.max(0, f.y - 0.4) / 2);
        this._desired.set(
          f.x + 2,
          3 + f.y * 0.5 + 3 * (zoom - 1),
          f.z - 9 * zoom,
        );
        break;
      }

      case "sprinter":
      case "runner":
        // Track-level rail dolly, sliding along X parallel to the athlete.
        this._desired.set(f.x + 2, 2.3, f.z - 7);
        break;

      default: // drone or unspecified
        this._desired.set(f.x + 4, f.y + 5, f.z - 12);
        break;
    }
  }

  /**
   * WASD/QE free-fly. W/S fly along the full look direction (so looking up and
   * pressing W ascends — "fly where you look"), D/A strafe horizontally, E/Q
   * rise/fall. Only the camera position is moved here; the look-around target is
   * re-pinned in front afterwards (see update()).
   */
  _flyFree(dt) {
    const k = this._keys;
    const fwd = (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0);
    const strafe = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0);
    const rise = (k.has("KeyE") ? 1 : 0) - (k.has("KeyQ") ? 1 : 0);
    if (!fwd && !strafe && !rise) return;

    // Full 3D look direction for forward/back.
    const look = this.camera.getWorldDirection(this._v1);
    // Strafe basis from the horizontal projection of the look (stays level and
    // avoids a degenerate cross product when looking straight up or down).
    const flat = this._v2.set(look.x, 0, look.z);
    if (flat.lengthSq() < 1e-6) flat.set(0, 0, -1);
    flat.normalize();
    const right = this._v3.crossVectors(flat, UP).normalize();

    const move = this._desired.set(0, 0, 0);
    move.addScaledVector(look, fwd);
    move.addScaledVector(right, strafe);
    move.addScaledVector(UP, rise);
    if (move.lengthSq() === 0) return;
    move.normalize().multiplyScalar(FLY_SPEED * dt);

    this.camera.position.add(move);
  }

  /** Drive the depth-of-field focus distance toward the look point. */
  _updateDof(point) {
    if (!this.bokehPass) return;
    const d = this.camera.position.distanceTo(point);
    this._dofFocus += (d - this._dofFocus) * 0.1; // smooth
    this.bokehPass.uniforms.focus.value = this._dofFocus;
  }

  dispose() {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    this.controls.domElement.removeEventListener("wheel", this._onWheel);
  }
}
