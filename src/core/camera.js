import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

/**
 * Creates the default perspective camera plus OrbitControls (CLAUDE.md §3).
 *
 * World scale is 1 unit = 1 metre (CLAUDE.md §6), so the far plane is generous
 * enough to see the whole ~100 m track and surrounding stands. The camera
 * starts at a three-quarter vantage looking down at the infield.
 *
 * Later event cameras (broadcast / tracking / cinematic) live in src/cameras/;
 * this is just the free-look default the user always has access to.
 *
 * @param {HTMLElement} domElement the renderer canvas (controls attach here).
 * @returns {{ camera: THREE.PerspectiveCamera, controls: OrbitControls }}
 */
export function createCamera(domElement) {
  const camera = new THREE.PerspectiveCamera(
    50, // vertical FOV in degrees
    window.innerWidth / window.innerHeight,
    0.1, // near
    1000, // far — comfortably covers the stadium in metres
  );
  // Start close to the runner's start line, side-on from the infield, so the
  // joint animation is easy to judge. The sprint lane is at z ~ 40.8 and the
  // start is near x ~ -40; sit on the infield (smaller z) looking at it.
  camera.position.set(-34, 9, 16);

  const controls = new OrbitControls(camera, domElement);
  controls.target.set(-36, 1.2, 41); // the athlete at the blocks
  controls.enableDamping = true; // smooth, weighty feel
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI * 0.495; // don't let the user go below ground
  controls.minDistance = 5;
  controls.maxDistance = 350;

  // Full free movement in "Free Explore" mode: right-click/drag (or arrow keys)
  // pans the focus point anywhere in the stadium — no central fulcrum.
  controls.enablePan = true;
  controls.screenSpacePanning = true; // pan in the screen plane, feels natural
  controls.panSpeed = 1.2;
  controls.keyPanSpeed = 12;
  controls.listenToKeyEvents(window); // arrow keys move the focus
  controls.update();

  return { camera, controls };
}
