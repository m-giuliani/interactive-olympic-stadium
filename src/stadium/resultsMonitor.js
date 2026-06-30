import * as THREE from "three";

/**
 * Free-standing results monitor for the long jump — a procedural scoreboard built
 * entirely from primitives (a post + a casing box + a flat screen plane), with the
 * distance drawn onto a <canvas> used as both colour map and emissiveMap so it
 * glows under the night lighting and blooms like the LED ribbon (CLAUDE.md §5 —
 * no image assets). The athlete walks up to read the value off this screen.
 *
 * The screen faces −Z (toward the infield broadcast camera). `viewSpot` is the
 * world position a metre or two in front of the screen where the athlete stands
 * to read it; the event walks the athlete there and faces them back at the panel.
 *
 * The value shown is driven by setResult(distance, valid), called from the event
 * with the SAME `this.distance` the jump already computed — nothing is recomputed.
 */
export class ResultsMonitor {
  /**
   * @param {{ position?: THREE.Vector3, viewDistance?: number, lookAt?: THREE.Vector3 }} [opts]
   *   position     — world placement of the cabinet.
   *   viewDistance — how far in front of the screen the athlete stands to read it.
   *   lookAt       — world point the SCREEN is angled toward (e.g. a point up the
   *                  long-jump runway). If omitted the screen faces −Z. A plane's
   *                  normal is +Z in local space; rotating the cabinet by
   *                  atan2(nx, nz) aims that normal along the (nx,nz) direction.
   */
  constructor({
    position = new THREE.Vector3(0, 0, 0),
    viewDistance = 2.4,
    lookAt = null,
  } = {}) {
    this.group = new THREE.Group();
    this.group.name = "ResultsMonitor";
    this.position = position.clone();
    this._disposables = [];

    if (lookAt) {
      this.lookYaw = Math.atan2(lookAt.x - position.x, lookAt.z - position.z);
    } else {
      this.lookYaw = Math.PI; // default: face −Z
    }
    this.group.position.copy(this.position);
    this.group.rotation.y = this.lookYaw;

    // World spot the athlete stands on to read the screen: out along the screen
    // normal (which, after the yaw, points toward lookAt) by viewDistance.
    const fwd = new THREE.Vector3(Math.sin(this.lookYaw), 0, Math.cos(this.lookYaw));
    this.viewSpot = this.position.clone().addScaledVector(fwd, viewDistance);

    this._build();
    this.clear();
  }

  _mat(color, opts = {}) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts });
    this._disposables.push(m);
    return m;
  }

  _box(w, h, d, material, x, y, z) {
    const geo = new THREE.BoxGeometry(w, h, d);
    this._disposables.push(geo);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    this.group.add(mesh);
    return mesh;
  }

  _build() {
    const dark = this._mat(0x20262e, { roughness: 0.5, metalness: 0.3 });

    // Base, support post and the cabinet that frames the screen.
    this._box(0.9, 0.08, 0.6, dark, 0, 0.04, 0); // foot
    this._box(0.14, 1.45, 0.14, dark, 0, 0.77, 0); // post
    const SCREEN_Y = 2.0;
    this._box(1.9, 1.15, 0.14, dark, 0, SCREEN_Y, 0); // cabinet/bezel

    // The live screen: a canvas drawn with the result, used as colour + emissive
    // so it reads as a lit LED panel.
    this.canvas = document.createElement("canvas");
    this.canvas.width = 1024;
    this.canvas.height = 576;
    this.ctx = this.canvas.getContext("2d");
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this._disposables.push(this.texture);

    const screenMat = new THREE.MeshStandardMaterial({
      map: this.texture,
      emissiveMap: this.texture,
      emissive: 0xffffff,
      emissiveIntensity: 0.9,
      roughness: 0.4,
    });
    this._disposables.push(screenMat);

    const screenGeo = new THREE.PlaneGeometry(1.7, 0.96);
    this._disposables.push(screenGeo);
    const screen = new THREE.Mesh(screenGeo, screenMat);
    // 8 cm proud of the cabinet's +Z face (its front, since the group is yawed).
    screen.position.set(0, SCREEN_Y, 0.08);
    this.group.add(screen);
  }

  /** Repaint the canvas with a big distance and a VALID/FOUL status line. */
  _draw(distanceText, statusText, statusOk) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.fillStyle = "#05070d"; // deep panel background
    ctx.fillRect(0, 0, w, h);

    // Header band.
    ctx.fillStyle = "#0c3f73";
    ctx.fillRect(0, 0, w, h * 0.24);
    ctx.fillStyle = "#dfe9ff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.round(h * 0.13)}px Arial, sans-serif`;
    ctx.fillText("LONG JUMP — RESULT", w / 2, h * 0.12);

    // Big distance readout (LED green).
    ctx.fillStyle = "#9bf5a4";
    ctx.font = `bold ${Math.round(h * 0.4)}px Arial, sans-serif`;
    ctx.fillText(distanceText, w / 2, h * 0.55);

    // Status line.
    ctx.fillStyle = statusOk ? "#6fd66f" : "#e07070";
    ctx.font = `bold ${Math.round(h * 0.12)}px Arial, sans-serif`;
    ctx.fillText(statusText, w / 2, h * 0.85);

    this.texture.needsUpdate = true;
  }

  /**
   * Show the result for a jump. Reads the distance the event already computed.
   * @param {number} distanceMeters the jump distance (this.distance from the event)
   * @param {boolean} [valid=true]   foul flag (the event has no foul rule today,
   *                                  but the panel supports it for completeness)
   */
  setResult(distanceMeters, valid = true) {
    this._draw(distanceMeters.toFixed(2) + " m", valid ? "VALID" : "FOUL", valid);
  }

  /** Blank "ready" state, shown between competitions / on reset. */
  clear() {
    this._draw("--.-- m", "READY", true);
  }

  /** Subtle idle so the panel feels live (gentle emissive breathing). */
  update(dt) {
    this._t = (this._t ?? 0) + dt;
  }

  dispose() {
    this._disposables.forEach((d) => d.dispose());
  }
}
