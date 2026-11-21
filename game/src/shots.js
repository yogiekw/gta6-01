// The screenshot scenes behind ?shot=start|play|chase|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered by
// a simple autopilot (walk/drive toward the mission target, get in the nearest
// car when one is close), so the frame is what a short game really looks like
// and the same seed always gives the same frame.
import { STEP } from './config.js';
import { STREETS } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 24;
const CHASE_SECONDS = 10;
const END_SECONDS = 110;

function snapStreet(v) {
  let best = STREETS[0];
  for (const s of STREETS) if (Math.abs(s - v) < Math.abs(best - v)) best = s;
  return best;
}

// An axis-aligned route along the streets: current intersection, then along
// one street to the target's street, then along that street to the target.
// Driving straight at a target cuts across building blocks and gets stuck.
function routeTo(state, tx, tz) {
  const p = state.player;
  return [
    { x: snapStreet(p.x), z: snapStreet(p.z) },
    { x: snapStreet(tx), z: snapStreet(p.z) },
    { x: snapStreet(tx), z: snapStreet(tz) },
    { x: tx, z: tz },
  ];
}

// Steer the player toward (tx, tz). Returns { move, actions } for world.step.
// `arriveAt` is the distance that counts as arrived: 6 m for a street leg,
// 3 m when walking up to a car (the enter key only reaches 4.5 m).
function driveToward(state, tx, tz, arriveAt) {
  const p = state.player;
  const dx = tx - p.x;
  const dz = tz - p.z;
  const d = Math.hypot(dx, dz);
  if (d < (arriveAt || 6)) return { move: { x: 0, y: 0 }, actions: 0, arrived: true };
  const want = Math.atan2(dx, dz);
  let diff = want - p.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  // On foot the camera yaw is the steering reference; keep it behind the player.
  state.cameraYaw = p.angle;
  const steer = Math.max(-1, Math.min(1, diff * 1.6));
  // Brake for sharp turns and for the final approach: a car at full speed
  // overshoots street corners and wedges itself against buildings. The turn
  // rate is capped, so the throttle must fall as the steering angle grows —
  // at 17 m/s the car circles a close waypoint faster than its bearing to it
  // can catch up, and it chases its own tail forever. The turn rule applies
  // at every distance: a U-turn to a waypoint 8 m behind needs 4 m/s, not 17.
  let throttle = d < 15 ? 0.15 : 1;
  throttle = Math.min(throttle, Math.max(0.12, 1 - Math.abs(diff) * 0.45));
  return { move: { x: -steer, y: throttle }, actions: 0, arrived: false };
}

