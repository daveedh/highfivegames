/**
 * THROWAWAY PROTOTYPE — Instructions Not Included
 *
 * Question (issue #12): does moving through the store feel good?
 *
 * Three radically different movement presets on one grey-box aisle course,
 * switchable with ?variant=A|B|C, plus live sliders so the boys can tune
 * walk speed / sensitivity / head height / jump / sprint at the keyboard.
 *
 * Not production code: no tests, no abstractions, one file on purpose.
 * Run with `npm run prototype:walk`.
 */
import * as pc from 'playcanvas';
import { FirstPersonController } from 'playcanvas/scripts/esm/first-person-controller.mjs';
import './walk-feel.css';

// ---------------------------------------------------------------- variants --

type Feel = {
  key: string;
  name: string;
  blurb: string;
  walkSpeed: number;
  sprintMult: number;
  lookSens: number;
  eyeHeight: number;
  jumpForce: number;
  groundDamping: number;
  gravity: number;
  fov: number;
};

const VARIANTS: Feel[] = [
  {
    key: 'A',
    name: 'Showroom Stroll',
    blurb: 'Grounded and heavy. No sprint, no jump. You are a customer.',
    walkSpeed: 30,
    sprintMult: 1,
    lookSens: 0.06,
    eyeHeight: 1.7,
    jumpForce: 0,
    groundDamping: 0.98,
    gravity: 18,
    fov: 70
  },
  {
    key: 'B',
    name: 'Aisle Runner',
    blurb: 'Fast and slidey. Shift to sprint, space to jump. Arena-shooter legs.',
    walkSpeed: 60,
    sprintMult: 1.6,
    lookSens: 0.1,
    eyeHeight: 1.6,
    jumpForce: 700,
    groundDamping: 0.995,
    gravity: 16,
    fov: 90
  },
  {
    key: 'C',
    name: 'Kid Scamper',
    blurb: 'Short, twitchy, floaty. Always quick, nothing to hold down. Big hops.',
    walkSpeed: 45,
    sprintMult: 1,
    lookSens: 0.14,
    eyeHeight: 1.35,
    jumpForce: 900,
    groundDamping: 0.99,
    gravity: 12,
    fov: 85
  }
];

const params = new URLSearchParams(window.location.search);
const startKey = (params.get('variant') ?? 'A').toUpperCase();
const startIndex = Math.max(
  0,
  VARIANTS.findIndex((f) => f.key === startKey)
);

const feel: Feel = { ...VARIANTS[startIndex] };

// ------------------------------------------------------------------- ammo ---

pc.WasmModule.setConfig('Ammo', {
  glueUrl: 'wasm/ammo.wasm.js',
  wasmUrl: 'wasm/ammo.wasm.wasm',
  fallbackUrl: 'wasm/ammo.js'
});
await new Promise<void>((resolve) => {
  pc.WasmModule.getInstance('Ammo', () => resolve());
});

// -------------------------------------------------------------------- app ---

const canvas = document.getElementById('application-canvas');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Expected #application-canvas to be a canvas element');
}

const app = new pc.Application(canvas, {
  mouse: new pc.Mouse(canvas),
  keyboard: new pc.Keyboard(window)
});
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.start();

window.addEventListener('resize', () => app.resizeCanvas());

const physics = app.systems.rigidbody!;
physics.gravity.set(0, -feel.gravity, 0);

// ------------------------------------------------------------------ scene ---

const matCache = new Map<string, pc.StandardMaterial>();
const mat = (r: number, g: number, b: number): pc.StandardMaterial => {
  const id = `${r}|${g}|${b}`;
  const cached = matCache.get(id);
  if (cached) return cached;
  const material = new pc.StandardMaterial();
  material.diffuse = new pc.Color(r, g, b);
  material.update();
  matCache.set(id, material);
  return material;
};

