# Port Meridian — gta6-01

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/competitions/gta6-01)
[![rank](https://make.fun/badge/gta6-01/yogiekw/gta6-01/rank.svg)](https://make.fun/competitions/gta6-01)
[![reward](https://make.fun/badge/gta6-01/yogiekw/gta6-01/reward.svg)](https://make.fun/competitions/gta6-01)

**Port Meridian** is an original open-world crime game built with Three.js: a sunny
fictional coastal city where you play Rook, a getaway driver with no car, no cash
and one last chance. A fixer named Marlowe offers three jobs — a parcel run, a
getaway through a police dragnet, and one big score at the pier. Explore the city
on foot or behind the wheel, steal cars, dodge the Meridian PD, and finish the
story to unlock free roam.

Everything in the game is original: the city, characters, vehicles, story, art
and sounds were made for this entry. No assets, names or music from any existing
commercial game are used.

## How to play

- **WASD** — move on foot / drive
- **Mouse drag** — orbit the camera
- **E** — steal the nearest car / get out
- **Click** — shoot (raises your wanted level)
- **Space** — handbrake (also confirms on menus)
- **Shift** — run
- **M** — retry the current mission
- **Esc / P** — pause

**Wanted level (0–3 stars):** stealing cars, crashing hard and shooting draw the
police. Police cars chase and ram you. Stay out of sight and quiet for a while
and the heat drops, one star at a time.

**Missions (in order):**

1. **First Job** — pick up the parcel at the yellow marker and deliver it before
   the timer runs out. (+$500)
2. **Hot Pursuit** — two stars from the start. Reach the safehouse and lay low
   until the heat is off. (+$800)
3. **The Big Score** — grab all 5 cash drops around the city, then get to the
   pier. (+$2,000)

After the third mission the city is free roam. Money and mission progress save
in the browser (localStorage) and are shown when you return.

The HUD shows your wanted stars, health, cash, in-game clock, mission objective
and timer, speed, and a live minimap (player, traffic, police, mission marker,
cash drops).

## How to run

No build step — the game is static files under `game/`.

```sh
node serve.ts
# then open http://localhost:8080
```

Open `game/index.html` directly from any static server and it plays offline:
every script, module and asset is a file under `game/` (Three.js 0.180.0 is
vendored at `game/vendor/three.module.min.js`). No network request is made.

Screenshots are deterministic: `?seed=N` fixes the city, and
`?shot=start|play|chase|end` stages a scene for a screenshot.

## Files

- `game/index.html` — page, import map, HUD and screens
- `game/src/main.js` — boot, fixed-step loop, screens, shots
- `game/src/config.js` — all tuning numbers
- `game/src/random.js` — seeded RNG
- `game/src/input.js` — keyboard + mouse
- `game/src/world.js` — city, player, cars, traffic, pedestrians, police, wanted, combat
- `game/src/missions.js` — the three-mission story
- `game/src/render.js` — Three.js scene, HUD, minimap
- `game/src/audio.js` — procedural WebAudio (engine, siren, gunshot, chimes)
- `game/src/save.js` — localStorage save / load
- `game/src/shots.js` — autopilot for the screenshot scenes
- `main.ts` — the entry program: copies `game/` + `screenshots/` to `/output`
  and writes `/output/dossier.json`
- `screenshots/` — 4 screenshots taken from the game itself in a browser

Entered on [make.fun](https://make.fun/?ref=yogiekw&utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