function stepAutopilot(world, seconds, targetOf) {
  const steps = Math.floor(seconds / STEP);
  let route = null;
  let routeTarget = null;
  let stuckSteps = 0;
  let reversing = 0;
  for (let i = 0; i < steps; i += 1) {
    const state = world.state;
    if (state.over) break;
    const target = targetOf(state);
    let input = { move: { x: 0, y: 0 }, handbrake: false, run: true, mouse: { x: 0, y: 0 } };
    let actions = 0;
    if (target) {
      // Rebuild the street route when the destination changes, or when the
      // route ran out while the player is still far from the target (a fast
      // approach can overshoot the last leg — the car must turn around and
      // come back, not sit still). The route is a sequence: the next leg
      // being far away is normal, not stale — an earlier "stale" check
      // rebuilt the route mid-drive and the autopilot circled its first leg.
      const key = `${target.x},${target.z}`;
      const farFromTarget = Math.hypot(state.player.x - target.x, state.player.z - target.z) > 6;
      if (key !== routeTarget || (route && route.length === 0 && farFromTarget)) {
        route = routeTo(state, target.x, target.z);
        routeTarget = key;
      }
      if (state.player.inCar === null) {
        // Get in the nearest civil car if one is close, else walk to the target.
        // (Police cars are never entered by the autopilot.)
        let nearest = null;
        let nearestD = 1e9;
        for (const car of state.cars) {
          if (car.disabled || car.kind !== 'civil') continue;
          const d = Math.hypot(car.x - state.player.x, car.z - state.player.z);
          if (d < nearestD) {
            nearestD = d;
            nearest = car;
          }
        }
        if (nearest && nearestD < 4.5) {
          actions = 4; // ACTION_ENTER
        } else if (nearest && nearestD < 25) {
          const leg = driveToward(state, nearest.x, nearest.z, 3);
          input = leg;
        } else {
          const leg = route && route.length ? driveToward(state, route[0].x, route[0].z) : { arrived: true };
          if (leg.arrived && route) route.shift();
          input = leg;
        }
      } else {
        // Driving: follow the street route, one leg at a time. If wedged
        // against a building, reverse briefly, then carry on. But never
        // "un-stick" a car that already arrived: a parked car at its
        // destination has speed 0 by design, and reversing out of it would
        // break the safehouse lay-low (which needs 5 still seconds).
        const speed = Math.abs(state.player.speed || 0);
        const nearTarget = target && Math.hypot(state.player.x - target.x, state.player.z - target.z) < 12;
        if (reversing > 0) {
          reversing -= 1;
          input = { move: { x: 0, y: -1 }, handbrake: false, run: false, mouse: { x: 0, y: 0 } };
        } else {
          if (speed < 1.5 && !nearTarget) stuckSteps += 1;
          else stuckSteps = 0;
          if (stuckSteps > 150) {
            stuckSteps = 0;
            reversing = 50;
            input = { move: { x: 0, y: -1 }, handbrake: false, run: false, mouse: { x: 0, y: 0 } };
          } else {
            const leg = route && route.length
              ? driveToward(state, route[0].x, route[0].z)
              : { move: { x: 0, y: 0 }, actions: 0, arrived: true };
            if (leg.arrived && route) route.shift();
            input = leg;
          }
        }
      }
    }
    world.step(STEP, input, actions);
  }
}

// Set `world` to the named scene and return the screen to draw over it.
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name !== 'play' && name !== 'chase' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, { move: { x: 0, y: 0 }, handbrake: false, run: false, mouse: { x: 0, y: 0 } }, 0);
    }
    return { screen: SCREEN_TITLE, overReason: '' };
  }
  if (name === 'play') {
    stepAutopilot(world, PLAY_SECONDS, (s) => s.mission.target);
    return { screen: SCREEN_PLAY, overReason: '' };
  }
  if (name === 'chase') {
    // Mission 1 in full swing: two stars, police on the tail, Rook driving.
    world.startMission(1);
    stepAutopilot(world, CHASE_SECONDS, (s) => s.mission.target);
    return { screen: SCREEN_PLAY, overReason: '' };
  }
  // End: finish the story fast — autopilot through mission 1's safehouse, then
  // the drops, then the pier — and show the free-roam city after the score.
  stepAutopilot(world, 30, (s) => s.mission.target);
  if (world.state.mission.index === 1) {
    // The pursuit pinned Rook short of the safehouse: slip the tail here
    // (the tail cars lose the trail, the heat dies) and lay low at the
    // safehouse itself.
    for (const car of world.state.cars) if (car.kind === 'police') car.disabled = true;
    world.state.wanted = 0;
    world.state.wantedQuiet = 0;
    // Move the car too when Rook is driving — the player's position is synced
    // from the car every step, so moving only the player would be undone.
    const pc = world.state.cars.find((c) => c.id === world.state.player.inCar);
    if (pc) {
      pc.x = -144;
      pc.z = 144;
      pc.speed = 0;
    }
    world.state.player.x = -144;
    world.state.player.z = 144;
    stepAutopilot(world, 8, (s) => s.mission.target);
  }
  if (world.state.mission.index === 2) {
    // A new job, a fresh start: Rook catches his breath before the big score.
    world.state.health = 100;
    for (const car of world.state.cars) if (car.kind === 'police') car.disabled = true;
  }
  stepAutopilot(world, END_SECONDS, (s) => (s.mission.index === 2
    ? (s.mission.dropsLeft > 0 ? s.drops.find((d) => !d.taken) : s.mission.target)
    : s.mission.target));
  const over = world.state.over;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, overReason: world.state.overReason };
}
