# Project State

Last updated: 2026-07-02

## Current Architecture

- Vanilla JavaScript ES modules with Three.js.
- Single scene, single renderer, single animation loop, single clock.
- Stadium composition is assembled through `src/stadium/stadium.js`.
- Stadium building modules remain under `src/stadium/`.
- Exterior Olympic Park content is isolated in `src/stadium/exteriorCampus.js`.
- Camera orchestration is handled by `src/cameras/director.js`.
- GUI controls are handled by `src/ui/gui.js`.
- Sports events remain isolated under `src/events/`.
- Athlete logic remains isolated under `src/athletes/`.

## Completed Features

- Core Olympic stadium shell.
- Exterior stadium facade and entrance readability pass.
- Static Olympic Campus module on the +Z hero side.
- Campus camera/director preset for initial exterior view.
- Rich static campus foreground:
  - Monumental entrance plaza.
  - Double Olympic flag avenue.
  - Paving bands, pedestrian axis, curbs, steps, ramps.
  - Olympic-style ground rings.
  - Organized tree rows, lawns, hedges, bushes, and flower beds.
  - Benches, bollards, barriers, signs, bins, and bike racks.
  - Static emissive placeholders for future exterior ceremony lighting.
  - `CeremonyExteriorAnchors` group for future ceremony integration.

## Current Project Completion

Estimated completion: 70%.

This estimate reflects a functional stadium experience with sports events, cameras, GUI, lighting, and a visible exterior campus, but still requiring visual QA, final optimization, report polish, and deployment checks.

## Frozen Modules

Do not modify during exterior/campus recovery unless explicitly approved:

- `src/events/`
- `src/athletes/`
- `src/core/`
- Renderer setup.
- Animation loop.
- Existing sports event lifecycle logic.
- Existing camera modes except approved director presets.

## Active Modules

- `src/stadium/exteriorCampus.js`
- `src/stadium/exterior.js`
- `src/stadium/stadium.js`
- `src/cameras/director.js`
- `src/ui/gui.js`

## Known Issues

- Full browser visual QA is still required after the latest campus enrichment.
- Z-fighting must be checked visually on thin plaza surfaces, Olympic ground rings, and ground-light placeholders.
- Day/night readability of emissive placeholders must be verified in-browser.
- Performance must be verified from Campus View and Free Explore after the added instanced detail.
- Worktree contains several uncommitted earlier approved changes related to exterior, campus integration, camera, and GUI.

## Current Priorities

1. Verify campus visibility and visual quality in browser.
2. Confirm sports event start/clear flows still work.
3. Check FPS and draw-call impact of the enriched campus.
4. Fix only confirmed visual regressions.
5. Keep exterior campus static until ceremony integration is explicitly approved.

# PROJECT_STATE.md

# Interactive Olympic Stadium Experience
## Current Project State & Repository Memory

Last updated: 2026-07-02
Current branch: `external-stadium-design`
Current phase: Exterior Olympic Campus polish and stabilization
Estimated completion: 70%

---

# 1. Current Summary

The project is a vanilla JavaScript ES Modules application built with Three.js.

The current experience includes a complete Olympic stadium with sports events, GUI controls, camera modes, lighting systems and a newly visible exterior Olympic Campus on the `+Z` hero side of the stadium.

The latest major work introduced a richer static campus foreground with:

- Campus View camera mode.
- Main entrance plaza.
- Central ceremonial axis.
- Olympic-style ground rings.
- Double Olympic flag avenue.
- Trees, lawns, hedges, bushes and flower beds.
- Totems and emissive lighting placeholders.
- Static public furniture.
- Ceremony exterior anchor points.

The campus is now visible and promising, but it still requires visual QA, realism polish, performance verification and future ceremony integration.

---

# 2. Current Architecture

## Core Architecture

- Vanilla JavaScript ES Modules.
- Three.js rendering engine.
- Single `THREE.Scene`.
- Single renderer.
- Single animation loop.
- Single clock.
- No framework.
- No build system.
- GitHub Pages compatible.

## Main Composition

The app is bootstrapped from:

- `src/main.js`

The stadium is assembled through:

- `src/stadium/stadium.js`

The stadium group currently contains:

- field
- track
- finish line
- apron
- stands
- exterior facade
- exterior Olympic Campus
- roof

The exterior campus is isolated in:

- `src/stadium/exteriorCampus.js`

This separation is intentional:

- `exterior.js` = stadium building facade / entrance shell
- `exteriorCampus.js` = Olympic Park outside the stadium
- `environment.js` = sky, stars, ground and environmental background

---

# 3. Main Systems

## Rendering

Managed by:

- `src/core/renderer.js`
- `src/core/loop.js`
- `src/core/postprocessing.js`
- `src/core/resize.js`

Current rules:

- Do not create another renderer.
- Do not create another animation loop.
- Do not modify renderer/core unless explicitly approved.

## Stadium

Managed by:

- `src/stadium/stadium.js`
- `src/stadium/field.js`
- `src/stadium/track.js`
- `src/stadium/stands.js`
- `src/stadium/exterior.js`
- `src/stadium/exteriorCampus.js`
- `src/stadium/roof.js`

## Cameras

Managed by:

- `src/core/camera.js`
- `src/cameras/director.js`

Current camera modes include:

- Campus View
- Broadcast TV
- Spider-cam
- Action Track
- Free Explore

Campus View is now the startup view and frames the `+Z` Olympic Campus.

## GUI

Managed by:

- `src/ui/gui.js`

GUI currently exposes camera and event controls.

## Sports Events

Managed by:

