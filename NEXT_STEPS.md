# Next Steps

## Ordered Backlog

1. Browser-test the enriched Olympic Campus from Campus View.
2. Verify Broadcast and Free Explore camera modes still work.
3. Verify Sprint starts, runs, clears, and returns to a stable scene.
4. Verify Football starts, runs, clears, and returns to a stable scene.
5. Verify Long Jump starts, runs, clears, and returns to a stable scene.
6. Verify Ceremony starts without errors.
7. Inspect plaza and ground-mounted details for z-fighting.
8. Check day/night readability of flags, totems, and emissive placeholders.
9. Measure perceived FPS and reduce detail only if needed.
10. Plan future ceremony integration using `CeremonyExteriorAnchors`.

## Current Sprint

Exterior Olympic Campus polish and stabilization.

## Next Recommended Task

Run a browser visual and functional QA pass of the enriched campus, then fix only confirmed issues in `src/stadium/exteriorCampus.js`.

## Modules That Must Not Be Modified

- `src/events/`
- `src/athletes/`
- `src/core/`
- Renderer setup.
- Animation loop.
- Sports event lifecycle logic.
- Camera/event interaction logic unless explicitly approved.

# NEXT_STEPS.md

# Interactive Olympic Stadium Experience
## Next Steps & Sprint Control

Last updated: 2026-07-02
Current branch: `external-stadium-design`
Current phase: Exterior Olympic Campus polish and stabilization

---

# 1. Current Situation

The project now includes a visible Olympic Campus on the `+Z` side of the stadium.

Implemented and visible:

- Campus View camera mode.
- Main entrance plaza.
- Central ceremonial axis.
- Olympic rings on the plaza.
- Flag avenue.
- Trees and basic green areas.
- Totems and emissive placeholders.
- Opening ceremony still works.
- Sprint, Football and Long Jump currently work.

The exterior is now present and visually promising, but it is not final yet.
The campus still needs density, realism, lighting polish and ceremony integration.

---

# 2. Immediate QA Checklist

Before adding any new feature, verify the current stable state.

Run the project locally and check:

- [ ] Campus View starts correctly.
- [ ] Broadcast TV camera still works.
- [ ] Free Explore camera still works.
- [ ] Sprint starts, runs, clears and returns to a stable scene.
- [ ] Football starts, runs, clears and returns to a stable scene.
- [ ] Long Jump starts, runs, clears and returns to a stable scene.
- [ ] Ceremony starts without console errors.
- [ ] GUI controls still respond correctly.
- [ ] No severe FPS drop from Campus View.
- [ ] No visible z-fighting on plaza slabs, Olympic rings, decals or ground lights.
- [ ] No flashing surfaces when moving the camera.
- [ ] Day mode remains readable.
- [ ] Night mode is visually strong but not overexposed.

If any item fails, fix that specific issue before implementing new features.

---

# 3. Current Sprint

## Sprint Goal

Stabilize and polish the Olympic Campus without touching sports logic.

## Sprint Scope

Allowed modules:

- `src/stadium/exteriorCampus.js`
- `src/stadium/exterior.js` only for entrance/facade polish
- `src/lighting/lightingManager.js` only for controlled day/night tuning
- `src/ui/gui.js` only if a specific approved control is needed

Preferred module for the next work:

- `src/stadium/exteriorCampus.js`

---

# 4. Frozen Modules

Do not modify these modules unless explicitly approved:

- `src/events/`
- `src/athletes/`
- `src/core/`
- `src/core/loop.js`
- `src/core/renderer.js`
- `src/stadium/config.js`
- `src/cameras/director.js` unless camera work is explicitly requested
- sports event lifecycle logic
- animation loop
- renderer setup

Any change touching these files must be justified before implementation.

---

# 5. Ordered Backlog

## Priority 1 — Stabilization

1. Browser-test the enriched Olympic Campus from Campus View.
2. Verify all camera modes still work.
3. Verify all sports events still work.
4. Verify Ceremony starts and stops without errors.
5. Inspect all new plaza and ground details for z-fighting.
6. Check FPS and reduce object density only if needed.

## Priority 2 — Campus Realism

7. Add more structured green areas.
8. Add denser tree rows and hedges around the plaza.
9. Add flower beds and lawn zones.
10. Add more realistic flag composition.
11. Add better plaza pavement variation.
12. Add sidewalks and secondary pedestrian paths.

## Priority 3 — Urban Context

13. Add road/drop-off area outside the ceremonial plaza.
14. Add lateral parking area.
15. Add cars, buses or taxis using simple optimized static geometry.
16. Add curbs, road markings and pedestrian crossings.
17. Add perimeter fence and gates.

## Priority 4 — Lighting Polish

18. Reduce excessive bloom if night mode becomes overexposed.
19. Add controlled exterior emissive details.
20. Improve entrance lighting readability.
21. Prepare lamp posts and ground lights for future ceremony logic.
22. Keep real lights limited and performance-safe.

## Priority 5 — Opening Ceremony Exterior Integration

23. Use `CeremonyExteriorAnchors` for future exterior effects.
24. Add searchlight bases.
25. Add fireworks launch points.
26. Add exterior LED strips and plaza ceremony zones.
27. Add a future ceremony camera path from exterior to interior.
28. Integrate exterior effects into the ceremony only after the campus is stable.

---

# 6. Next Recommended Task

Run a full visual and functional QA pass.

If the project is stable, the next implementation task should be:

## Add road/drop-off and structured green areas

Target file:

- `src/stadium/exteriorCampus.js`

Implementation constraints:

- static geometry only
- no `update()`
- no new event logic
- no new animation loop
- no sports changes
- use shared materials
- use `InstancedMesh` for repeated objects

---

# 7. Commit Rules

Before every commit:

- [ ] Run the local app.
- [ ] Check the browser console.
- [ ] Test Campus View.
- [ ] Test at least Sprint, Football, Long Jump and Ceremony startup.
- [ ] Run `git status`.
- [ ] Confirm no unexpected files are modified.
- [ ] Confirm `AGENTS.md` remains local-only if it is excluded from Git.

Suggested commit message for the current campus work:

```text
feat: add rich Olympic campus exterior
```

---

# 8. Notes For Codex / AI Agents

Before implementing any future task:

1. Read `AGENTS.md`.
2. Read this file.
3. Explain the implementation plan.
4. List files to be modified.
5. Wait for approval.
6. Implement only the approved scope.
7. Provide a test checklist.
8. Update this file if priorities or project status change.

Never add visual complexity at the expense of broken sports events.