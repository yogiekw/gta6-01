// The Three.js scene, the HUD and the minimap. The world owns the numbers;
// this module owns every mesh, every DOM update and the camera.
import * as THREE from 'three';
import { CITY_HALF, STREETS } from './world.js';
import { PALETTE } from './config.js';
import { missionTitle } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const MAP_SIZE = 180;
const WORLD_SPAN = 470; // -235 .. 235, covers city + beach + sea edge

function el(id) {
  return document.getElementById(id);
}

function makeBox(w, h, d, color, opts) {
  const mat = new THREE.MeshLambertMaterial({ color, ...(opts || {}) });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  return mesh;
}

export function createRenderer(canvas) {
  const threeRenderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  threeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fc8e8);
  scene.fog = new THREE.Fog(0xbfd9ea, 180, 520);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1200);

  // Sun + sky fill.
  const sun = new THREE.DirectionalLight(0xfff2c8, 2.6);
  sun.position.set(120, 180, 60);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd4e6, 1.1));
  const hemi = new THREE.HemisphereLight(0xbdd8ee, 0x8a7a5a, 0.9);
  scene.add(hemi);

  // --- Static ground -------------------------------------------------------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(520, 520),
    new THREE.MeshLambertMaterial({ color: 0x6f7d6a }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 0);
  scene.add(ground);

  // Sea (west) + sand strip.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 520),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(-260, 0.05, 0);
  scene.add(sea);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 520),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(-214, 0.06, 0);
  scene.add(sand);

  // Asphalt: one slab per street, both directions.
  const roadMat = new THREE.MeshLambertMaterial({ color: PALETTE.asphalt });
  for (const s of STREETS) {
    const h = new THREE.Mesh(new THREE.PlaneGeometry(398, 14), roadMat);
    h.rotation.x = -Math.PI / 2;
    h.position.set(0, 0.08, s);
    scene.add(h);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(14, 398), roadMat);
    v.rotation.x = -Math.PI / 2;
    v.position.set(s, 0.08, 0);
    scene.add(v);
  }
  // Dashed centre lines, pale yellow, along every street.
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8d060 });
  for (const s of STREETS) {
    for (let p = -190; p <= 190; p += 16) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.5), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(p, 0.1, s);
      scene.add(dash);
    }
  }

  // --- Dynamic groups ------------------------------------------------------
  const buildingsGroup = new THREE.Group();
  const treesGroup = new THREE.Group();
  const lampsGroup = new THREE.Group();
  const carsGroup = new THREE.Group();
  const pedsGroup = new THREE.Group();
  const fxGroup = new THREE.Group();
  scene.add(buildingsGroup, treesGroup, lampsGroup, carsGroup, pedsGroup, fxGroup);

  // Player: Rook — teal jacket, dark jeans.
  const playerMesh = new THREE.Group();
  const legs = makeBox(0.5, 0.8, 0.3, 0x2a3040);
  legs.position.y = 0.4;
  const torso = makeBox(0.62, 0.75, 0.36, 0x2f8f7a);
  torso.position.y = 1.15;
  const head = makeBox(0.34, 0.34, 0.34, 0xe8b98a);
  head.position.y = 1.72;
  const cap = makeBox(0.38, 0.12, 0.38, 0x1c1e24);
  cap.position.y = 1.92;
  playerMesh.add(legs, torso, head, cap);
  scene.add(playerMesh);

  // Mission beacon: a glowing column + a ring on the ground.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 34, 20, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  const beaconRing = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.4, 28),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  beaconRing.rotation.x = -Math.PI / 2;
  beaconRing.position.y = 0.12;
  const beaconGroup = new THREE.Group();
  beaconGroup.add(beacon, beaconRing);
  beacon.position.y = 17;
  scene.add(beaconGroup);

  // Cash drops: spinning gold bars.
  const dropMeshes = [];
  const dropGeo = new THREE.BoxGeometry(1.1, 0.35, 0.7);
  const dropMat = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x664400 });
  for (let i = 0; i < 5; i += 1) {
    const m = new THREE.Mesh(dropGeo, dropMat);
    scene.add(m);
    dropMeshes.push(m);
  }

  // Gunfire tracers.
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffe95a });
  const tracerLines = [];
  for (let i = 0; i < 6; i += 1) {
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const line = new THREE.Line(geo, tracerMat);
    line.visible = false;
    scene.add(line);
    tracerLines.push(line);
  }

  const carMeshes = new Map();
  const pedMeshes = new Map();
  let staticBuilt = false;
  let lastWanted = 0;

  function buildStatic(state) {
    for (const b of state.buildings) {
      const mesh = makeBox(b.w, b.h, b.d, b.color);
      mesh.position.set(b.x, b.h / 2, b.z);
      buildingsGroup.add(mesh);
      // Windows: a darker band near the top, and a roof slab on some.
      const band = makeBox(b.w * 0.92, Math.min(2.4, b.h * 0.25), b.d * 0.92, 0x2a3542);
      band.position.set(b.x, b.h - Math.min(1.4, b.h * 0.14), b.z);
      buildingsGroup.add(band);
      if (b.roof) {
        const roof = makeBox(b.w * 0.5, 1.2, b.d * 0.5, 0x6a7078);
        roof.position.set(b.x, b.h + 0.6, b.z);
        buildingsGroup.add(roof);
      }
    }
    for (const park of state.parks) {
      const grass = new THREE.Mesh(
        new THREE.PlaneGeometry(park.w, park.d),
        new THREE.MeshLambertMaterial({ color: PALETTE.grass }),
      );
      grass.rotation.x = -Math.PI / 2;
      grass.position.set(park.x, 0.09, park.z);
      buildingsGroup.add(grass);
    }
    for (const t of state.trees) {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.28, t.h * 0.6, 6),
        new THREE.MeshLambertMaterial({ color: PALETTE.trunk }),
      );
      trunk.position.y = t.h * 0.3;
      const top = new THREE.Mesh(
        new THREE.ConeGeometry(1.7, t.h * 0.55, 7),
        new THREE.MeshLambertMaterial({ color: t.color }),
      );
      top.position.y = t.h * 0.75;
      g.add(trunk, top);
      g.position.set(t.x, 0, t.z);
      treesGroup.add(g);
    }
    for (const l of state.lamps) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 5, 6),
        new THREE.MeshLambertMaterial({ color: 0x3a3f46 }),
      );
      pole.position.set(l.x, 2.5, l.z);
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xfff6c8 }),
      );
      lamp.position.set(l.x, 5.1, l.z);
      lampsGroup.add(pole, lamp);
    }
    staticBuilt = true;
  }

  function carMeshFor(car) {
    let entry = carMeshes.get(car.id);
    if (entry) return entry;
    const g = new THREE.Group();
    const body = makeBox(2.0, 0.75, 4.3, car.color);
    body.position.y = 0.55;
    const cabin = makeBox(1.7, 0.65, 2.1, car.kind === 'police' ? 0xe8e8e8 : 0x222a33);
    cabin.position.set(0, 1.2, -0.2);
    g.add(body, cabin);
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
    const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
    for (const [wx, wz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]]) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.38, wz);
      g.add(wheel);
    }
    let lightBar = null;
    if (car.kind === 'police') {
      lightBar = new THREE.Group();
      const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      red.position.x = -0.35;
      const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: 0x2255ff }));
      blue.position.x = 0.35;
      lightBar.add(red, blue);
      lightBar.position.y = 1.62;
      g.add(lightBar);
      const badge = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      badge.position.set(0, 0.62, 2.16);
      g.add(badge);
    }
    carsGroup.add(g);
    entry = { group: g, lightBar, color: car.color };
    carMeshes.set(car.id, entry);
    return entry;
  }

  function pedMeshFor(ped, index) {
    let mesh = pedMeshes.get(index);
    if (mesh) return mesh;
    const g = new THREE.Group();
    const legs = makeBox(0.36, 0.7, 0.24, 0x2a3040);
    legs.position.y = 0.35;
    const torso = makeBox(0.5, 0.62, 0.3, ped.shirt);
    torso.position.y = 1.0;
    const head = makeBox(0.3, 0.3, 0.3, ped.skin);
    head.position.y = 1.48;
    g.add(legs, torso, head);
    pedsGroup.add(g);
    pedMeshes.set(index, g);
    return g;
  }

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (canvas.width !== w || canvas.height !== h) {
      threeRenderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
  }

  // --- HUD + minimap -------------------------------------------------------
  const minimap = el('minimap');
  const mctx = minimap ? minimap.getContext('2d') : null;

  function drawMinimap(state) {
    if (!mctx) return;
    const s = MAP_SIZE / WORLD_SPAN;
    const toMap = (x, z) => [(x + WORLD_SPAN / 2) * s, (z + WORLD_SPAN / 2) * s];
    mctx.fillStyle = '#20262e';
    mctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Sea + sand.
    mctx.fillStyle = '#1d7fa8';
    mctx.fillRect(0, 0, ((-199 + WORLD_SPAN / 2) * s) - ((-235 + WORLD_SPAN / 2) * s) + 0, MAP_SIZE);
    mctx.fillStyle = '#e8d29a';
    const [bx] = toMap(-229, 0);
    mctx.fillRect(bx, 0, 8, MAP_SIZE);
    // Streets.
    mctx.fillStyle = '#4a5058';
    for (const st of STREETS) {
      const [x] = toMap(st, 0);
      const [, z] = toMap(0, st);
      mctx.fillRect(x - 2.5, 0, 5, MAP_SIZE);
      mctx.fillRect(0, z - 2.5, MAP_SIZE, 5);
    }
    // Buildings.
    mctx.fillStyle = '#7a828c';
    for (const b of state.buildings) {
      const [x, z] = toMap(b.x - b.w / 2, b.z - b.d / 2);
      mctx.fillRect(x, z, Math.max(1, b.w * s), Math.max(1, b.d * s));
    }
    // Cash drops.
    mctx.fillStyle = '#ffd23f';
    for (const d of state.drops) {
      if (d.taken) continue;
      const [x, z] = toMap(d.x, d.z);
      mctx.fillRect(x - 2, z - 2, 4, 4);
    }
    // Mission marker (pulsing).
    if (state.mission.target) {
      const pulse = 3 + Math.sin(state.time * 5) * 1.5;
      const [x, z] = toMap(state.mission.target.x, state.mission.target.z);
      mctx.fillStyle = '#ffd23f';
      mctx.beginPath();
      mctx.arc(x, z, pulse + 2, 0, Math.PI * 2);
      mctx.fill();
      mctx.fillStyle = '#20262e';
      mctx.beginPath();
      mctx.arc(x, z, 2, 0, Math.PI * 2);
      mctx.fill();
    }
    // Traffic dots, police in red, player as a white arrow.
    for (const car of state.cars) {
      const [x, z] = toMap(car.x, car.z);
      if (car.disabled) continue;
      mctx.fillStyle = car.kind === 'police' ? '#ff4444' : '#d8d8d8';
      mctx.fillRect(x - 1.5, z - 1.5, 3, 3);
    }
    const [px, pz] = toMap(state.player.x, state.player.z);
    mctx.save();
    mctx.translate(px, pz);
    // The arrow is drawn pointing up; rotate it to the player's heading
    // (map x = world x, map y = world z, so heading a needs π − a).
    mctx.rotate(Math.PI - state.player.angle);
    mctx.fillStyle = '#ffffff';
    mctx.beginPath();
    mctx.moveTo(0, -6);
    mctx.lineTo(4, 5);
    mctx.lineTo(-4, 5);
    mctx.closePath();
    mctx.fill();
    mctx.restore();
  }

  function updateHUD(state, screen) {
    const stars = el('stars');
    if (stars) {
      let html = '';
      for (let i = 0; i < 3; i += 1) html += `<span class="star${i < state.wanted ? ' on' : ''}">★</span>`;
      stars.innerHTML = html;
      stars.classList.toggle('hot', state.wanted > 0);
    }
    const healthFill = el('health-fill');
    if (healthFill) healthFill.style.width = `${Math.max(0, state.health)}%`;
    const money = el('money');
    if (money) money.textContent = `$${Math.floor(state.money).toLocaleString('en-US')}`;
    const speed = el('speed');
    if (speed) {
      const kmh = Math.abs(state.player.speed || 0) * 3.6;
      speed.textContent = state.player.inCar !== null ? `${Math.round(kmh)} km/h` : '';
    }
    const objective = el('objective');
    if (objective) objective.textContent = state.mission.text || '';
    const missionName = el('mission-name');
    if (missionName) missionName.textContent = `${missionTitle(state.mission.index)}  •  Misi ${Math.min(state.mission.index + 1, 3)}/3`;
    const clock = el('clock');
    if (clock) {
      const mins = Math.floor(state.clockMinutes) % (24 * 60);
      const hh = String(Math.floor(mins / 60)).padStart(2, '0');
      const mm = String(mins % 60).padStart(2, '0');
      clock.textContent = `${hh}:${mm}`;
    }
    const timer = el('mission-timer');
    if (timer) {
      timer.textContent = state.mission.index === 0 && state.mission.stage === 1
        ? `⏱ ${Math.max(0, Math.ceil(state.mission.timer))}s` : '';
    }
    const carHint = el('car-hint');
    if (carHint) {
      carHint.textContent = state.player.inCar !== null ? 'E — keluar mobil • Spasi — handbrake' : 'E — masuk mobil • Klik — tembak';
    }
    const hud = el('hud');
    if (hud) hud.style.display = screen === SCREEN_PLAY ? 'block' : 'none';
    const cross = el('crosshair');
    if (cross) cross.style.display = screen === SCREEN_PLAY ? 'block' : 'none';
    if (minimap) minimap.style.display = screen === SCREEN_PLAY ? 'block' : 'none';
  }

  function showScreen(screen, overReason) {
    const map = { title: 'screen-title', paused: 'screen-pause', over: 'screen-over' };
    for (const key of Object.keys(map)) {
      const node = el(map[key]);
      if (node) node.style.display = key === screen ? 'flex' : 'none';
    }
    if (screen === SCREEN_OVER) {
      const reason = el('over-reason');
      if (reason) reason.textContent = overReason || '';
      const overStats = el('over-stats');
      if (overStats) overStats.textContent = '';
    }
  }

  let bannerTimer = null;
  function showBanner(text) {
    const banner = el('banner');
    if (!banner) return;
    banner.textContent = text;
    banner.style.opacity = '1';
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => { banner.style.opacity = '0'; }, 2600);
  }

  function showSave() {
    const ind = el('save-ind');
    if (!ind) return;
    ind.textContent = '✓ Saved';
    ind.style.opacity = '1';
    setTimeout(() => { ind.style.opacity = '0'; }, 1800);
  }

  function draw(state, screen, overReason) {
    resize();
    if (!staticBuilt) buildStatic(state);

    // Cars.
    const seen = new Set();
    for (const car of state.cars) {
      seen.add(car.id);
      const entry = carMeshFor(car);
      entry.group.position.set(car.x, 0, car.z);
      entry.group.rotation.y = car.angle;
      entry.group.visible = !car.disabled || car.playerDriven;
      if (car.kind === 'police' && entry.lightBar) {
        const phase = Math.floor(state.time * 6) % 2 === 0;
        entry.lightBar.children[0].material.color.setHex(phase ? 0xff2222 : 0x551111);
        entry.lightBar.children[1].material.color.setHex(phase ? 0x111155 : 0x2255ff);
      }
    }
    // Police cars that were disabled when the heat died are removed.
    for (const [id, entry] of carMeshes) {
      if (!seen.has(id)) {
        carsGroup.remove(entry.group);
        carMeshes.delete(id);
      }
    }
    // Pedestrians.
    state.peds.forEach((ped, i) => {
      const mesh = pedMeshFor(ped, i);
      mesh.position.set(ped.x, Math.abs(Math.sin(state.time * 6 + i)) * 0.06, ped.z);
      mesh.rotation.y = ped.angle;
    });
    // Player on foot.
    const inCar = state.player.inCar !== null;
    playerMesh.visible = !inCar;
    if (!inCar) {
      playerMesh.position.set(state.player.x, 0, state.player.z);
      playerMesh.rotation.y = state.player.angle;
      const bob = state.player.speed > 0.5 ? Math.abs(Math.sin(state.time * 9)) * 0.08 : 0;
      playerMesh.position.y = bob;
    }
    // Beacon + drops.
    const target = state.mission.target;
    beaconGroup.visible = !!target && screen === SCREEN_PLAY;
    if (target) {
      beaconGroup.position.set(target.x, 0, target.z);
      beacon.material.opacity = 0.16 + Math.sin(state.time * 3) * 0.07;
      beaconRing.scale.setScalar(1 + Math.sin(state.time * 3) * 0.12);
    }
    state.drops.forEach((d, i) => {
      const m = dropMeshes[i];
      m.visible = !d.taken;
      m.position.set(d.x, 1.1 + Math.sin(state.time * 2 + i) * 0.25, d.z);
      m.rotation.y = state.time * 2 + i;
    });
    // Tracers.
    state.tracers.forEach((t, i) => {
      const line = tracerLines[i];
      if (!line) return;
      line.visible = true;
      line.geometry.setFromPoints([
        new THREE.Vector3(t.from.x, t.from.y, t.from.z),
        new THREE.Vector3(t.to.x, t.to.y, t.to.z),
      ]);
    });
    for (let i = state.tracers.length; i < tracerLines.length; i += 1) tracerLines[i].visible = false;

    // Camera: third person. Driving = chase cam that settles behind the car;
    // on foot = orbit around Rook, steered by dragging the mouse.
    const p = state.player;
    if (inCar) {
      // Chase cam: the camera sits behind the car's forward direction, so its
      // yaw settles onto the car's heading (camera looks along +forward).
      const targetYaw = p.angle;
      let diff = targetYaw - state.cameraYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      state.cameraYaw += diff * Math.min(1, 0.045);
    }
    const dist = inCar ? 11 : 8;
    const pitch = state.cameraPitch;
    const cy = Math.sin(pitch) * dist;
    const ch = Math.cos(pitch) * dist;
    let cx = p.x - Math.sin(state.cameraYaw) * ch;
    let cz = p.z - Math.cos(state.cameraYaw) * ch;
    let camY = cy + 1.6;
    // Camera collision: walk from the player toward the wanted camera spot and
    // stop just before the first building the line would enter.
    const px = p.x;
    const pz = p.z;
    const py = 1.6;
    for (let t = 0.1; t <= 1.0; t += 0.1) {
      const sx = px + (cx - px) * t;
      const sz = pz + (cz - pz) * t;
      const sy = py + (camY - py) * t;
      let blocked = false;
      for (const b of state.buildings) {
        if (sx > b.x - b.w / 2 - 0.6 && sx < b.x + b.w / 2 + 0.6
          && sz > b.z - b.d / 2 - 0.6 && sz < b.z + b.d / 2 + 0.6 && sy < b.h) {
          blocked = true;
          break;
        }
      }
      if (blocked) {
        const tt = Math.max(0.05, t - 0.1);
        cx = px + (cx - px) * tt;
        cz = pz + (cz - pz) * tt;
        camY = py + (camY - py) * tt;
        break;
      }
    }
    camera.position.set(cx, camY, cz);
    camera.lookAt(p.x, 1.6, p.z);

    // Title screen: slow orbit over the city instead of the chase cam.
    if (screen === SCREEN_TITLE) {
      const a = state.time * 0.05;
      camera.position.set(Math.sin(a) * 150, 90, Math.cos(a) * 150);
      camera.lookAt(0, 0, 0);
    }

    threeRenderer.render(scene, camera);
    updateHUD(state, screen);
    if (screen === SCREEN_PLAY) drawMinimap(state);
    showScreen(screen, overReason);
    if (state.wanted !== lastWanted) lastWanted = state.wanted;
  }

  return { draw, showBanner, showSave, setScreen: showScreen };
}