- `src/events/eventManager.js`
- `src/events/sprint.js`
- `src/events/football.js`
- `src/events/longJump.js`
- `src/events/ceremony.js`

Sports currently work and must be treated as stable systems.

## Athletes

Managed by:

- `src/athletes/`

Athletes use procedural / hand-written animation logic.

---

# 4. Completed Features

## Stadium

- Core Olympic stadium shell.
- Football field.
- Athletics track.
- Grandstands.
- Roof.
- Exterior facade.
- Entrance readability pass.

## Campus

- Static Olympic Campus module on the `+Z` side.
- MainEntrancePlaza.
- CeremonyAxis.
- OlympicFlagAvenue.
- TreeGrovesInstanced.
- OlympicTotemsInstanced.
- GreenPark / basic landscaping.
- Plaza paving bands.
- Curbs, steps and ramps.
- Olympic ground rings.
- Public furniture.
- Lighting-ready emissive placeholders.
- `CeremonyExteriorAnchors` group for future ceremony work.

## Cameras

- Campus View mode added.
- Startup camera now points to the exterior campus.
- Existing sports cameras preserved.

## Events

- Sprint works.
- Football works.
- Long Jump works.
- Ceremony works.

## Development Workflow

- `AGENTS.md` updated with non-regression rules, merge policy, AI implementation workflow, performance safety rules and recovery policy.
- `NEXT_STEPS.md` created/updated as the current sprint control document.

---

# 5. Current Worktree Notes

The current branch contains several approved uncommitted changes related to:

- exterior facade visibility
- new exterior campus module
- stadium integration
- Campus View camera mode
- GUI camera dropdown
- startup camera mode

Expected modified/new files before the next commit:

- `src/stadium/exteriorCampus.js`
- `src/stadium/stadium.js`
- `src/stadium/exterior.js`
- `src/cameras/director.js`
- `src/ui/gui.js`
- `src/main.js`

Suggested commit message:

```text
feat: add rich Olympic campus exterior
```

Do not commit additional unrelated files.

---

# 6. Frozen Modules

The following modules must not be modified during exterior/campus polish unless explicitly approved:

- `src/events/`
- `src/athletes/`
- `src/core/`
- `src/core/loop.js`
- `src/core/renderer.js`
- `src/stadium/config.js`
- renderer setup
- animation loop
- sports event lifecycle logic

These modules are considered stable.

Any future change touching them must be justified before implementation.

---

# 7. Active Modules

The currently active modules for exterior/campus work are:

- `src/stadium/exteriorCampus.js`
- `src/stadium/exterior.js`
- `src/stadium/stadium.js`
- `src/cameras/director.js` only for approved camera work
- `src/ui/gui.js` only for approved GUI controls
- `src/lighting/lightingManager.js` only for approved lighting polish

Preferred active module for the next visual iteration:

- `src/stadium/exteriorCampus.js`

---

# 8. Known Issues / Open Checks

The latest campus enrichment has been visually inspected and is promising, but the following checks remain open:

- Full browser QA after the latest enrichment.
- FPS check from Campus View and Free Explore.
- Z-fighting check on:
  - plaza paving slabs
  - Olympic ground rings
  - ground-light placeholders
  - thin emissive strips
- Day/night readability check.
- Bloom intensity check, especially in Night mode.
- Ceremony exterior integration is not implemented yet.
- Roads, parking and broader urban context are still missing.
- The exterior is visually better but still around mid-stage polish, not final quality.

---

# 9. Current Priorities

## Priority 1 — Stabilization

1. Verify Campus View after clearing browser cache.
2. Verify all sports events still start and clear correctly.
3. Check browser console for errors.
4. Check for severe FPS drops.
5. Commit the current stable campus work.

## Priority 2 — Campus Completion

1. Add structured road/drop-off zone.
2. Add lateral parking.
3. Add denser green areas.
4. Add more realistic landscaping and pedestrian paths.
5. Add perimeter fencing and gates.
6. Add additional wayfinding signs and Olympic infrastructure.

## Priority 3 — Lighting Polish

1. Reduce excessive bloom if needed.
2. Improve night readability.
3. Add controlled exterior lighting placeholders or limited real lights.
4. Ensure night mode looks cinematic but not overexposed.

## Priority 4 — Opening Ceremony Exterior Integration

1. Use `CeremonyExteriorAnchors`.
2. Add searchlight bases.
3. Add fireworks launch positions.
4. Add future exterior LED behavior.
5. Add exterior-to-interior ceremony camera path.
6. Integrate exterior ceremony effects only after campus stability is confirmed.

---

# 10. Next Recommended Task

Before implementing anything else:

1. Run the project locally.
2. Test Campus View.
3. Test Sprint, Football, Long Jump and Ceremony startup.
4. Check console errors.
5. Commit the current work if stable.

After commit, the next development task should be:

## Add road/drop-off and structured green areas

Target file:

- `src/stadium/exteriorCampus.js`

Scope:

- static geometry only
- no `update()`
- no event changes
- no athlete changes
- no core renderer changes
- no animation loop changes
- use shared materials
- use `InstancedMesh` for repeated elements

---

# 11. Notes For Future Codex Sessions

Before making changes, Codex must:

1. Read `AGENTS.md`.
2. Read `NEXT_STEPS.md`.
3. Read this file.
4. Explain the implementation plan.
5. List the exact files to modify.
6. Wait for approval.
7. Modify only approved files.
8. Provide a test checklist.
9. Update project documentation if the project state changes.

Never trade working sports events for visual improvements.

Never overwrite another contributor's work without comparison.

Never copy old files blindly into the current codebase.