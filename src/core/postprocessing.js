import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/**
 * Post-processing chain (CLAUDE.md §3, optional — used for the ceremony glow).
 *
 *   RenderPass → UnrealBloomPass → OutputPass
 *
 * RenderPass draws into a linear HDR target (the renderer only tone-maps/encodes
 * when drawing to the canvas, never to a render target), bloom is computed in
 * linear space, and OutputPass applies ACES tone mapping + sRGB at the end — so
 * with bloom strength 0 the image matches the plain renderer exactly.
 *
 * Bloom starts OFF; the ceremony tweens `bloomPass.strength` up for the show.
 *
 * @returns {{ composer: EffectComposer, bloomPass: UnrealBloomPass,
 *             render: () => void, dispose: () => void }}
 */
export function createPostProcessing(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  composer.setSize(window.innerWidth, window.innerHeight);

  composer.addPass(new RenderPass(scene, camera));

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
    render: () => composer.render(),
    dispose: () => {
      window.removeEventListener("resize", onResize);
      composer.dispose?.();
    },
  };
}