const GREY_FLOOR = mat(0.42, 0.42, 0.44);
const GREY_WALL = mat(0.62, 0.62, 0.64);
const GREY_SHELF = mat(0.74, 0.72, 0.68);
const GREY_PROP = mat(0.86, 0.86, 0.86);
const BLUE = mat(0.15, 0.32, 0.62);
const YELLOW = mat(0.9, 0.75, 0.12);

const staticBox = (
  name: string,
  material: pc.StandardMaterial,
  pos: [number, number, number],
  scale: [number, number, number],
  euler?: [number, number, number]
): pc.Entity => {
  const e = new pc.Entity(name);
  e.addComponent('render', { type: 'box', material });
  e.setPosition(pos[0], pos[1], pos[2]);
  e.setLocalScale(scale[0], scale[1], scale[2]);
  if (euler) e.setLocalEulerAngles(euler[0], euler[1], euler[2]);
  e.addComponent('collision', {
    type: 'box',
    halfExtents: new pc.Vec3(scale[0] / 2, scale[1] / 2, scale[2] / 2)
  });
  e.addComponent('rigidbody', { type: 'static', friction: 0.6, restitution: 0 });
  app.root.addChild(e);
  return e;
};

const dynamicBox = (
  name: string,
  pos: [number, number, number],
  scale: [number, number, number]
): pc.Entity => {
  const e = new pc.Entity(name);
  e.addComponent('render', { type: 'box', material: GREY_PROP });
  e.setPosition(pos[0], pos[1], pos[2]);
  e.setLocalScale(scale[0], scale[1], scale[2]);
  e.addComponent('collision', {
    type: 'box',
    halfExtents: new pc.Vec3(scale[0] / 2, scale[1] / 2, scale[2] / 2)
  });
  e.addComponent('rigidbody', {
    type: 'dynamic',
    mass: 8,
    friction: 0.7,
    restitution: 0.1
  });
  app.root.addChild(e);
  return e;
};

const FLOOR_W = 44;
const FLOOR_D = 34;

staticBox('floor', GREY_FLOOR, [0, -0.5, 0], [FLOOR_W, 1, FLOOR_D]);

// Outer walls.
staticBox('wall-n', GREY_WALL, [0, 2, -FLOOR_D / 2], [FLOOR_W, 4, 0.5]);
staticBox('wall-s', GREY_WALL, [0, 2, FLOOR_D / 2], [FLOOR_W, 4, 0.5]);
staticBox('wall-w', GREY_WALL, [-FLOOR_W / 2, 2, 0], [0.5, 4, FLOOR_D]);
staticBox('wall-e', GREY_WALL, [FLOOR_W / 2, 2, 0], [0.5, 4, FLOOR_D]);

// --- Lane 1 (x ≈ 0): the speed run. 20 m between the yellow lines. ---
staticBox('line-start', YELLOW, [0, 0.01, 10], [7, 0.02, 0.3]);
staticBox('line-finish', YELLOW, [0, 0.01, -10], [7, 0.02, 0.3]);
for (let z = 8; z >= -8; z -= 4) {
  staticBox(`tick-${z}`, BLUE, [0, 0.01, z], [5, 0.02, 0.12]);
}
// Shelving down both sides of the speed lane: a normal 3 m showroom aisle.
staticBox('shelf-run-w', GREY_SHELF, [-3.5, 0.9, 0], [1.2, 1.8, 22]);
staticBox('shelf-run-e', GREY_SHELF, [3.5, 0.9, 0], [1.2, 1.8, 22]);

// --- Lane 2 (x ≈ -12): the squeeze. Aisles get narrower: 1.6 m, 1.1 m, 0.8 m. ---
const squeeze = (z: number, gap: number, tag: string) => {
  const armLength = 5;
  const offset = gap / 2 + armLength / 2;
  staticBox(`squeeze-${tag}-a`, GREY_SHELF, [-12 - offset, 0.9, z], [armLength, 1.8, 1]);
  staticBox(`squeeze-${tag}-b`, GREY_SHELF, [-12 + offset, 0.9, z], [armLength, 1.8, 1]);
};
squeeze(8, 1.6, 'wide');
squeeze(2, 1.1, 'mid');
squeeze(-4, 0.8, 'tight');

