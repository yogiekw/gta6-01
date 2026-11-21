// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between four screens: title, play,
// paused and game over.
//
// ?seed=N fixes the city. ?shot=start|play|chase|end (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { DEFAULT_SEED, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_COMPLETE, EVENT_CRASH, EVENT_DELIVERED, EVENT_DROP, EVENT_FAILED, EVENT_OVER, EVENT_PICKUP, EVENT_SAFE, EVENT_WANTED } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MISSION, ACTION_PAUSE, ACTION_SHOOT, createInput } from './input.js';
import { createAudio } from './audio.js';
import { loadSave, writeSave } from './save.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';
import { missionTitle } from './missions.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : DEFAULT_SEED;

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
const saved = loadSave();
if (saved) {
  world.state.money = saved.money;
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.overReason);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();

  function announce(message) {
    status.textContent = message;
  }

  function persist() {
    const ok = writeSave({
      money: Math.floor(world.state.money),
      missionsDone: Math.min(world.state.mission.index, 3),
      bestTimes: {},
    });
    if (ok) renderer.showSave();
  }

  function startGame() {
    audio.unlock();
    world.reset();
    const keep = loadSave();
    if (keep) world.state.money = keep.money;
    accumulator = 0;
    screen = SCREEN_PLAY;
    renderer.showBanner('Mission 1 — First Job: follow the yellow marker!');
    announce('Playing. Mission 1: First Job.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    announce(`Game over. ${world.state.overReason}`);
  }

  function handleEvents(events) {
    if (events & EVENT_PICKUP) {
      audio.pickup();
      renderer.showBanner('Parcel secured! Deliver it — beat the clock!');
    }
    if (events & EVENT_DELIVERED) {
      audio.missionDone();
      renderer.showBanner('Delivered! +$500 — the heat is on. Mission 2: Hot Pursuit!');
      persist();
    }
    if (events & EVENT_SAFE) {
      audio.missionDone();
      renderer.showBanner('You lost them! +$800 — Mission 3: The Big Score!');
      persist();
    }
    if (events & EVENT_DROP) {
      audio.pickup();
      renderer.showBanner(`Cash drop secured! ${world.state.mission.dropsLeft} to go.`);
    }
    if (events & EVENT_COMPLETE) {
      audio.missionDone();
      renderer.showBanner('THE BIG SCORE — +$2,000! Port Meridian is yours. Free roam!');
      persist();
    }
    if (events & EVENT_FAILED) {
      renderer.showBanner('Mission failed — press M to retry.');
    }
    if (events & EVENT_WANTED) {
      renderer.showBanner('★ WANTED — the Meridian PD is on you!');
    }
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_OVER) endGame();
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    if (actions & ACTION_MISSION && screen === SCREEN_PLAY) {
      const m = world.state.mission;
      if (m.failed || m.index >= 3) {
        const next = m.failed ? m.index : 0;
        world.startMission(next);
        renderer.showBanner(`Mission ${next + 1} — ${missionTitle(next)}!`);
      }
    }
    return actions;
  }

  function step(actions) {
    const mouse = input.takeMouseDelta();
    const move = input.move();
    const events = world.step(STEP, {
      move, handbrake: input.handbrake, run: input.run, mouse,
    }, actions);
    if (events & EVENT_SHOT) audio.shoot();
    handleEvents(events);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    if (screen === SCREEN_TITLE) {
      // The title screen orbits a living city behind the menu.
      world.step(STEP, { move: { x: 0, y: 0 }, handbrake: false, run: false, mouse: { x: 0, y: 0 } }, 0);
      accumulator = 0;
    } else if (screen === SCREEN_PLAY) {
      // One-shot actions (enter car, shoot) fire on the first step only —
      // repeating them across the frame's steps would enter then exit a car.
      let first = true;
      while (accumulator >= STEP) {
        step(first ? actions : 0);
        first = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    audio.update(STEP, Math.abs(world.state.player.speed || 0), world.state.wanted);
    renderer.draw(world.state, screen, world.state.overReason);
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // The title screen shows the saved fortune, if any.
  const savedLine = document.getElementById('saved-line');
  if (savedLine && saved) savedLine.textContent = `Welcome back — your stash: $${Math.floor(saved.money).toLocaleString('en-US')} • Missions done: ${saved.missionsDone}/3`;

  announce('Port Meridian. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
