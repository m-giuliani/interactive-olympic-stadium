/**
 * Keeps the camera aspect ratio and renderer size in sync with the window.
 *
 * Returns an unsubscribe function so teardown can remove the listener.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.PerspectiveCamera} camera
 * @returns {() => void} unsubscribe.
 */
export function handleResize(renderer, camera) {
  const onResize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
  };

  window.addEventListener("resize", onResize);
  return () => window.removeEventListener("resize", onResize);
}