// --- Lane 3 (x ≈ 10): steps and a ramp. Can you get up without a jump? ---
const STEP_HEIGHTS = [0.15, 0.25, 0.35, 0.45];
STEP_HEIGHTS.forEach((h, i) => {
  staticBox(`step-${h}`, GREY_PROP, [10, h / 2, 8 - i * 3], [4, h, 2]);
});
staticBox('ramp', GREY_SHELF, [10, 0.45, -8], [4, 0.3, 6], [-12, 0, 0]);

// --- The waist-high shortcuts from the showroom sketch. A wall across the ---
// --- back of the room with two blocked gaps: 0.9 m (yellow) and 0.6 m (blue). ---
const SHORTCUT_Z = -13;
staticBox('back-wall-w', GREY_WALL, [-14.5, 1.5, SHORTCUT_Z], [15, 3, 0.6]);
staticBox('back-wall-mid', GREY_WALL, [0, 1.5, SHORTCUT_Z], [9.2, 3, 0.6]);
staticBox('back-wall-e', GREY_WALL, [14.5, 1.5, SHORTCUT_Z], [15, 3, 0.6]);
staticBox('shortcut-high', YELLOW, [-5.8, 0.45, SHORTCUT_Z], [2.4, 0.9, 1]);
staticBox('shortcut-low', BLUE, [5.8, 0.3, SHORTCUT_Z], [2.4, 0.6, 1]);

// --- A doorway (1.2 m gap) and a blind corner, for mouse-turn feel. ---
staticBox('door-wall-w', GREY_WALL, [-17.3, 1.5, -9], [9.4, 3, 0.5]);
staticBox('door-wall-e', GREY_WALL, [-7.7, 1.5, -9], [7.4, 3, 0.5]);
staticBox('corner-wall', GREY_WALL, [-18, 1.5, -5], [0.5, 3, 6]);

// --- Loose flat-packs to bump into (well under the ~40 dynamic body budget). ---
const CLUTTER: Array<[number, number, number]> = [
  [1.2, 0.35, 6],
  [-1.4, 0.35, 1],
  [0.6, 0.35, -5],
  [-10, 0.35, 5],
  [-9.4, 0.35, -1],
  [10.6, 0.35, 0],
  [-14, 0.35, 0],
  [2, 1.1, -2]
];
CLUTTER.forEach(([x, y, z], i) => dynamicBox(`flatpack-${i}`, [x, y, z], [0.7, 0.7, 0.7]));

// ------------------------------------------------------------------ light ---

const sun = new pc.Entity('sun');
sun.addComponent('light', {
  type: 'directional',
  intensity: 1.5,
  castShadows: true,
  shadowBias: 0.2,
  normalOffsetBias: 0.05,
  shadowDistance: 60
});
sun.setEulerAngles(55, 30, 0);
app.root.addChild(sun);

const fill = new pc.Entity('fill');
fill.addComponent('light', { type: 'directional', intensity: 0.45 });
fill.setEulerAngles(-25, -140, 0);
app.root.addChild(fill);

app.scene.ambientLight = new pc.Color(0.32, 0.33, 0.38);

// ----------------------------------------------------------------- player ---

const CAPSULE_RADIUS = 0.35;
const SPAWN = new pc.Vec3(0, 1.4, 13);

const camera = new pc.Entity('camera');
camera.addComponent('camera', {
  clearColor: new pc.Color(0.09, 0.11, 0.17),
  fov: feel.fov,
  farClip: 200,
  nearClip: 0.05
});

