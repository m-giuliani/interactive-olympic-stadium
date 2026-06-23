# 🏟️ Interactive Olympic Stadium Experience

An interactive **3D night-time Olympic stadium** built with **[Three.js](https://threejs.org/)**.
Explore a floodlit stadium, start a sprint race driven by a fully articulated
athlete, and trigger a dazzling opening ceremony with dynamic lights, glowing
LEDs, and bloom.

Built as a final project for the **Interactive Graphics** course
(Sapienza University of Rome).

---

## 🔗 Live Demo

> ### 👉 **[VIEW THE LIVE DEMO](https://REPLACE-ME.github.io/REPLACE-REPO/)** 👈
>
> _Replace the link above with your GitHub Pages URL once deployed_
> _(typically `https://<your-username>.github.io/<your-repo>/`)._

---

## ✨ Features

- **Hierarchical articulated athlete** — a parent/child joint skeleton (pelvis →
  torso → limbs, with shoulder→elbow→wrist and hip→knee→ankle chains) animated
  entirely by **hand-written joint rotations**, no imported animation clips.
- **Sprint event** — a full state machine (`on your marks → set → GO → run →
  finish → celebrate`) with a procedural running gait.
- **Opening ceremony** — dynamic colored sweeping beams, an animated emissive LED
  ribbon, an **UnrealBloom** glow pass, and a cinematic aerial camera.
- **To-scale stadium** — an IAAF 400 m track (8 lanes), football pitch, raked
  seating bowl, and four floodlight towers.
- **Full lighting rig** — hemisphere night fill, a shadow-casting "moon"
  directional light, and four floodlights with real-time shadows.
- **Procedural textures** — pitch markings, lane lines, seating, and a **normal
  map** for the track surface, all generated on a `<canvas>` (zero binary assets).
- **Multiple cameras** — free OrbitControls, a trackside follow cam, and the
  cinematic ceremony sweep.
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
| Orbit / zoom / pan | Mouse drag + scroll (OrbitControls) |
| Start the sprint | GUI → **Sprint event → ▶ Start race** |
| Reset the athlete | GUI → **Sprint event → ↺ Reset** |
| Opening ceremony | GUI → **Ceremony → ✨ Opening ceremony** |
| Follow the runner | GUI → **Camera → Follow runner** |
| Tune lighting | GUI → **Lighting** sliders |

---

## 🗂️ Project Structure

```
src/
  core/        # renderer, scene, camera, animation loop, resize, post-processing
  stadium/     # track, field, stands, floodlight towers, LED ribbon, config
  athletes/    # hierarchical athlete model + hand-written joint poses
  events/      # sprint event + ceremony state machines
  lighting/    # ambient, moon, floodlights
  cameras/     # orbit / follow / cinematic camera rig
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
