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
export const BOWL_BASE_HEIGHT = 1;
export const BOWL_TOP_HEIGHT = 28;

// Floodlighting is integrated into the tensile roof (see stadium/roof.js): the
// SpotLight mount points are the roof's inner-rim corners, not standalone towers.

// --- Long jump facility ------------------------------------------------------
// Sits on the apron (the BOWL_GAP ring) along the +Z straight, just outside the
// track. Oriented along +X: run-up, takeoff board, then the sand pit. The 5 m
// gap comfortably fits the 1.4 m runway and 3 m pit (centred in the ring).
export const LJ_Z = TRACK_OUTER_RADIUS + BOWL_GAP / 2; // ≈ 48.76
export const LJ_RUNWAY_START_X = -20;
export const LJ_BOARD_X = 4;
export const LJ_PIT_START_X = 6;
export const LJ_PIT_END_X = 20;
export const LJ_RUNWAY_WIDTH = 1.4;
export const LJ_PIT_WIDTH = 3.0;

// --- Football exhibition -----------------------------------------------------
// On the −X half of the pitch (the long jump is on +X). The footballer faces −X
// and shoots into the goal standing on the −X goal line.
export const FB_Z = 0;
export const FB_GOAL_X = -50; // goal line
export const FB_GOAL_WIDTH = 7.32; // regulation
export const FB_GOAL_HEIGHT = 2.44;
export const FB_GOAL_DEPTH = 2;
export const FB_BALL_START_X = -30;
export const FB_PLAYER_START_X = -23;
export const BALL_RADIUS = 0.12;

// Resolution for sampling each semicircular arc of the discorectangle.
export const ARC_SEGMENTS = 80;