const player = new pc.Entity('player');
player.addChild(camera);
player.addComponent('collision', {
  type: 'capsule',
  radius: CAPSULE_RADIUS,
  height: feel.eyeHeight + 0.1
});
player.addComponent('rigidbody', {
  type: 'dynamic',
  mass: 80,
  linearDamping: 0,
  angularDamping: 0,
  linearFactor: pc.Vec3.ONE,
  angularFactor: pc.Vec3.ZERO,
  friction: 0.5,
  restitution: 0
});
player.addComponent('script');
app.root.addChild(player);
player.setPosition(SPAWN);

const controller = player.script?.create(FirstPersonController, {
  properties: {
    camera,
    lookSens: feel.lookSens,
    speedGround: feel.walkSpeed,
    speedAir: 5,
    sprintMult: feel.sprintMult,
    velocityDampingGround: feel.groundDamping,
    velocityDampingAir: 0.99925,
    jumpForce: feel.jumpForce
  }
}) as unknown as FirstPersonController;

/** Push the current `feel` into the live scene. Called on every slider move. */
const applyFeel = () => {
  controller.lookSens = feel.lookSens;
  controller.speedGround = feel.walkSpeed;
  controller.sprintMult = feel.sprintMult;
  controller.velocityDampingGround = feel.groundDamping;
  controller.jumpForce = feel.jumpForce;

  const capsuleHeight = feel.eyeHeight + 0.1;
  if (player.collision) player.collision.height = capsuleHeight;
  // Capsule origin is its centre, so the eye sits just under the top cap.
  camera.setLocalPosition(0, capsuleHeight / 2 - 0.1, 0);

  if (camera.camera) camera.camera.fov = feel.fov;
  physics.gravity.set(0, -feel.gravity, 0);
};

const respawn = () => {
  player.rigidbody?.teleport(SPAWN);
  if (player.rigidbody) player.rigidbody.linearVelocity = pc.Vec3.ZERO;
};

applyFeel();

// A top-down look at the whole course (M). Handy for "where am I?" and for
// judging how long the aisles really are.
const mapCam = new pc.Entity('map-camera');
mapCam.addComponent('camera', {
  clearColor: new pc.Color(0.09, 0.11, 0.17),
  projection: pc.PROJECTION_ORTHOGRAPHIC,
  orthoHeight: 19,
  farClip: 200,
  enabled: params.get('top') === '1'
});
mapCam.setPosition(0, 40, 0);
mapCam.setEulerAngles(-90, 0, 0);
app.root.addChild(mapCam);
if (mapCam.camera?.enabled && camera.camera) camera.camera.enabled = false;

const toggleMap = () => {
  if (!mapCam.camera || !camera.camera) return;
  mapCam.camera.enabled = !mapCam.camera.enabled;
  camera.camera.enabled = !mapCam.camera.enabled;
};

// -------------------------------------------------------------------- HUD ---

const ui = document.createElement('div');
ui.id = 'proto-ui';
ui.innerHTML = `
  <div id="crosshair"></div>
  <div id="readout">
    <div><b id="r-variant"></b></div>
    <div id="r-blurb" class="dim"></div>
    <div class="row"><span>speed</span><b id="r-speed">0.0</b> m/s</div>
    <div class="row"><span>eye height</span><b id="r-eye">0.00</b> m</div>
    <div class="row"><span>grounded</span><b id="r-ground">–</b></div>
    <div class="row"><span>20 m run</span><b id="r-timer">–</b></div>
  </div>
  <div id="panel">
    <h2>Tuning <span class="dim">(Esc to free the mouse)</span></h2>
    <div id="sliders"></div>
    <div id="panel-actions">
      <button id="btn-reset">Reset preset</button>
      <button id="btn-spawn">Respawn (R)</button>
      <button id="btn-copy">Copy settings</button>
    </div>
    <pre id="dump"></pre>
  </div>
  <div id="switcher">
    <button id="prev">◀</button>
    <span id="switch-label"></span>
    <button id="next">▶</button>
    <span class="dim">1 / 2 / 3</span>
  </div>
  <div id="click-to-play"><div>
    <h1>Walk around FLATPÄK SKRÄPBO</h1>
    <p>WASD to move · mouse to look · Shift to sprint · Space to jump · R to respawn · M for the map</p>
    <p class="dim">Click to play. Esc to let go of the mouse and drag the sliders.</p>
  </div></div>
`;
document.body.appendChild(ui);

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
};

