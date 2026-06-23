import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/**
 * Post-processing chain (CLAUDE.md §3, optional):
 *
 *   RenderPass → BokehPass (DoF) → UnrealBloomPass → OutputPass
 *
 * RenderPass draws into a linear HDR target (the renderer only tone-maps/encodes
 * when drawing to the canvas, never to a render target). A subtle depth-of-field
 * (BokehPass) blurs the distant stands to focus the eye on the action; the
 * Director updates its focus distance each frame. Bloom is computed in linear
 * space for the LED glow, and OutputPass applies ACES tone mapping + sRGB at the
 * end — so with bloom strength 0 the image matches the plain renderer.
 *
 * Bloom starts OFF; the ceremony tweens `bloomPass.strength` up for the show.
 *
 * @returns {{ composer: EffectComposer, bloomPass: UnrealBloomPass,
 *             bokehPass: BokehPass, render: () => void, dispose: () => void }}
 */
export function createPostProcessing(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(window.innerWidth, window.innerHeight);

  composer.addPass(new RenderPass(scene, camera));

  // Very subtle depth-of-field: the subject (at the focus distance) stays sharp,
  // and only far background elements blur slightly. focus (world units) is
  // driven each frame by the Director.
  const bokehPass = new BokehPass(scene, camera, {
    focus: 30,
    aperture: 0.00003, // much smaller → deep focus, gentle far blur only
    maxblur: 0.004,
  });
  composer.addPass(bokehPass);

  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.0, // strength — off until the ceremony raises it
    0.6, // radius
    0.85, // threshold — only bright/emissive pixels bloom
  );
  composer.addPass(bloomPass);

  composer.addPass(new OutputPass());

  const onResize = () => {
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    composer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", onResize);

  return {
    composer,
    bloomPass,
    bokehPass,
    render: () => composer.render(),
    dispose: () => {
      window.removeEventListener("resize", onResize);
      composer.dispose?.();
    },
  };
}
