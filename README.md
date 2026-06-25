# 🏟️ Interactive Olympic Stadium Experience

An interactive **3D Olympic stadium** built with **[Three.js](https://threejs.org/)**,
inspired by Rome's **Stadio Olimpico** — a floodlit bowl with an undulating
tensile roof, wrapped in a dusk-lit park and a distant city skyline. Explore the
stadium, start a sprint race driven by a fully articulated athlete, and trigger a
dazzling opening ceremony with dynamic lights, glowing LEDs, and bloom.

Built as a final project for the **Interactive Graphics** course
(Sapienza University of Rome).

---

## 🔗 Live Demo

> ### 👉 **[VIEW THE LIVE DEMO](https://m-giuliani.github.io/interactive-olympic-stadium/)** 👈
>
> _Served from GitHub Pages on the `main` branch (root). If the link 404s, enable
> Pages under **Settings → Pages** (see [Deploying](#-deploying-to-github-pages))._

---

## ✨ Features

- **Hierarchical articulated athlete** — a parent/child joint skeleton (pelvis →
  torso → limbs, with shoulder→elbow→wrist and hip→knee→ankle chains) animated
  entirely by **hand-written joint rotations**, no imported animation clips.
- **Sprint event** — a full state machine (`on your marks → set → GO → run →
  finish → celebrate`) with a procedural running gait.
- **Opening ceremony** — dynamic colored sweeping beams, an animated emissive LED
  ribbon, a synchronized roof LED chase wave, an **UnrealBloom** glow pass, and a
  cinematic aerial camera.
- **To-scale stadium** — an IAAF 400 m track (8 lanes), football pitch, raked
  seating bowl, and a concrete exterior facade with a pillar colonnade.
- **Stadio Olimpico tensile roof** — a scalloped, sine-displaced white membrane
  over a zig-zag steel truss, with an integrated **8-fixture LED floodlight
  matrix** on the inner rim (all procedural geometry, no models).
- **Procedural environment** — a gradient dusk sky, a park of instanced
  pine/cypress trees, and a distant instanced city skyline, built entirely from
  Three.js primitives (no models, no image textures).
- **Full lighting rig** — hemisphere fill, a shadow-casting "moon" directional
  light, and eight roof-mounted LED floodlights aimed at the pitch with real-time
  shadows.
- **Procedural textures** — pitch markings, lane lines, seating, and a **normal
  map** for the track surface, all generated on a `<canvas>` (zero binary assets).
- **Multiple cameras** — a Director rig (broadcast, spider-cam, action, free
  explore) plus the cinematic ceremony sweep.
- **Interactive GUI** (lil-gui) — start/reset the race, toggle the ceremony,
  switch cameras, and tune the lighting live.

---

## 🚀 Running Locally

This project uses **no build step** — Three.js, tween.js, OrbitControls, and
lil-gui are loaded as ES modules from a CDN via an import map. What runs locally
is byte-for-byte what runs on GitHub Pages.

> ⚠️ You **cannot** open `index.html` by double-clicking it. ES modules and
> textures are blocked by the browser over `file://`, so the page will be blank.
> You must serve the folder over `http://`.

### With Python (recommended)

```bash
# from the project root
python3 -m http.server 8000
```

Then open **<http://localhost:8000>** in your browser.

### Alternative (Node)

```bash
npx serve .
```

---

## 🎮 Controls

| Action | How |
|--------|-----|
| Orbit / zoom / pan | Mouse drag + scroll (Free Explore) |
| Fly the camera | `W A S D` move + `Q E` up/down (Free Explore) |
| Switch camera | GUI → **Director → Mode** (broadcast / spider / action / free) |
| Start the sprint | GUI → **Sprint event → ▶ Start race** |
| Reset the athlete | GUI → **Sprint event → ↺ Reset** |
| Long jump / Football | GUI → **Long jump** / **Football** |
| Opening ceremony | GUI → **Ceremony → ✨ Opening ceremony** |
| Toggle trees / skyline / fog | GUI → **Environment** |

---

## 🗂️ Project Structure

```
src/
  core/        # renderer, scene, camera, animation loop, resize, post-processing
  stadium/     # track, field, stands, apron, exterior (facade + pillars), tensile
               #   roof (membrane + truss + LED matrix), LED ribbon, goal,
               #   long-jump pit, environment, config
  athletes/    # hierarchical athlete model + hand-written joint poses
  events/      # sprint / long jump / football + ceremony state machines
  lighting/    # hemisphere fill, moon, roof-mounted LED floodlights
  cameras/     # Director rig: broadcast / spider / action / free / cinematic
  ui/          # lil-gui setup
  utils/       # geometry + procedural texture helpers
index.html     # entry point + import map
```

---

## 🛠️ Tech Stack

- **[Three.js](https://threejs.org/)** — rendering
- **[tween.js](https://github.com/tweenjs/tween.js)** — smooth transitions
- **OrbitControls**, **EffectComposer + UnrealBloomPass** — Three.js addons
- **[lil-gui](https://lil-gui.georgealways.com/)** — controls

---

## 🌐 Deploying to GitHub Pages

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source = Deploy from a branch**, then
   choose the `main` branch and the `/ (root)` folder.
4. Save, wait a minute, then copy the published URL into the **Live Demo**
   section above.