type Knob = {
  label: string;
  key: keyof Omit<Feel, 'key' | 'name' | 'blurb'>;
  min: number;
  max: number;
  step: number;
  hint: string;
};

const KNOBS: Knob[] = [
  { label: 'Walk speed', key: 'walkSpeed', min: 10, max: 100, step: 1, hint: 'how hard your legs push' },
  { label: 'Mouse sensitivity', key: 'lookSens', min: 0.02, max: 0.3, step: 0.005, hint: 'how fast you turn' },
  { label: 'Head height', key: 'eyeHeight', min: 1.0, max: 2.0, step: 0.05, hint: 'metres off the floor' },
  { label: 'Sprint multiplier', key: 'sprintMult', min: 1, max: 2.5, step: 0.05, hint: '1.0 = no sprint' },
  { label: 'Jump force', key: 'jumpForce', min: 0, max: 1400, step: 25, hint: '0 = no jump' },
  { label: 'Gravity', key: 'gravity', min: 6, max: 30, step: 0.5, hint: 'how fast you come down' },
  { label: 'Ground damping', key: 'groundDamping', min: 0.95, max: 0.999, step: 0.001, hint: 'lower = stops dead' },
  { label: 'Field of view', key: 'fov', min: 55, max: 110, step: 1, hint: 'how much you can see' }
];

const valueEls = new Map<string, HTMLElement>();
const inputEls = new Map<string, HTMLInputElement>();

const sliders = $('sliders');
KNOBS.forEach((knob) => {
  const wrap = document.createElement('label');
  wrap.className = 'knob';
  wrap.innerHTML = `
    <span class="knob-head">${knob.label} <b class="knob-value"></b></span>
    <input type="range" min="${knob.min}" max="${knob.max}" step="${knob.step}" />
    <span class="dim knob-hint">${knob.hint}</span>
  `;
  const input = wrap.querySelector('input') as HTMLInputElement;
  const value = wrap.querySelector('.knob-value') as HTMLElement;
  input.addEventListener('input', () => {
    feel[knob.key] = Number(input.value);
    applyFeel();
    refreshPanel();
  });
  inputEls.set(knob.key, input);
  valueEls.set(knob.key, value);
  sliders.appendChild(wrap);
});

const settingsJson = (): string =>
  JSON.stringify(
    {
      basedOn: `${feel.key} — ${feel.name}`,
      walkSpeed: feel.walkSpeed,
      lookSens: feel.lookSens,
      eyeHeight: feel.eyeHeight,
      sprintMult: feel.sprintMult,
      jumpForce: feel.jumpForce,
      gravity: feel.gravity,
      groundDamping: feel.groundDamping,
      fov: feel.fov
    },
    null,
    2
  );

function refreshPanel(): void {
  KNOBS.forEach((knob) => {
    const raw = feel[knob.key];
    const input = inputEls.get(knob.key);
    const value = valueEls.get(knob.key);
    if (input) input.value = String(raw);
    if (value) value.textContent = knob.step < 0.01 ? raw.toFixed(3) : String(raw);
  });
  $('r-variant').textContent = `${feel.key} — ${feel.name}`;
  $('r-blurb').textContent = feel.blurb;
  $('switch-label').textContent = `${feel.key} (${feel.name})`;
  $('dump').textContent = settingsJson();
}

const loadVariant = (index: number) => {
  const next = VARIANTS[(index + VARIANTS.length) % VARIANTS.length];
  Object.assign(feel, next);
  currentIndex = VARIANTS.indexOf(next);
  const url = new URL(window.location.href);
  url.searchParams.set('variant', next.key);
  window.history.replaceState({}, '', url);
  applyFeel();
  refreshPanel();
  respawn();
};

