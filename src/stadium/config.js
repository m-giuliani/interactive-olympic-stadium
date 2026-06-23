/**
 * Shared stadium dimensions (CLAUDE.md §6: 1 unit = 1 metre).
 *
 * These numbers are based on a real IAAF 400 m running track so the geometry is
 * to scale. Both the stadium geometry modules and the lighting rig import this
 * file so they always agree on where things are.
 *
 * Track model: a "discorectangle" (two straights joined by two semicircles).
 *   - straight length            = 84.39 m  (half = STRAIGHT_HALF)
 *   - semicircle inner radius    = 36.50 m  (TRACK_INNER_RADIUS)
 *   - 8 lanes × 1.22 m           = 9.76 m   (TRACK_WIDTH)
 */

// --- Running track -----------------------------------------------------------
export const STRAIGHT_HALF = 84.39 / 2; // 42.195 m
export const LANE_COUNT = 8;
export const LANE_WIDTH = 1.22;
export const TRACK_INNER_RADIUS = 36.5;
export const TRACK_WIDTH = LANE_COUNT * LANE_WIDTH; // 9.76 m
export const TRACK_OUTER_RADIUS = TRACK_INNER_RADIUS + TRACK_WIDTH; // 46.26 m

// Heights (kept tiny so layers don't z-fight).
export const INFIELD_Y = 0.0;
export const TRACK_Y = 0.02;
export const PITCH_Y = 0.03;

// --- Football pitch ----------------------------------------------------------
export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;

// --- Seating bowl ------------------------------------------------------------
export const BOWL_GAP = 5; // flat apron between track and the first row
export const BOWL_BOTTOM_RADIUS = TRACK_OUTER_RADIUS + BOWL_GAP; // ~51.26 m
export const BOWL_DEPTH = 45; // horizontal run of the raked seating
export const BOWL_TOP_RADIUS = BOWL_BOTTOM_RADIUS + BOWL_DEPTH; // ~96.26 m
export const BOWL_BASE_HEIGHT = 1.5;
export const BOWL_TOP_HEIGHT = 28;

// --- Floodlight towers -------------------------------------------------------
// Placed in the four corner gaps just outside the seating bowl. Positions are
// in the XZ plane; the lighting rig puts a SpotLight at HEAD_HEIGHT above each.
export const TOWER_HEAD_HEIGHT = 48;
export const TOWERS = [
  { x: 110, z: 85 },
  { x: -110, z: 85 },
  { x: 110, z: -85 },
  { x: -110, z: -85 },
];

// Resolution for sampling each semicircular arc of the discorectangle.
export const ARC_SEGMENTS = 80;
