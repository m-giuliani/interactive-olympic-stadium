import * as THREE from "three";

const DEFAULT_UV = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
const WHITE = [1, 1, 1];

/**
 * A tiny accumulator that the seating-bowl generators push quads into, then bake
 * once into a single merged BufferGeometry (one draw call per builder).
 *
 * Optional per-vertex `uv` and `color` channels are enabled per-builder so each
 * mesh only carries the attributes it needs.
 */
export class MeshBuilder {
  constructor({ uv = false, color = false } = {}) {
    this._pos = [];
    this._idx = [];
    this._uv = uv ? [] : null;
    this._col = color ? [] : null;
  }

  /**
   * Append a quad (two triangles) p0→p1→p2→p3.
   * @param {THREE.Vector3} p0
   * @param {THREE.Vector3} p1
   * @param {THREE.Vector3} p2
   * @param {THREE.Vector3} p3
   * @param {{ uv?: number[][], color?: number[] }} [attrs] per-corner UVs (4×[u,v])
   *        and a single [r,g,b] applied to all four corners.
   */
  addQuad(p0, p1, p2, p3, { uv = null, color = null } = {}) {
    const base = this._pos.length / 3;
    for (const p of [p0, p1, p2, p3]) this._pos.push(p.x, p.y, p.z);
    this._idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    if (this._uv) {
      const u = uv ?? DEFAULT_UV;
      for (const c of u) this._uv.push(c[0], c[1]);
    }
    if (this._col) {
      const c = color ?? WHITE;
      for (let i = 0; i < 4; i++) this._col.push(c[0], c[1], c[2]);
    }
  }

  get isEmpty() {
    return this._idx.length === 0;
  }

  /** Bake into an indexed BufferGeometry with computed normals. */
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this._pos, 3));
    if (this._uv) g.setAttribute("uv", new THREE.Float32BufferAttribute(this._uv, 2));
    if (this._col)
      g.setAttribute("color", new THREE.Float32BufferAttribute(this._col, 3));
    g.setIndex(this._idx);
    g.computeVertexNormals();
    return g;
  }
}