let currentIndex = startIndex;
refreshPanel();

$('prev').addEventListener('click', () => loadVariant(currentIndex - 1));
$('next').addEventListener('click', () => loadVariant(currentIndex + 1));
$('btn-reset').addEventListener('click', () => loadVariant(currentIndex));
$('btn-spawn').addEventListener('click', respawn);
$('btn-copy').addEventListener('click', () => {
  void navigator.clipboard.writeText(settingsJson());
  const btn = $('btn-copy');
  btn.textContent = 'Copied!';
  window.setTimeout(() => (btn.textContent = 'Copy settings'), 1200);
});

const overlay = $('click-to-play');
canvas.addEventListener('click', () => overlay.classList.add('hidden'));
document.addEventListener('pointerlockchange', () => {
  overlay.classList.toggle('hidden', document.pointerLockElement === canvas);
});

window.addEventListener('keydown', (e) => {
  const typing = e.target instanceof HTMLInputElement;
  if (typing) return;
  if (e.key === '1') loadVariant(0);
  if (e.key === '2') loadVariant(1);
  if (e.key === '3') loadVariant(2);
  if (e.key === 'r' || e.key === 'R') respawn();
  if (e.key === 'm' || e.key === 'M') toggleMap();
  // Arrows steer while playing, so only cycle variants when the mouse is free.
  if (document.pointerLockElement !== canvas) {
    if (e.key === 'ArrowLeft') loadVariant(currentIndex - 1);
    if (e.key === 'ArrowRight') loadVariant(currentIndex + 1);
  }
});

// ------------------------------------------------------------ live readout --

const START_Z = 10;
const FINISH_Z = -10;
let runStart: number | null = null;
let lastZ = SPAWN.z;
let lastResult = '–';

const rayEnd = new pc.Vec3();
const isGrounded = (): boolean => {
  const from = player.getPosition();
  rayEnd.set(from.x, from.y - (feel.eyeHeight + 0.1) / 2 - 0.15, from.z);
  return !!physics.raycastFirst(from, rayEnd);
};

// Headless smoke test (?selftest=1): shove the body and report how far it went,
// so a CI-less check can still prove physics is stepping.
const selftest = params.get('selftest') === '1';
let selftestReport = 'pending';
if (selftest) {
  window.setTimeout(() => {
    player.rigidbody?.applyImpulse(0, 0, -600);
  }, 1000);
  window.setTimeout(() => {
    const moved = SPAWN.z - player.getPosition().z;
    selftestReport = `moved ${moved.toFixed(2)} m, grounded ${isGrounded()}`;
  }, 3000);
}

app.on('update', () => {
  const v = player.rigidbody?.linearVelocity ?? pc.Vec3.ZERO;
  const speed = Math.hypot(v.x, v.z);
  const pos = player.getPosition();

  // 20 m dash: crossing the yellow lines starts and stops the clock.
  const inLane = Math.abs(pos.x) < 3;
  if (inLane && lastZ > START_Z && pos.z <= START_Z) runStart = Date.now();
  if (inLane && lastZ > FINISH_Z && pos.z <= FINISH_Z && runStart !== null) {
    const secs = (Date.now() - runStart) / 1000;
    lastResult = `${secs.toFixed(2)}s (${(20 / secs).toFixed(1)} m/s)`;
    runStart = null;
  }
  lastZ = pos.z;

  if (pos.y < -5) respawn();

  $('r-speed').textContent = speed.toFixed(1);
  $('r-eye').textContent = camera.getPosition().y.toFixed(2);
  $('r-ground').textContent = isGrounded() ? 'yes' : 'no';
  $('r-timer').textContent = selftest
    ? selftestReport
    : runStart !== null
      ? 'running…'
      : lastResult;
});
