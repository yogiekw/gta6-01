// The three-mission story, as data + transitions. The world owns positions and
// the timer; this module owns what each mission means and what happens next.
// Mission 0 "First Job": pick up the parcel, deliver it before the clock runs out.
// Mission 1 "Hot Pursuit": the heat is on — reach the safehouse and lose the tail.
// Mission 2 "The Big Score": grab five cash drops, then reach the pier.
// After mission 2 the city is free roam.
import { MISSIONS } from './config.js';

// Fixed story points, in city coordinates (metres from the city centre).
// Every point sits on a street intersection or the beach — never inside a building.
export const STORY_POINTS = {
  pickup: { x: -96, z: -48 },
  dropoff: { x: 96, z: 96 },
  safehouse: { x: -144, z: 144 },
  pier: { x: -208, z: 0 },
};

export function missionTitle(index) {
  if (index >= MISSIONS.length) return 'Free Roam';
  return MISSIONS[index].name;
}

export function missionBrief(index) {
  if (index === 0) return 'Pick up the parcel at the yellow marker, then deliver it to the drop-off before time runs out.';
  if (index === 1) return 'The heat is on. Lose the police and reach the safehouse.';
  if (index === 2) return 'Grab all 5 cash drops, then get to the pier. Police will be on you.';
  return 'Explore Port Meridian. Steal cars, dodge the law, make your own trouble.';
}

// Start (or restart) mission `index` on the world state. Returns the objective text.
export function startMission(state, index) {
  const m = state.mission;
  m.index = index;
  m.stage = 0;
  m.timer = index === 0 ? MISSIONS[0].deliverSeconds : 0;
  m.dropsLeft = index === 2 ? MISSIONS[2].drops : 0;
  m.failed = false;
  m.done = false;
  if (index === 0) {
    m.target = { ...STORY_POINTS.pickup };
    m.text = 'Go to the pickup — follow the yellow marker.';
  } else if (index === 1) {
    state.wanted = 2;
    state.wantedQuiet = 0;
    m.target = { ...STORY_POINTS.safehouse };
    m.text = 'WANTED — reach the safehouse and lose the police!';
  } else if (index === 2) {
    state.wanted = 1;
    state.wantedQuiet = 0;
    m.target = null; // drops first; the pier becomes the target after the last drop
    m.text = 'Collect the 5 cash drops around the city.';
  } else {
    m.target = null;
    m.text = 'Free roam — explore Port Meridian.';
  }
  return m.text;
}

// Advance the mission by one fixed step. Returns 'picked' | 'delivered' |
// 'safe' | 'drop' | 'complete' | 'failed' | null.
export function stepMission(state, dt) {
  const m = state.mission;
  if (m.index >= MISSIONS.length || m.done || m.failed) return null;
  const p = state.player;

  if (m.index === 0) {
    if (m.stage === 1) {
      m.timer -= dt;
      if (m.timer <= 0) {
        m.failed = true;
        m.text = 'Too slow — the delivery window closed. Press M to retry.';
        return 'failed';
      }
    }
    if (m.target && Math.hypot(p.x - m.target.x, p.z - m.target.z) < 6) {
      if (m.stage === 0) {
        m.stage = 1;
        m.target = { ...STORY_POINTS.dropoff };
        m.timer = MISSIONS[0].deliverSeconds;
        m.text = 'Parcel secured! Deliver it to the drop-off — beat the clock.';
        return 'picked';
      }
      m.done = true;
      return 'delivered';
    }
    return null;
  }

  if (m.index === 1) {
    if (m.target && Math.hypot(p.x - m.target.x, p.z - m.target.z) < 7) {
      // Lay low at the safehouse: 5 quiet seconds and the heat is off.
      m.hideTimer = (m.hideTimer || 0) + dt;
      if (m.hideTimer >= 5) {
        state.wanted = 0;
        state.wantedQuiet = 0;
        m.done = true;
        return 'safe';
      }
      m.text = `Laying low at the safehouse… ${Math.ceil(5 - m.hideTimer)}s — stay put!`;
    } else {
      m.hideTimer = 0;
    }
    return null;
  }

  if (m.index === 2) {
    for (let i = 0; i < state.drops.length; i += 1) {
      const d = state.drops[i];
      if (!d.taken && Math.hypot(p.x - d.x, p.z - d.z) < 5) {
        d.taken = true;
        m.dropsLeft -= 1;
        if (m.dropsLeft === 0) {
          m.target = { ...STORY_POINTS.pier };
          m.text = 'All drops collected! Get to the pier — now!';
        } else {
          m.text = `Cash drop secured! ${m.dropsLeft} to go.`;
        }
        return 'drop';
      }
    }
    if (m.dropsLeft === 0 && m.target && Math.hypot(p.x - m.target.x, p.z - m.target.z) < 7) {
      m.done = true;
      return 'complete';
    }
    return null;
  }
  return null;
}
