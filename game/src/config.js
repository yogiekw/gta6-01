// Port Meridian — every tuning number in one place.
// The city is a fixed-size grid, so no rule below depends on the window size.

export const STEP = 1 / 60;

export const CITY = {
  blocks: 8, // blocks per side (grid of streets between them)
  block: 34, // building block side, in metres
  road: 14, // street width, in metres
  // Total span = blocks * (block + road) + road
};

export const PLAYER = {
  walkSpeed: 9,
  runSpeed: 14,
  radius: 0.7,
  health: 100,
};

export const CAR = {
  accel: 22,
  brake: 34,
  reverseAccel: 12,
  maxSpeed: 34,
  maxReverse: 10,
  steer: 1.9,
  handbrake: 0.92,
  radius: 1.6,
};

export const TRAFFIC_CARS = 12;
export const PEDESTRIANS = 20;
export const POLICE_MAX = 4;

export const WANTED = {
  decaySeconds: 18, // quiet seconds (no police near) before one star drops
  ramDamage: 4, // health lost per ram hit while a police car is grinding into you
  ramCooldown: 1.0, // seconds between ram hits from the same police car
};

export const MISSIONS = [
  { id: 0, name: 'First Job', reward: 500, deliverSeconds: 120 },
  { id: 1, name: 'Hot Pursuit', reward: 800 },
  { id: 2, name: 'The Big Score', reward: 2000, drops: 5 },
];

export const PALETTE = {
  skyTop: 0x3f8fd2,
  skyBottom: 0xbfd9ea,
  sun: 0xfff2c8,
  sea: 0x1d7fa8,
  sand: 0xe8d29a,
  asphalt: 0x3a3f46,
  sidewalk: 0x9aa0a8,
  grass: 0x5da24a,
  building: [0xd8b48a, 0xb8c4cc, 0xe0a080, 0x9fb8a0, 0xc9b8d8, 0xe8d8a0, 0x8fb8c9, 0xd89090],
  palm: 0x3f7d3a,
  trunk: 0x8a6b4a,
};

export const SAVE_KEY = 'port-meridian.save.v1';
export const DEFAULT_SEED = 1;
