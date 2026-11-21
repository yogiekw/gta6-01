// Port Meridian's world: pure logic, no rendering. The city, the player on foot
// and in a car, traffic, pedestrians, police, the wanted level, shooting and the
// mission clock all live here and advance in fixed steps.
import { CAR, CITY, PEDESTRIANS, PLAYER, POLICE_MAX, TRAFFIC_CARS, WANTED } from './config.js';
import { pick, range } from './random.js';
import { startMission, stepMission } from './missions.js';

export const EVENT_PICKUP = 1;
export const EVENT_DELIVERED = 2;
export const EVENT_SAFE = 4;
export const EVENT_DROP = 8;
export const EVENT_COMPLETE = 16;
export const EVENT_FAILED = 32;
export const EVENT_OVER = 64;
export const EVENT_SHOT = 128;
export const EVENT_CRASH = 256;
export const EVENT_WANTED = 512;

// Street centre lines, in metres. Blocks sit between neighbouring streets.
export const STREETS = [-192, -144, -96, -48, 0, 48, 96, 144, 192];
export const CITY_HALF = 199;
const PALM_COLORS = [0x3f7d3a, 0x4a8a42, 0x35702f];
const CAR_COLORS = [0xc23b3b, 0x3b6fc2, 0xe0c040, 0x40b060, 0xd8d8d8, 0x30343a, 0xc2703b, 0x7a4fc2];

function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

// Circle (player / car) against a building box: push the circle out.
function collideBuildings(x, z, radius, buildings) {
  for (let i = 0; i < buildings.length; i += 1) {
    const b = buildings[i];
    const cx = Math.max(b.x - b.w / 2, Math.min(x, b.x + b.w / 2));
    const cz = Math.max(b.z - b.d / 2, Math.min(z, b.z + b.d / 2));
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * radius;
        z = cz + (dz / d) * radius;
      } else {
        x = b.x + b.w / 2 + radius;
      }
      return { x, z, hit: true };
    }
  }
  return { x, z, hit: false };
}

