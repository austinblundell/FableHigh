// Real NBA dimensions, in meters.
export const COURT = {
  LENGTH: 28.65,          // 94 ft
  WIDTH: 15.24,           // 50 ft
  HALF_L: 14.325,
  HALF_W: 7.62,
  RIM_HEIGHT: 3.048,      // 10 ft
  RIM_RADIUS: 0.2286,     // 18 in diameter
  RIM_TUBE: 0.021,
  RIM_X: 12.725,          // rim center distance from mid court
  BOARD_X: 13.105,        // backboard face plane
  BOARD_WIDTH: 1.829,     // 6 ft
  BOARD_HEIGHT: 1.067,    // 3.5 ft
  BOARD_BOTTOM: 2.9,
  THREE_R: 7.24,          // arc three
  THREE_CORNER: 6.71,     // corner three
  KEY_WIDTH: 4.88,        // 16 ft
  KEY_LENGTH: 5.79,       // 19 ft from baseline
  FT_CIRCLE_R: 1.83,
  CENTER_CIRCLE_R: 1.83,
};

export const BALL_RADIUS = 0.121;
export const GRAVITY = -9.81;

export const RULES = {
  SHOT_CLOCK: 24,
  SHOT_CLOCK_ORB: 14,     // after offensive rebound
  QUARTERS: 4,
  OT_SECONDS: 60,
};

export const TEAMS = [
  {
    name: 'LOS ANGELES', short: 'LAG', nickname: 'GOLD',
    jersey: 0x552583, trim: 0xfdb927, accent: '#fdb927',
    css: '#552583',
  },
  {
    name: 'BOSTON', short: 'BOS', nickname: 'CLOVERS',
    jersey: 0x007a33, trim: 0xffffff, accent: '#ffffff',
    css: '#007a33',
  },
];

// Attacking direction on X for each team. Home (0) attacks +X.
export const attackDir = (team) => (team === 0 ? 1 : -1);

export const ROSTER = [
  // pos, height (m), speed, shooting skill (0..1)
  { pos: 'PG', h: 1.88, speed: 6.6, skill: 0.82 },
  { pos: 'SG', h: 1.96, speed: 6.3, skill: 0.86 },
  { pos: 'SF', h: 2.01, speed: 6.1, skill: 0.78 },
  { pos: 'PF', h: 2.06, speed: 5.8, skill: 0.68 },
  { pos: 'C',  h: 2.11, speed: 5.5, skill: 0.58 },
];

export const PLAYER_NAMES = [
  ['J. RIVERS', 'M. COLE', 'D. VANCE', 'T. OKAFOR', 'B. STONE'],
  ['A. WALSH', 'K. BRYCE', 'L. MONROE', 'S. DUBOIS', 'V. KOVAC'],
];

// Offensive spacing spots relative to the attacked rim.
// dx = distance back from rim toward half court, z = lateral.
export const OFFENSE_SPOTS = [
  { dx: 8.6, z: 0.0 },    // PG top
  { dx: 6.2, z: 5.2 },    // SG wing
  { dx: 6.2, z: -5.2 },   // SF wing
  { dx: 1.2, z: 6.5 },    // PF corner
  { dx: 1.6, z: -2.6 },   // C low post
];
