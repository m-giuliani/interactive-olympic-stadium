import * as THREE from "three";

// Sun/moon intensities for the two states. The same DirectionalLight plays both
// roles: a bright warm "sun" high in the sky by day, a dim cool "moon" low on
// the horizon by night.
const DAY_SUN_INTENSITY = 2.5;
const NIGHT_MOON_INTENSITY = 0.2;
const DAY_SUN_COLOR = 0xfff5e8; // warm daylight white
const NIGHT_MOON_COLOR = 0xaecbff; // cool moonlight (matches lighting.js default)

// Where the DirectionalLight sits in each state: overhead for the sun, low and
// off to one side for the moon.
const DAY_SUN_POSITION = new THREE.Vector3(-150, 120, 50);
const NIGHT_MOON_POSITION = new THREE.Vector3(-100, 50, -100);

// Hemisphere fill so a bright day doesn't leave the shadows reading like night.
const DAY_HEMI_INTENSITY = 0.8;
const NIGHT_HEMI_INTENSITY = 0.2;

// Fallback scene.background behind the procedural sky dome (which actually
// carries the look). Day = blue, night = near-black so nothing flashes.
const DAY_SKY_COLOR = 0x87ceeb; // sky blue
const NIGHT_SKY_COLOR = 0x05080f; // matches the night sky dome zenith

/**
 * Central Lighting Controller.
 *
 * Owns the mutually-exclusive Day/Night state of the rig. By day the sun blazes
 * and the 8 roof floodlights (plus their emissive enclosures) are off; by night
 * the sun dims to moonlight and the floodlights blaze. This is an instant
 * boolean switch — no interpolation (deliberately, see CLAUDE.md / task scope).
 *
 * Captured baselines: each floodlight's authored intensity is treated as its
 * "stadium max", and the roof-LED material's authored emissiveIntensity as its
 * lit level, so we never hardcode magic numbers that can drift from the rig.
 *
 * @param {ReturnType<typeof import("./lighting.js").createLighting>} lighting
 *        the rig: { hemisphere, moon, floodlights }.
 * @param {THREE.InstancedMesh} roofLeds the emissive roof-fixture matrix
 *        (shares one MeshStandardMaterial across all instances).
 * @param {THREE.Scene} [scene] optional — if given, its background colour is
 *        swapped to match the Day/Night state.
 * @param {ReturnType<typeof import("../stadium/environment.js").createEnvironment>} [environment]
 *        optional — if given, its sky dome / sun / moon / stars are switched too.
 */
export class LightingManager {
  constructor(lighting, roofLeds, scene, environment) {
    this.moon = lighting.moon;
    this.hemisphere = lighting.hemisphere;
    this.floodlights = lighting.floodlights;
    this.roofLeds = roofLeds ?? null;
    this.roofLedMaterial = roofLeds ? roofLeds.material : null;
    this.scene = scene ?? null;
    this.environment = environment ?? null;

    // Treat the authored values as the "on" maxima so the manager stays in sync
    // with whatever the rig/roof modules declare.
    this.floodMax = this.floodlights.map((s) => s.intensity);
    this.ledMaxEmissive = this.roofLedMaterial
      ? this.roofLedMaterial.emissiveIntensity
      : 5.0;

    // The scene ships at dusk/night, so start there.
    this.isDay = false;
    this.toggleDayNight(false);
  }

  /**
   * Enforce the Day or Night lighting state.
   * @param {boolean} isDay true → daytime sun on / floods off; false → reverse.
   */
  toggleDayNight(isDay) {
    this.isDay = isDay;

    // --- Sun / Moon (the single DirectionalLight) ----------------------------
    this.moon.intensity = isDay ? DAY_SUN_INTENSITY : NIGHT_MOON_INTENSITY;
    this.moon.color.set(isDay ? DAY_SUN_COLOR : NIGHT_MOON_COLOR);
    this.moon.position.copy(isDay ? DAY_SUN_POSITION : NIGHT_MOON_POSITION);

    // --- Ambient fill --------------------------------------------------------
    this.hemisphere.intensity = isDay
      ? DAY_HEMI_INTENSITY
      : NIGHT_HEMI_INTENSITY;

    // --- 8 roof floodlights (mutually exclusive with the sun) ----------------
    this.floodlights.forEach((spot, i) => {
      spot.intensity = isDay ? 0 : this.floodMax[i];
    });

    // --- Emissive roof fixtures must match the physical floodlights ----------
    if (this.roofLedMaterial) {
      this.roofLedMaterial.emissiveIntensity = isDay ? 0 : this.ledMaxEmissive;
    }

    // --- Sky atmosphere ------------------------------------------------------
    // Fallback background behind the dome, then swap the dome + celestial bodies.
    if (this.scene?.background?.isColor) {
      this.scene.background.set(isDay ? DAY_SKY_COLOR : NIGHT_SKY_COLOR);
    }
    if (this.environment) {
      this.environment.setDayNight(isDay);
    }
  }

  /** Flip to the opposite state and return the new value. */
  toggle() {
    this.toggleDayNight(!this.isDay);
    return this.isDay;
  }
}