export function createWorld(rng) {
  const state = {
    time: 0,
    clockMinutes: 9 * 60 + 12, // the story opens at 09:12 on a bright morning
    money: 0,
    health: PLAYER.health,
    wanted: 0,
    wantedQuiet: 0,
    crimeCooldown: 0,
    seed: 0,
    player: { x: 0, z: 48, angle: 0, speed: 0, inCar: null },
    cameraYaw: 0,
    cameraPitch: 0.32,
    cars: [],
    peds: [],
    buildings: [],
    trees: [],
    lamps: [],
    parks: [],
    drops: [],
    tracers: [],
    mission: { index: -1, stage: 0, timer: 0, dropsLeft: 0, target: null, text: '', failed: false, done: false },
    stats: { carsStolen: 0, shotsFired: 0, policeDown: 0 },
    over: false,
    overReason: '',
  };

  function buildCity() {
    state.buildings = [];
    state.trees = [];
    state.lamps = [];
    state.parks = [];
    for (let bi = 0; bi < CITY.blocks; bi += 1) {
      for (let bj = 0; bj < CITY.blocks; bj += 1) {
        const x0 = STREETS[bi] + 7;
        const z0 = STREETS[bj] + 7;
        const roll = rng();
        if (roll < 0.12) {
          // A pocket park: grass, palms, no buildings.
          state.parks.push({ x: x0 + 17, z: z0 + 17, w: 34, d: 34 });
          for (let t = 0; t < 5; t += 1) {
            state.trees.push({ x: x0 + 4 + rng() * 26, z: z0 + 4 + rng() * 26, color: pick(rng, PALM_COLORS), h: range(rng, 4, 7) });
          }
          continue;
        }
        const count = 1 + Math.floor(rng() * 3);
        for (let k = 0; k < count; k += 1) {
          const w = range(rng, 9, 15);
          const d = range(rng, 9, 15);
          const x = x0 + w / 2 + rng() * (34 - w);
          const z = z0 + d / 2 + rng() * (34 - d);
          state.buildings.push({
            x, z, w, d,
            h: range(rng, 8, 42),
            color: pick(rng, [0xd8b48a, 0xb8c4cc, 0xe0a080, 0x9fb8a0, 0xc9b8d8, 0xe8d8a0, 0x8fb8c9, 0xd89090]),
            roof: rng() < 0.3,
          });
        }
      }
    }
    // Palms along the beach and a few street lamps on the main avenues.
    for (let z = -180; z <= 180; z += 24) {
      state.trees.push({ x: -206 + rng() * 4, z: z + rng() * 8, color: pick(rng, PALM_COLORS), h: range(rng, 5, 8) });
    }
    for (let i = 0; i < STREETS.length; i += 1) {
      for (let z = -168; z <= 168; z += 48) {
        state.lamps.push({ x: STREETS[i] + 6.2, z });
      }
    }
  }

  function spawnTraffic() {
    state.cars = [];
    for (let i = 0; i < TRAFFIC_CARS; i += 1) {
      const bi = Math.floor(rng() * CITY.blocks);
      const bj = Math.floor(rng() * CITY.blocks);
      // A rectangular loop around one block, on the streets that border it.
      const loop = [
        { x: STREETS[bi] - 3.5, z: STREETS[bj] - 3.5 },
        { x: STREETS[bi + 1] + 3.5, z: STREETS[bj] - 3.5 },
        { x: STREETS[bi + 1] + 3.5, z: STREETS[bj + 1] + 3.5 },
        { x: STREETS[bi] - 3.5, z: STREETS[bj + 1] + 3.5 },
      ];
      const w = loop[Math.floor(rng() * 4)];
      state.cars.push({
        id: i, kind: 'civil', x: w.x, z: w.z, angle: rng() * Math.PI * 2,
        speed: range(rng, 7, 11), hp: 100, color: pick(rng, CAR_COLORS),
        loop, waypoint: Math.floor(rng() * 4), playerDriven: false, disabled: false,
      });
    }
    // Rook's own starter car, parked on the street where the story opens.
    state.cars.push({
      id: 100, kind: 'civil', x: 8, z: 48, angle: Math.PI / 2, speed: 0, hp: 100,
      color: 0x2f7fc2, loop: null, waypoint: 0, playerDriven: false, disabled: false, starter: true,
    });
  }

  function spawnPeds() {
    state.peds = [];
    for (let i = 0; i < PEDESTRIANS; i += 1) {
      const bi = Math.floor(rng() * CITY.blocks);
      const bj = Math.floor(rng() * CITY.blocks);
      const loop = [
        { x: STREETS[bi] + 8, z: STREETS[bj] + 8 },
        { x: STREETS[bi + 1] - 8, z: STREETS[bj] + 8 },
        { x: STREETS[bi + 1] - 8, z: STREETS[bj + 1] - 8 },
        { x: STREETS[bi] + 8, z: STREETS[bj + 1] - 8 },
      ];
      const w = loop[Math.floor(rng() * 4)];
      state.peds.push({
        x: w.x, z: w.z, angle: rng() * Math.PI * 2, speed: range(rng, 1.2, 2.2),
        loop, waypoint: Math.floor(rng() * 4),
        shirt: pick(rng, [0xe05a5a, 0x5a9ae0, 0x7ac25a, 0xe0c95a, 0xc25ad8, 0x5ad8c2]),
        skin: pick(rng, [0xe8b98a, 0xc98a5a, 0x8a5a30, 0xf0c8a0]),
      });
    }
  }

  function placeDrops() {
    const spots = [
      { x: -144, z: -144 }, { x: 144, z: -96 }, { x: 48, z: 144 },
      { x: -48, z: 96 }, { x: 144, z: 48 },
    ];
    state.drops = spots.map((s) => ({ ...s, taken: false }));
  }

  function reset() {
    state.time = 0;
    state.clockMinutes = 9 * 60 + 12;
    state.money = 0;
    state.health = PLAYER.health;
    state.wanted = 0;
    state.wantedQuiet = 0;
    state.crimeCooldown = 0;
    state.player = { x: 0, z: 48, angle: 0, speed: 0, inCar: null };
    state.cameraYaw = 0;
    state.cameraPitch = 0.32;
    state.tracers = [];
    state.stats = { carsStolen: 0, shotsFired: 0, policeDown: 0 };
    state.over = false;
    state.overReason = '';
    buildCity();
    spawnTraffic();
    spawnPeds();
    placeDrops();
    startMission(state, 0);
  }

  function nearestCar(x, z, maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const car of state.cars) {
      if (car.disabled) continue;
      const d = dist2(x, z, car.x, car.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function addWanted(stars) {
    if (state.wanted < stars) {
      state.wanted = stars;
      state.wantedQuiet = 0;
      return true;
    }
    state.wantedQuiet = 0;
    return false;
  }

  function spawnPolice() {
    const want = Math.min(state.wanted + 1, POLICE_MAX);
    const have = state.cars.filter((c) => c.kind === 'police' && !c.disabled).length;
    for (let i = have; i < want; i += 1) {
      const a = rng() * Math.PI * 2;
      const x = Math.max(-185, Math.min(185, state.player.x + Math.cos(a) * 70));
      const z = Math.max(-185, Math.min(185, state.player.z + Math.sin(a) * 70));
      state.cars.push({
        id: 200 + Math.floor(state.time * 60) + i, kind: 'police', x, z,
        angle: 0, speed: 0, hp: 100, color: 0x1c1e24,
        loop: null, waypoint: 0, playerDriven: false, disabled: false,
      });
    }
  }

  function driveCar(car, dt, throttle, steer, handbrake) {
    const maxF = car.kind === 'police' ? 38 : CAR.maxSpeed;
    // Throttle picks a target speed and the car accelerates toward it, so a
    // gentle throttle (a turn, an approach) really does slow the car down.
    // Before the fix a small positive throttle still accelerated to full
    // speed, and the autopilot circled its waypoints forever.
    if (throttle < 0 && car.speed > 0.5) {
      car.speed -= CAR.brake * dt; // braking, not reversing yet
    } else if (throttle !== 0) {
      const target = throttle > 0 ? throttle * maxF : throttle * CAR.maxReverse;
      const change = target - car.speed;
      const step = CAR.accel * dt;
      car.speed += Math.max(-step, Math.min(step, change));
    } else {
      car.speed -= Math.sign(car.speed) * 6 * dt;
      if (Math.abs(car.speed) < 0.3) car.speed = 0;
    }
    if (handbrake) car.speed *= Math.pow(CAR.handbrake, dt * 60);
    if (car.speed > maxF) car.speed = maxF;
    if (car.speed < -CAR.maxReverse) car.speed = -CAR.maxReverse;
    // Full steering authority arrives at 6 m/s, not 10: at a crawl the car
    // must still turn sharply enough to U-turn in a 14 m street.
    const steerAmount = steer * CAR.steer * Math.min(1, Math.abs(car.speed) / 6) * Math.sign(car.speed || 1);
    car.angle -= steerAmount * dt;
    car.x += Math.sin(car.angle) * car.speed * dt;
    car.z += Math.cos(car.angle) * car.speed * dt;
    // Stay inside the drivable area (city + beach).
    car.x = Math.max(-225, Math.min(205, car.x));
    car.z = Math.max(-205, Math.min(205, car.z));
    const hit = collideBuildings(car.x, car.z, CAR.radius, state.buildings);
    if (hit.hit) {
      const crashed = Math.abs(car.speed) > 12;
      car.x = hit.x;
      car.z = hit.z;
      car.speed *= 0.4;
      if (crashed) return true;
    }
    return false;
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.playerDriven || car.kind === 'police' || !car.loop || car.disabled) continue;
      const target = car.loop[car.waypoint];
      const dx = target.x - car.x;
      const dz = target.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d < 3) {
        car.waypoint = (car.waypoint + 1) % car.loop.length;
        continue;
      }
      const want = Math.atan2(dx, dz);
      let diff = want - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.angle += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
      const targetSpeed = Math.abs(diff) > 0.6 ? 4 : 10;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.5);
      car.x += Math.sin(car.angle) * car.speed * dt;
      car.z += Math.cos(car.angle) * car.speed * dt;
    }
    // Keep traffic from stacking on the same spot.
    for (let i = 0; i < state.cars.length; i += 1) {
      for (let j = i + 1; j < state.cars.length; j += 1) {
        const a = state.cars[i];
        const b = state.cars[j];
        if (a.playerDriven || b.playerDriven) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < 9 && d2 > 0.001) {
          const d = Math.sqrt(d2);
          const push = (3 - d) / 2;
          a.x -= (dx / d) * push;
          a.z -= (dz / d) * push;
          b.x += (dx / d) * push;
          b.z += (dz / d) * push;
        }
      }
    }
  }

  function stepPeds(dt) {
    for (const ped of state.peds) {
      const target = ped.loop[ped.waypoint];
      const dx = target.x - ped.x;
      const dz = target.z - ped.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) {
        ped.waypoint = (ped.waypoint + 1) % ped.loop.length;
        continue;
      }
      ped.angle = Math.atan2(dx, dz);
      ped.x += Math.sin(ped.angle) * ped.speed * dt;
      ped.z += Math.cos(ped.angle) * ped.speed * dt;
    }
  }

  function stepPolice(dt) {
    if (state.wanted > 0) spawnPolice();
    let nearest = Infinity;
    for (const car of state.cars) {
      if (car.kind !== 'police' || car.disabled) continue;
      const dx = state.player.x - car.x;
      const dz = state.player.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d < nearest) nearest = d;
      const want = Math.atan2(dx, dz);
      let diff = want - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
      const targetSpeed = d > 6 ? 36 : 18; // a touch faster than Rook's car: they gain on a straight, so the player must turn and lose them
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 2);
      car.x += Math.sin(car.angle) * car.speed * dt;
      car.z += Math.cos(car.angle) * car.speed * dt;
      const hit = collideBuildings(car.x, car.z, CAR.radius, state.buildings);
      if (hit.hit) {
        car.x = hit.x;
        car.z = hit.z;
        car.speed *= 0.5;
      }
      // Ramming the player hurts — but one hit per second per car, so a
      // pinned player still has time to break away.
      if (d < 3.4 && state.time - (car.lastRam || 0) >= WANTED.ramCooldown) {
        car.lastRam = state.time;
        state.health -= WANTED.ramDamage;
        if (state.player.inCar !== null) {
          const pc = state.cars.find((c) => c.id === state.player.inCar);
          if (pc) {
            pc.x += Math.sin(car.angle) * 2.4 * dt;
            pc.z += Math.cos(car.angle) * 2.4 * dt;
          }
        }
      }
    }
    return nearest;
  }

  function shoot() {
    const p = state.player;
    state.stats.shotsFired += 1;
    const from = { x: p.x, y: 1.5, z: p.z };
    const dirX = Math.sin(state.cameraYaw);
    const dirZ = Math.cos(state.cameraYaw);
    let best = null;
    let bestD = 70;
    for (const car of state.cars) {
      if (car.kind !== 'police' || car.disabled) continue;
      const dx = car.x - p.x;
      const dz = car.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 70 || d < 0.5) continue;
      const dot = (dx * dirX + dz * dirZ) / d;
      if (dot < 0.86) continue; // must be roughly where the camera points
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    const to = best
      ? { x: best.x, y: 1.2, z: best.z }
      : { x: p.x + dirX * 60, y: 1.5, z: p.z + dirZ * 60 };
    state.tracers.push({ from, to, life: 0.12 });
    if (best) {
      best.hp -= 34;
      if (best.hp <= 0) {
        best.disabled = true;
        best.speed = 0;
        state.stats.policeDown += 1;
      }
      addWanted(1);
      return true;
    }
    addWanted(1);
    return false;
  }

  // `input` = { move:{x,y}, handbrake, run, mouse:{x,y}, actions }.
  // `actions` uses the ACTION_* bitmask from input.js.
  function step(dt, input, actions) {
    if (state.over) return 0;
    let events = 0;
    state.time += dt;
    state.clockMinutes += dt / 4; // a game hour every 4 real minutes
    if (state.crimeCooldown > 0) state.crimeCooldown -= dt;
    state.cameraYaw -= (input.mouse ? input.mouse.x : 0) * 0.004;
    state.cameraPitch = Math.max(0.05, Math.min(1.1, state.cameraPitch + (input.mouse ? input.mouse.y : 0) * 0.003));

    const p = state.player;

    if (actions & 4) {
      // E: get in the nearest car, or get out of the one being driven.
      if (p.inCar !== null) {
        const car = state.cars.find((c) => c.id === p.inCar);
        if (car) {
          car.playerDriven = false;
          p.x = car.x - Math.sin(car.angle) * 0 - Math.cos(car.angle) * 2.4;
          p.z = car.z - Math.cos(car.angle) * 0 + Math.sin(car.angle) * 2.4;
          p.angle = car.angle;
        }
        p.inCar = null;
      } else {
        const car = nearestCar(p.x, p.z, 4.5);
        if (car) {
          p.inCar = car.id;
          car.playerDriven = true;
          car.loop = null;
          if (!car.starter && state.stats.carsStolen === 0) {
            // First theft of the session draws the eye.
          }
          if (!car.starter) {
            state.stats.carsStolen += 1;
            if (addWanted(1)) events |= EVENT_WANTED;
          }
          p.angle = car.angle;
        }
      }
    }

    if (p.inCar !== null) {
      const car = state.cars.find((c) => c.id === p.inCar);
      if (car && !car.disabled) {
        const throttle = input.move ? input.move.y : 0;
        const steer = input.move ? input.move.x : 0;
        const crashed = driveCar(car, dt, throttle, steer, input.handbrake);
        if (crashed) {
          events |= EVENT_CRASH;
          if (state.crimeCooldown <= 0) {
            state.crimeCooldown = 3;
            if (addWanted(1)) events |= EVENT_WANTED;
          }
        }
        p.x = car.x;
        p.z = car.z;
        p.angle = car.angle;
        p.speed = car.speed;
        state.cameraYaw += (car.angle - state.cameraYaw) * 0; // camera follows via render
      } else {
        p.inCar = null;
      }
    } else {
      const speed = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const my = input.move ? input.move.y : 0;
      const mx = input.move ? input.move.x : 0;
      const sin = Math.sin(state.cameraYaw);
      const cos = Math.cos(state.cameraYaw);
      const vx = (sin * my - cos * mx) * speed;
      const vz = (cos * my + sin * mx) * speed;
      const len = Math.hypot(vx, vz);
      if (len > 0.01) {
        p.angle = Math.atan2(vx, vz);
        p.speed = len;
        const nx = p.x + vx * dt;
        const nz = p.z + vz * dt;
        const hit = collideBuildings(nx, nz, PLAYER.radius, state.buildings);
        p.x = Math.max(-228, Math.min(208, hit.x));
        p.z = Math.max(-208, Math.min(208, hit.z));
      } else {
        p.speed = 0;
      }
    }

    if (actions & 8) {
      shoot();
      events |= EVENT_SHOT;
    }

    stepTraffic(dt);
    stepPeds(dt);
    const nearestPolice = stepPolice(dt);

    // Wanted decay: stay out of sight and quiet, and the heat drops.
    if (state.wanted > 0) {
      if (nearestPolice === Infinity || nearestPolice > 55) {
        state.wantedQuiet += dt;
        if (state.wantedQuiet >= WANTED.decaySeconds) {
          state.wanted -= 1;
          state.wantedQuiet = 0;
          if (state.wanted === 0) {
            // The tail is gone; stray police cars drive off.
            for (const car of state.cars) if (car.kind === 'police' && !car.disabled) car.disabled = true;
          }
        }
      } else {
        state.wantedQuiet = 0;
      }
    }

    // Slow recovery when nobody is chasing.
    if (state.wanted === 0 && state.health < PLAYER.health) {
      state.health = Math.min(PLAYER.health, state.health + 2 * dt);
    }

    // Mission progress.
    const mEvent = stepMission(state, dt);
    if (mEvent === 'picked') events |= EVENT_PICKUP;
    else if (mEvent === 'delivered') {
      events |= EVENT_DELIVERED;
      state.money += 500;
      state.mission.index = 1;
      startMission(state, 1);
    } else if (mEvent === 'safe') {
      events |= EVENT_SAFE;
      state.money += 800;
      state.mission.index = 2;
      startMission(state, 2);
    } else if (mEvent === 'drop') {
      events |= EVENT_DROP;
      state.money += 150;
    } else if (mEvent === 'complete') {
      events |= EVENT_COMPLETE;
      state.money += 2000;
      state.wanted = 0;
      state.mission.index = 3;
      startMission(state, 3);
    } else if (mEvent === 'failed') {
      events |= EVENT_FAILED;
    }

    // Tracers fade.
    for (let i = state.tracers.length - 1; i >= 0; i -= 1) {
      state.tracers[i].life -= dt;
      if (state.tracers[i].life <= 0) state.tracers.splice(i, 1);
    }

    if (state.health <= 0) {
      state.health = 0;
      state.over = true;
      state.overReason = state.wanted > 0 ? 'BUSTED — the Meridian PD caught up with Rook.' : 'WASTED — Rook went down in Port Meridian.';
      events |= EVENT_OVER;
    }
    return events;
  }

  reset();
  return { state, reset, step, startMission: (index) => startMission(state, index) };
}
