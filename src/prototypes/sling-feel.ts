/**
 * THROWAWAY PROTOTYPE — Instructions Not Included
 *
 * Question (issue #13): does firing the slingshot feel good?
 *
 * The signature mechanic on a grey-box training range: draw, aim, release, and
 * watch a real physics projectile land. Three radically different slingshots
 * (?variant=A|B|C) plus live sliders, so the boys can tune charge / arc /
 * speed / reload / hit feedback at the keyboard.
 *
 * Static targets only — guards are issue #15 and come back in #19.
 *
 * Borrowed and NOT up for tuning here:
 *   - walk feel: the settled Aisle Runner numbers from #12.
 *   - ammo tiers: Light / Medium / Heavy, 5-slot pouch, ricochets do full
 *     damage, from #16. The exact masses and speeds are issue #14 — the tier
 *     multipliers below are placeholders that only exist so a mug and a
 *     pressure cooker arc differently while the boys judge the mechanic.
 *
 * Not production code: no tests, no abstractions, one file on purpose.
 * Run with `npm run prototype:sling`.
 */
import * as pc from 'playcanvas';
import { FirstPersonController } from 'playcanvas/scripts/esm/first-person-controller.mjs';
import './walk-feel.css';
import './sling-feel.css';

// ------------------------------------------------- settled walk feel (#12) --

const WALK = {
  walkSpeed: 45,
  sprintMult: 1.6,
  lookSens: 0.1,
  eyeHeight: 1.6,
  jumpForce: 550,
  gravity: 16,
  groundDamping: 0.995,
  stepHeight: 0.45,
  stepSmooth: 0.12,
  fov: 90
};

// ------------------------------------------------------ ammo tiers (#16) ----

type TierKey = 'light' | 'medium' | 'heavy';

type Tier = {
  key: TierKey;
  name: string;
  /** Damage against a 4-point dummy: Light 4 hits, Medium 2, Heavy 1. */
  damage: number;
  slots: number;
  knockdown: boolean;
  /** Placeholder ratios — the real numbers are issue #14. */
  massMult: number;
  speedMult: number;
  radius: number;
};

const TIERS: Record<TierKey, Tier> = {
  light: { key: 'light', name: 'Light', damage: 1, slots: 1, knockdown: false, massMult: 0.4, speedMult: 1.15, radius: 0.1 },
  medium: { key: 'medium', name: 'Medium', damage: 2, slots: 2, knockdown: false, massMult: 1, speedMult: 1, radius: 0.16 },
  heavy: { key: 'heavy', name: 'Heavy', damage: 4, slots: 3, knockdown: true, massMult: 2.6, speedMult: 0.72, radius: 0.26 }
};

const TIER_ORDER: TierKey[] = ['light', 'medium', 'heavy'];
const DUMMY_HP = 4;
const POUCH_SLOTS = 5;

// ---------------------------------------------------------------- variants --

type AimMode = 'dot' | 'arc' | 'both';

type Sling = {
  key: string;
  name: string;
  blurb: string;
  /** Seconds from touch to full draw. 0 means no charge: click and it fires. */
  drawTime: number;
  /** Muzzle speed (m/s) at zero draw and at full draw. */
  minSpeed: number;
  maxSpeed: number;
  /** Multiplier on world gravity for the projectile only. Arc heaviness. */
  arcGravity: number;
  /** Base projectile mass in kg, before the tier multiplier. */
  mass: number;
  bounce: number;
  /** Seconds you cannot fire after a shot. */
  reload: number;
  /** Degrees of cone spread at zero draw, falling to zero at full draw. */
  spread: number;
  /** Fraction of walk speed kept while drawing. */
  drawSlow: number;
  /** Degrees of FOV pulled in at full draw. */
  fovPull: number;
  /** Extra shove on the target, on top of the projectile's own momentum. */
  hitImpulse: number;
  fireShake: number;
  hitShake: number;
  aimMode: AimMode;
};

const VARIANTS: Sling[] = [
  {
    key: 'A',
    name: 'Quick Draw',
    blurb: 'No charge. Click and it goes, flat and fast. A pea-shooter you can spam.',
    drawTime: 0,
    minSpeed: 42,
    maxSpeed: 42,
    arcGravity: 0.55,
    mass: 1.4,
    bounce: 0.45,
    reload: 0.28,
    spread: 1.6,
    drawSlow: 1,
    fovPull: 0,
    hitImpulse: 180,
    fireShake: 0.02,
    hitShake: 0.05,
    aimMode: 'dot'
  },
  {
    key: 'B',
    name: 'Pull and Hold',
    blurb: 'Hold to stretch the band, let go to fire. Longer pull = faster, flatter, straighter.',
    drawTime: 0.75,
    minSpeed: 14,
    maxSpeed: 48,
    arcGravity: 1,
    mass: 2,
    bounce: 0.4,
    reload: 0.35,
    spread: 7,
    drawSlow: 0.55,
    fovPull: 12,
    hitImpulse: 320,
    fireShake: 0.05,
    hitShake: 0.1,
    aimMode: 'dot'
  },
  {
    key: 'C',
    name: 'Heavy Lob',
    blurb: 'Slow, heavy, always an arc. Aim with the dotted line and bank it off walls.',
    drawTime: 1.1,
    minSpeed: 9,
    maxSpeed: 26,
    arcGravity: 1.6,
    mass: 4,
    bounce: 0.55,
    reload: 0.7,
    spread: 0,
    drawSlow: 0.4,
    fovPull: 0,
    hitImpulse: 620,
    fireShake: 0.09,
    hitShake: 0.18,
    aimMode: 'arc'
  }
];

const params = new URLSearchParams(window.location.search);
const startKey = (params.get('variant') ?? 'B').toUpperCase();
const startIndex = Math.max(
  0,
  VARIANTS.findIndex((s) => s.key === startKey)
);

const cfg: Sling = { ...VARIANTS[startIndex] };

const FEEDBACK = {
  hitmarker: true,
  targetFlash: true,
  screenShake: true,
  hitStop: true,
  debris: true,
  tracer: false
};

const selftest = params.get('selftest') === '1';
const pageStart = Date.now();

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
physics.gravity.set(0, -WALK.gravity, 0);

// ------------------------------------------------------------- materials ---

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

const emissive = (r: number, g: number, b: number): pc.StandardMaterial => {
  const material = new pc.StandardMaterial();
  material.diffuse = new pc.Color(r * 0.4, g * 0.4, b * 0.4);
  material.emissive = new pc.Color(r, g, b);
  material.update();
  return material;
};

const GREY_FLOOR = mat(0.42, 0.42, 0.44);
const GREY_WALL = mat(0.62, 0.62, 0.64);
const GREY_SHELF = mat(0.74, 0.72, 0.68);
const GREY_PROP = mat(0.86, 0.86, 0.86);
const YELLOW = mat(0.9, 0.75, 0.12);
const BLUE = mat(0.15, 0.32, 0.62);
const GRIP = mat(0.24, 0.25, 0.28);
const RUBBER = mat(0.2, 0.2, 0.23);
const LEATHER = mat(0.4, 0.28, 0.18);

const DUMMY_OK = mat(0.36, 0.4, 0.5);
const DUMMY_HURT = mat(1, 1, 1);
const DUMMY_DOWN = mat(0.25, 0.26, 0.3);

const RING_OUT = mat(0.9, 0.9, 0.9);
const RING_MID = mat(0.15, 0.32, 0.62);
const RING_IN = mat(0.85, 0.2, 0.16);

const AMMO_MAT: Record<TierKey, pc.StandardMaterial> = {
  light: mat(0.95, 0.85, 0.35),
  medium: mat(0.95, 0.55, 0.2),
  heavy: mat(0.8, 0.22, 0.2)
};

const TRACE_MAT = emissive(0.95, 0.82, 0.3);

// ------------------------------------------------------------------ scene ---

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
  e.addComponent('rigidbody', { type: 'static', friction: 0.6, restitution: 0.25 });
  app.root.addChild(e);
  return e;
};

// A long hall: you shoot down -Z, so distance is just -z metres from spawn.
const HALL_W = 34;
const HALL_D = 60;
const SPAWN = new pc.Vec3(0, 1.4, 24);

staticBox('floor', GREY_FLOOR, [0, -0.5, 0], [HALL_W, 1, HALL_D]);
staticBox('wall-n', GREY_WALL, [0, 3, -HALL_D / 2], [HALL_W, 6, 0.5]);
staticBox('wall-s', GREY_WALL, [0, 3, HALL_D / 2], [HALL_W, 6, 0.5]);
staticBox('wall-w', GREY_WALL, [-HALL_W / 2, 3, 0], [0.5, 6, HALL_D]);
staticBox('wall-e', GREY_WALL, [HALL_W / 2, 3, 0], [0.5, 6, HALL_D]);

// Distance markers painted on the floor every 10 m, so "how fast does it fly"
// and "how far does it drop" have numbers behind them.
const DISTANCES = [10, 20, 30, 40];
DISTANCES.forEach((d) => {
  staticBox(`mark-${d}`, YELLOW, [0, 0.01, SPAWN.z - d], [HALL_W - 1, 0.02, 0.18]);
});

// The over-the-wall bay: a 3.2 m wall you cannot see past, with a dummy behind
// it. Only an arc gets in. This is the question "how heavy is the arc" made
// into a target.
staticBox('lob-wall', GREY_SHELF, [-9, 1.6, SPAWN.z - 16], [11, 3.2, 0.6]);

// The ricochet nook: an angled bank wall with a dummy tucked behind a blind.
// Per #16 a bounced object does full damage, so this should be winnable.
staticBox('bank-wall', GREY_SHELF, [13.4, 1.6, SPAWN.z - 30], [0.6, 3.2, 9], [0, 28, 0]);
staticBox('nook-blind', GREY_SHELF, [8.6, 1.6, SPAWN.z - 24.5], [0.6, 3.2, 6]);

// Cover to shoot from and around.
staticBox('cover-w', GREY_SHELF, [-6, 0.55, SPAWN.z - 6], [3.4, 1.1, 1]);
staticBox('cover-e', GREY_SHELF, [6.5, 0.55, SPAWN.z - 9], [3.4, 1.1, 1]);

// ------------------------------------------------------------------ light ---

const sun = new pc.Entity('sun');
sun.addComponent('light', {
  type: 'directional',
  intensity: 1.5,
  castShadows: true,
  shadowBias: 0.2,
  normalOffsetBias: 0.05,
  shadowDistance: 70
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
const CAPSULE_HEIGHT = WALK.eyeHeight + 0.1;

const camera = new pc.Entity('camera');
camera.addComponent('camera', {
  clearColor: new pc.Color(0.09, 0.11, 0.17),
  fov: WALK.fov,
  farClip: 220,
  nearClip: 0.05
});

const player = new pc.Entity('player');
player.addChild(camera);
player.addComponent('collision', { type: 'capsule', radius: CAPSULE_RADIUS, height: CAPSULE_HEIGHT });
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
player.setEulerAngles(0, 0, 0);
// The body is created at the entity's position when the component is added, and
// a dynamic body overwrites the graph node on the first step. setPosition alone
// leaves you standing at the world origin, halfway down the range.
player.rigidbody?.teleport(SPAWN);

const camBaseY = CAPSULE_HEIGHT / 2 - 0.1;
camera.setLocalPosition(0, camBaseY, 0);

const fpc = player.script?.create(FirstPersonController, {
  properties: {
    camera,
    lookSens: WALK.lookSens,
    speedGround: WALK.walkSpeed,
    speedAir: 5,
    sprintMult: WALK.sprintMult,
    velocityDampingGround: WALK.groundDamping,
    velocityDampingAir: 0.99925,
    jumpForce: WALK.jumpForce
  }
}) as unknown as { speedGround: number } | undefined;

// ------------------------------------------------------- sling viewmodel ----

// A forked yoke on a handle, parented to the camera: the bottom of the U curves
// round into two prongs, and the bands run from the prong tips to the pouch.
// The pouch slides back toward your face as you draw, so the charge is readable
// without looking at the HUD.
const sling = new pc.Entity('sling-viewmodel');
camera.addChild(sling);
sling.setLocalPosition(0.26, -0.24, -0.55);

// Where the bands anchor, and so where the prongs have to end.
const FORK_HALF_W = 0.105;
const FORK_TIP_Y = 0.185;
// Where the curve of the U hands over to the straight prongs, and how far it
// dips below that. Dipping less than the half-width keeps the U wide and
// shallow, which is what reads as a slingshot rather than a tuning fork.
const FORK_JOIN_Y = 0.075;
const FORK_DEPTH = 0.07;
const FORK_THICK = 0.026;
const HANDLE_BOTTOM_Y = -0.115;

const rodMid = new pc.Vec3();
const rodDir = new pc.Vec3();

/** Stretch and aim a unit-height primitive so it spans `a` to `b`. */
const layRod = (rod: pc.Entity, a: pc.Vec3, b: pc.Vec3, thick: number): void => {
  rodMid.add2(a, b).mulScalar(0.5);
  rodDir.sub2(b, a);
  const len = Math.max(rodDir.length(), 0.001);
  rod.setLocalPosition(rodMid);
  rod.setLocalScale(thick, len, thick);
  rodDir.mulScalar(1 / len);
  // Point the primitive's local +Y down the rod.
  const yaw = Math.atan2(rodDir.x, rodDir.z) * pc.math.RAD_TO_DEG;
  const pitch = Math.asin(pc.math.clamp(rodDir.y, -1, 1)) * pc.math.RAD_TO_DEG;
  rod.setLocalEulerAngles(pitch - 90, yaw, 0);
};

const rod = (name: string, type: string, material: pc.StandardMaterial): pc.Entity => {
  const e = new pc.Entity(name);
  e.addComponent('render', { type, material });
  sling.addChild(e);
  return e;
};

/** A point on the U, from -1 at the left prong base through 0 at the bottom. */
const forkPoint = (t: number): pc.Vec3 => {
  const a = (t * Math.PI) / 2;
  return new pc.Vec3(FORK_HALF_W * Math.sin(a), FORK_JOIN_Y - FORK_DEPTH * Math.cos(a), 0);
};

// The curve, as short straight segments with a ball at each joint to hide the
// mitre. Keep the segments comfortably longer than the rod is thick — once they
// get shorter than that, the joint balls dominate and the U reads as a string
// of beads rather than a bent rod.
const FORK_SEGMENTS = 8;
for (let i = 0; i < FORK_SEGMENTS; i += 1) {
  const a = forkPoint(-1 + (2 * i) / FORK_SEGMENTS);
  const b = forkPoint(-1 + (2 * (i + 1)) / FORK_SEGMENTS);
  layRod(rod(`fork-seg-${i}`, 'cylinder', BLUE), a, b, FORK_THICK);
  if (i > 0) {
    const joint = rod(`fork-joint-${i}`, 'sphere', BLUE);
    joint.setLocalPosition(a);
    joint.setLocalScale(FORK_THICK, FORK_THICK, FORK_THICK);
  }
}

// The two straight prongs, each capped with the ball the band ties onto.
for (const side of [-1, 1]) {
  const tag = side < 0 ? 'l' : 'r';
  layRod(
    rod(`fork-prong-${tag}`, 'cylinder', BLUE),
    new pc.Vec3(side * FORK_HALF_W, FORK_JOIN_Y, 0),
    new pc.Vec3(side * FORK_HALF_W, FORK_TIP_Y, 0),
    FORK_THICK
  );
  const tip = rod(`fork-tip-${tag}`, 'sphere', BLUE);
  tip.setLocalPosition(side * FORK_HALF_W, FORK_TIP_Y, 0);
  tip.setLocalScale(0.032, 0.032, 0.032);
}

// The handle, thicker than the fork and in a different colour so the grip
// reads as the part of it you're actually holding.
layRod(
  rod('sling-handle', 'cylinder', GRIP),
  new pc.Vec3(0, FORK_JOIN_Y - FORK_DEPTH + 0.005, 0),
  new pc.Vec3(0, HANDLE_BOTTOM_Y, 0),
  0.034
);
const handleButt = rod('sling-handle-butt', 'sphere', GRIP);
handleButt.setLocalPosition(0, HANDLE_BOTTOM_Y, 0);
handleButt.setLocalScale(0.034, 0.034, 0.034);

// The pouch: a small leather cup seated against the back of the ball. It has to
// sit on the near side — that's the side the pull acts through — so from the
// player's eye it's always partly in front of the ball. Keep it narrower than
// the ball so the orange still reads as a ring around it; a cup as wide as the
// ball just hides the ammo completely.
const POUCH_BACK = 0.03;
const slingPouch = new pc.Entity('sling-pouch');
slingPouch.addComponent('render', { type: 'sphere', material: LEATHER });
slingPouch.setLocalScale(0.05, 0.05, 0.03);
sling.addChild(slingPouch);

const slingAmmo = new pc.Entity('sling-ammo');
slingAmmo.addComponent('render', { type: 'sphere', material: AMMO_MAT.medium });
slingAmmo.setLocalScale(0.07, 0.07, 0.07);
sling.addChild(slingAmmo);

const bandL = new pc.Entity('band-l');
bandL.addComponent('render', { type: 'cylinder', material: RUBBER });
sling.addChild(bandL);
const bandR = new pc.Entity('band-r');
bandR.addComponent('render', { type: 'cylinder', material: RUBBER });
sling.addChild(bandR);

const BAND_TIP_L = new pc.Vec3(-FORK_HALF_W, FORK_TIP_Y, 0);
const BAND_TIP_R = new pc.Vec3(FORK_HALF_W, FORK_TIP_Y, 0);
const BAND_THICK = 0.017;
const pouchLocal = new pc.Vec3();
const cupLocal = new pc.Vec3();

const layBand = (band: pc.Entity, tip: pc.Vec3): void => {
  layRod(band, tip, pouchLocal, BAND_THICK);
};

// ----------------------------------------------------------------- targets --

type TargetKind = 'dummy' | 'tower' | 'board' | 'slider';

type Target = {
  entity: pc.Entity;
  kind: TargetKind;
  label: string;
  hp: number;
  maxHp: number;
  down: boolean;
  /** Metres from the firing line, for the readout. */
  range: number;
  flashUntil: number;
  base: pc.StandardMaterial;
  home: pc.Vec3;
  homeRot: pc.Quat;
  /** Sliding targets only. */
  slide?: { centre: number; span: number; speed: number; phase: number };
};

const targets: Target[] = [];
const targetByEntity = new Map<pc.Entity, Target>();

const register = (t: Target): Target => {
  targets.push(t);
  targetByEntity.set(t.entity, t);
  return t;
};

const spawnDummy = (name: string, label: string, x: number, z: number): Target => {
  const e = new pc.Entity(name);
  const height = 2.4; // guard height settled in #15
  e.addComponent('render', { type: 'box', material: DUMMY_OK });
  e.setLocalScale(0.8, height, 0.55);
  e.setPosition(x, height / 2 + 0.02, z);
  e.addComponent('collision', { type: 'box', halfExtents: new pc.Vec3(0.4, height / 2, 0.275) });
  e.addComponent('rigidbody', {
    type: 'dynamic',
    mass: 70,
    friction: 0.8,
    restitution: 0.05,
    // Stays bolt upright until it dies, then it is free to topple.
    angularFactor: pc.Vec3.ZERO,
    linearFactor: new pc.Vec3(0, 1, 0)
  });
  app.root.addChild(e);

  const visor = new pc.Entity('visor');
  visor.addComponent('render', { type: 'box', material: YELLOW });
  visor.setLocalScale(0.7, 0.1, 0.06);
  visor.setLocalPosition(0, 0.34, -0.52);
  e.addChild(visor);

  return register({
    entity: e,
    kind: 'dummy',
    label,
    hp: DUMMY_HP,
    maxHp: DUMMY_HP,
    down: false,
    range: Math.round(SPAWN.z - z),
    flashUntil: 0,
    base: DUMMY_OK,
    home: e.getPosition().clone(),
    homeRot: e.getRotation().clone()
  });
};

const spawnTowerBox = (name: string, x: number, y: number, z: number): Target => {
  const e = new pc.Entity(name);
  e.addComponent('render', { type: 'box', material: GREY_PROP });
  e.setLocalScale(0.75, 0.75, 0.75);
  e.setPosition(x, y, z);
  e.addComponent('collision', { type: 'box', halfExtents: new pc.Vec3(0.375, 0.375, 0.375) });
  e.addComponent('rigidbody', { type: 'dynamic', mass: 9, friction: 0.7, restitution: 0.15 });
  app.root.addChild(e);
  return register({
    entity: e,
    kind: 'tower',
    label: name,
    hp: 1,
    maxHp: 1,
    down: false,
    range: Math.round(SPAWN.z - z),
    flashUntil: 0,
    base: GREY_PROP,
    home: e.getPosition().clone(),
    homeRot: e.getRotation().clone()
  });
};

const spawnBoard = (name: string, label: string, x: number, z: number): Target => {
  const e = new pc.Entity(name);
  e.addComponent('render', { type: 'box', material: RING_OUT });
  e.setLocalScale(1.6, 1.6, 0.16);
  e.setPosition(x, 1.6, z);
  e.addComponent('collision', { type: 'box', halfExtents: new pc.Vec3(0.8, 0.8, 0.08) });
  e.addComponent('rigidbody', { type: 'static', friction: 0.6, restitution: 0.4 });
  app.root.addChild(e);

  const midRing = new pc.Entity('ring-mid');
  midRing.addComponent('render', { type: 'box', material: RING_MID });
  midRing.setLocalScale(0.62, 0.62, 1.3);
  midRing.setLocalPosition(0, 0, -0.05);
  e.addChild(midRing);

  const inRing = new pc.Entity('ring-in');
  inRing.addComponent('render', { type: 'box', material: RING_IN });
  inRing.setLocalScale(0.26, 0.26, 1.6);
  inRing.setLocalPosition(0, 0, -0.09);
  e.addChild(inRing);

  const post = new pc.Entity('post');
  post.addComponent('render', { type: 'box', material: GREY_SHELF });
  post.setLocalScale(0.12, 1.0, 0.7);
  post.setLocalPosition(0, -0.8, 0);
  e.addChild(post);

  return register({
    entity: e,
    kind: 'board',
    label,
    hp: 1,
    maxHp: 1,
    down: false,
    range: Math.round(SPAWN.z - z),
    flashUntil: 0,
    base: RING_OUT,
    home: e.getPosition().clone(),
    homeRot: e.getRotation().clone()
  });
};

const spawnSlider = (name: string, label: string, centre: number, z: number): Target => {
  const e = new pc.Entity(name);
  e.addComponent('render', { type: 'box', material: BLUE });
  e.setLocalScale(0.9, 1.3, 0.2);
  e.setPosition(centre, 1.5, z);
  e.addComponent('collision', { type: 'box', halfExtents: new pc.Vec3(0.45, 0.65, 0.1) });
  e.addComponent('rigidbody', { type: 'kinematic', friction: 0.6, restitution: 0.4 });
  app.root.addChild(e);
  return register({
    entity: e,
    kind: 'slider',
    label,
    hp: 2,
    maxHp: 2,
    down: false,
    range: Math.round(SPAWN.z - z),
    flashUntil: 0,
    base: BLUE,
    home: e.getPosition().clone(),
    homeRot: e.getRotation().clone(),
    slide: { centre, span: 5.5, speed: 1.5, phase: 0 }
  });
};

// Three dummies straight down the hall: near, mid, far.
spawnDummy('dummy-near', 'near dummy', -2.5, SPAWN.z - 10);
spawnDummy('dummy-mid', 'mid dummy', 2.5, SPAWN.z - 21);
spawnDummy('dummy-far', 'far dummy', -1.5, SPAWN.z - 38);
// One you can only arc onto, one you can only bank onto.
spawnDummy('dummy-lob', 'over-the-wall dummy', -9, SPAWN.z - 19);
spawnDummy('dummy-nook', 'ricochet dummy', 11, SPAWN.z - 26);

// Three stacks of three: pure knock-it-over physics.
[
  [-13, SPAWN.z - 14],
  [13, SPAWN.z - 14],
  [0, SPAWN.z - 30]
].forEach(([x, z], stack) => {
  for (let i = 0; i < 3; i += 1) spawnTowerBox(`tower-${stack}-${i}`, x, 0.4 + i * 0.78, z);
});

spawnBoard('board-near', 'near board', 6, SPAWN.z - 13);
spawnBoard('board-far', 'far board', -5.5, SPAWN.z - 33);
spawnSlider('slider', 'sliding plate', 0, SPAWN.z - 24);

const dummyTargets = targets.filter((t) => t.kind === 'dummy');

// ------------------------------------------------------------ hit feedback --

let shakeAmount = 0;
const shakeOffset = new pc.Vec3();
let hitStopUntil = 0;
let paused = false;
/** Set once the selftest is done: the scene stops stepping for good. */
let frozen = false;

const shake = (amount: number): void => {
  if (!FEEDBACK.screenShake) return;
  shakeAmount = Math.min(shakeAmount + amount, 0.5);
};

const debris: pc.Entity[] = [];
const puff = (at: pc.Vec3, material: pc.StandardMaterial): void => {
  if (!FEEDBACK.debris) return;
  for (let i = 0; i < 3; i += 1) {
    const e = new pc.Entity('debris');
    e.addComponent('render', { type: 'box', material });
    e.setLocalScale(0.16, 0.16, 0.16);
    e.setPosition(at.x, at.y, at.z);
    e.addComponent('collision', { type: 'box', halfExtents: new pc.Vec3(0.08, 0.08, 0.08) });
    e.addComponent('rigidbody', { type: 'dynamic', mass: 0.4, friction: 0.6, restitution: 0.4 });
    app.root.addChild(e);
    e.rigidbody?.applyImpulse(
      (Math.random() - 0.5) * 1.6,
      Math.random() * 1.4 + 0.4,
      (Math.random() - 0.5) * 1.6
    );
    debris.push(e);
    // The guard prototype learned this the hard way: unbounded debris locks the
    // tab. Stay well inside the ~40 dynamic body budget from #5.
    while (debris.length > 9) debris.shift()?.destroy();
  }
};

const clearDebris = (): void => {
  while (debris.length) debris.pop()?.destroy();
};

// ------------------------------------------------------------------- stats --

let shotsFired = 0;
let shotsHit = 0;
let dummiesDowned = 0;
let lastSpeed = 0;
let lastFlight = 0;
let lastRange = 0;
let rangeClock = 0;
let rangeRunning = false;
let bestClear: number | null = null;

// ------------------------------------------------------------------ pouch ---

let tier: TierKey = 'medium';
let pouch = POUCH_SLOTS;

const canAfford = (t: TierKey): boolean => pouch >= TIERS[t].slots;

const refillPouch = (): void => {
  pouch = POUCH_SLOTS;
};

// -------------------------------------------------------------- projectiles --

type Shot = {
  entity: pc.Entity;
  tier: Tier;
  born: number;
  prev: pc.Vec3;
  /** Targets this shot has already scored on, so a resting ball cannot farm. */
  struck: Set<pc.Entity>;
  scored: boolean;
  /** Selftest only: closest this shot ever got to what it was aimed at. */
  miss?: { at: number; pos: pc.Vec3 };
};

const shots: Shot[] = [];
const MAX_SHOTS = 10;

// --------------------------------------------------------------- the draw ---

let drawing = false;
let drawT = 0;
let cooldown = 0;

const charge = (): number => (cfg.drawTime <= 0.01 ? 1 : pc.math.clamp(drawT / cfg.drawTime, 0, 1));
const shotSpeed = (): number => pc.math.lerp(cfg.minSpeed, cfg.maxSpeed, charge()) * TIERS[tier].speedMult;

const aimDir = new pc.Vec3();
const aimOrigin = new pc.Vec3();
/** Selftest only: fire along this instead of where the camera points. */
let aimOverride: pc.Vec3 | null = null;

const readAim = (): void => {
  const fwd = aimOverride ?? camera.forward;
  aimDir.set(fwd.x, fwd.y, fwd.z).normalize();
  const p = camera.getPosition();
  aimOrigin.set(p.x + aimDir.x * 0.6, p.y + aimDir.y * 0.6 - 0.12, p.z + aimDir.z * 0.6);
};

const jitter = new pc.Vec3();
const applySpread = (dir: pc.Vec3): void => {
  const spread = cfg.spread * (1 - charge());
  if (spread <= 0.001) return;
  const rad = spread * pc.math.DEG_TO_RAD;
  jitter.set(
    (Math.random() - 0.5) * 2 * rad,
    (Math.random() - 0.5) * 2 * rad,
    (Math.random() - 0.5) * 2 * rad
  );
  dir.add(jitter).normalize();
};

const fire = (): void => {
  if (cooldown > 0) return;
  const t = TIERS[tier];
  if (!canAfford(tier)) {
    toast('Pouch empty — press R to refill');
    return;
  }

  pouch -= t.slots;
  shotsFired += 1;
  cooldown = cfg.reload;
  if (!rangeRunning) {
    rangeRunning = true;
    rangeClock = 0;
  }

  readAim();
  applySpread(aimDir);

  const speed = shotSpeed();
  lastSpeed = speed;

  const e = new pc.Entity('shot');
  e.addComponent('render', { type: 'sphere', material: AMMO_MAT[t.key] });
  e.setLocalScale(t.radius * 2, t.radius * 2, t.radius * 2);
  e.setPosition(aimOrigin);
  e.addComponent('collision', { type: 'sphere', radius: t.radius });
  e.addComponent('rigidbody', {
    type: 'dynamic',
    mass: cfg.mass * t.massMult,
    friction: 0.5,
    restitution: cfg.bounce,
    linearDamping: 0,
    angularDamping: 0.1
  });
  app.root.addChild(e);
  setShotGravity(e);
  // Impulse = mass × speed, so the slider reads in real metres per second.
  const mass = cfg.mass * t.massMult;
  e.rigidbody?.applyImpulse(aimDir.x * speed * mass, aimDir.y * speed * mass, aimDir.z * speed * mass);

  shots.push({ entity: e, tier: t, born: Date.now(), prev: aimOrigin.clone(), struck: new Set(), scored: false });
  while (shots.length > MAX_SHOTS) shots.shift()?.entity.destroy();

  shake(cfg.fireShake);
  drawT = 0;
};

// -------------------------------------------------------------- hit resolve --

const flashTarget = (t: Target): void => {
  if (!FEEDBACK.targetFlash) return;
  t.flashUntil = Date.now() + 90;
  if (t.entity.render) t.entity.render.material = DUMMY_HURT;
};

const downTarget = (t: Target, impulse: pc.Vec3): void => {
  t.down = true;
  if (t.kind === 'dummy') {
    dummiesDowned += 1;
    // Let it fall over now that it is out of the fight.
    if (t.entity.rigidbody) {
      t.entity.rigidbody.angularFactor = pc.Vec3.ONE;
      t.entity.rigidbody.linearFactor = pc.Vec3.ONE;
      t.entity.rigidbody.applyImpulse(impulse.x * 0.6, impulse.y * 0.6 + 30, impulse.z * 0.6);
      t.entity.rigidbody.applyTorqueImpulse((Math.random() - 0.5) * 60, (Math.random() - 0.5) * 40, 90);
    }
    if (t.entity.render) t.entity.render.material = DUMMY_DOWN;
  } else if (t.kind === 'board' || t.kind === 'slider') {
    // Boards and plates just fold away — they are scoring marks, not bodies.
    t.entity.enabled = false;
  }
};

const hitImpulse = new pc.Vec3();
const relPoint = new pc.Vec3();

const scoreHit = (t: Target, point: pc.Vec3, velocity: pc.Vec3, shot: Shot): void => {
  if (t.down || shot.struck.has(t.entity)) return;
  shot.struck.add(t.entity);

  if (!shot.scored) {
    shot.scored = true;
    shotsHit += 1;
    lastFlight = (Date.now() - shot.born) / 1000;
    lastRange = Math.round(SPAWN.z - point.z);
  }

  const dealt = t.kind === 'dummy' ? shot.tier.damage : 1;
  t.hp -= dealt;
  flashTarget(t);

  const speed = velocity.length();
  hitImpulse.copy(velocity).normalize().mulScalar(cfg.hitImpulse * (shot.tier.massMult * 0.6 + 0.4));

  if (t.kind === 'tower' && t.entity.rigidbody) {
    const c = t.entity.getPosition();
    relPoint.set(point.x - c.x, point.y - c.y, point.z - c.z);
    t.entity.rigidbody.applyImpulse(hitImpulse, relPoint);
  }

  const killed = t.hp <= 0;
  if (killed) {
    downTarget(t, hitImpulse);
  } else if (t.kind === 'dummy' && shot.tier.knockdown && t.entity.rigidbody) {
    // A Heavy knocks a guard flat even when it does not finish it (#16).
    t.entity.rigidbody.angularFactor = pc.Vec3.ONE;
    t.entity.rigidbody.linearFactor = pc.Vec3.ONE;
    t.entity.rigidbody.applyTorqueImpulse(0, 0, 70);
    knockdowns.push({ target: t, until: Date.now() + 1600 });
  }

  hitmarker(killed);
  shake(cfg.hitShake * (killed ? 1.8 : 1));
  if (FEEDBACK.hitStop) hitStopUntil = Date.now() + (killed ? 110 : 55);
  puff(point, shot.tier.key === 'heavy' ? AMMO_MAT.heavy : GREY_PROP);
  if (speed > 0) lastSpeed = Math.max(lastSpeed, 0);
};

const knockdowns: Array<{ target: Target; until: number }> = [];

const rayFrom = new pc.Vec3();
const rayTo = new pc.Vec3();
const shotVel = new pc.Vec3();
const reflect = new pc.Vec3();

/**
 * Arc weight is set as real per-body gravity on the Bullet body, not as a
 * per-frame force. A force is cleared after each internal physics step, so on a
 * frame that swallows several steps it lands once while gravity lands every
 * time — the arc then changes with the frame rate, which is exactly the thing
 * the boys would be trying to judge.
 */
type AmmoVec = { setValue: (x: number, y: number, z: number) => void };
type AmmoBody = { setGravity: (v: AmmoVec) => void };
const AmmoLib = (window as unknown as { Ammo: { btVector3: new (x: number, y: number, z: number) => AmmoVec } }).Ammo;
const gravVec = new AmmoLib.btVector3(0, 0, 0);

const setShotGravity = (e: pc.Entity): void => {
  const body = (e.rigidbody as unknown as { body?: AmmoBody } | undefined)?.body;
  if (!body) return;
  gravVec.setValue(0, -WALK.gravity * cfg.arcGravity, 0);
  body.setGravity(gravVec);
};

/**
 * Hit detection by swept raycast, not contact events. A 0.1 m ball at 45 m/s
 * moves three-quarters of a metre per frame, so it tunnels straight through a
 * thin board; the sweep never misses. On a hit we place the ball at the impact
 * and reflect it ourselves, which also makes ricochets (full damage, per #16)
 * behave the same at every speed. Below the threshold the ball is slow enough
 * that ordinary physics contacts are fine, so we hand it back.
 *
 * `raycastFirst` is unusable here: the ray runs from the ball's previous centre
 * to its current one, so it *ends inside the ball's own sphere* and the nearest
 * hit is always the shot itself. That silently swallowed every real hit. Scan
 * all hits instead and take the nearest one that is neither the shot nor the
 * player.
 *
 * The ray is also extended one radius past the ball's centre. A ray along the
 * centre path alone never reaches a target the ball is resting against: contact
 * resolution stops the ball a radius short of the surface, so its centre stops
 * outside the collider and the segment misses by exactly the ball's radius.
 *
 * The sweep is driven by actual displacement, never by velocity. The update
 * event runs before the physics step, so on the frame a ball lands its velocity
 * has *already* been zeroed by the contact — gating on speed skips the one
 * frame that matters. Where it moved from and to is always true.
 */
const MOVE_EPSILON = 0.02;
/** Above this speed the ball is flying and we own the bounce. */
const SWEEP_SPEED = 10;

const sweepEnd = new pc.Vec3();
const travel = new pc.Vec3();

const sweepHit = (shot: Shot, from: pc.Vec3, to: pc.Vec3): pc.RaycastResult | null => {
  travel.sub2(to, from);
  const moved = travel.length();
  if (moved < MOVE_EPSILON) return null;
  sweepEnd.copy(travel).mulScalar(1 / moved).mulScalar(shot.tier.radius * 1.35).add(to);
  const hits = physics.raycastAll(from, sweepEnd);
  let best: pc.RaycastResult | null = null;
  let bestDist = Infinity;
  for (const h of hits) {
    if (h.entity === shot.entity || h.entity === player) continue;
    const d = from.distance(h.point);
    if (d < bestDist) {
      bestDist = d;
      best = h;
    }
  }
  return best;
};

const stepShots = (dt: number): void => {
  for (let i = shots.length - 1; i >= 0; i -= 1) {
    const shot = shots[i];
    const body = shot.entity.rigidbody;
    const pos = shot.entity.getPosition();

    if (body) {
      // Keep the arc weight live while a slider is being dragged.
      setShotGravity(shot.entity);
      shotVel.copy(body.linearVelocity);
    } else {
      shotVel.set(0, 0, 0);
    }

    rayFrom.copy(shot.prev);
    rayTo.copy(pos);
    const hit = sweepHit(shot, rayFrom, rayTo);
    if (hit) {
      const target = targetByEntity.get(hit.entity);
      if (target) scoreHit(target, hit.point, shotVel, shot);

      // Only take the bounce into our own hands while the ball is genuinely
      // flying. Below that, Bullet's own contact response is better than a
      // teleport, and stealing it makes a rolling ball twitch.
      if (shotVel.length() > SWEEP_SPEED) {
        const dot = shotVel.dot(hit.normal);
        reflect
          .copy(hit.normal)
          .mulScalar(2 * dot)
          .sub2(shotVel, reflect)
          .mulScalar(cfg.bounce);
        const off = shot.tier.radius * 1.2;
        body?.teleport(
          hit.point.x + hit.normal.x * off,
          hit.point.y + hit.normal.y * off,
          hit.point.z + hit.normal.z * off
        );
        if (body) body.linearVelocity = reflect;
      }
    }

    shot.prev.copy(shot.entity.getPosition());

    // Selftest instrumentation: track the closest approach to the aimed target
    // so a miss reports *how* it missed instead of just "miss".
    if (selftest && dummyTargets.length) {
      const to = dummyTargets[0].entity.getPosition();
      const p = shot.entity.getPosition();
      const d = Math.hypot(p.x - to.x, p.y - to.y, p.z - to.z);
      if (!shot.miss || d < shot.miss.at) shot.miss = { at: d, pos: p.clone() };
    }

    if (Date.now() - shot.born > 12000 || shot.entity.getPosition().y < -6) {
      shot.entity.destroy();
      shots.splice(i, 1);
    }
  }

  for (let i = knockdowns.length - 1; i >= 0; i -= 1) {
    if (Date.now() < knockdowns[i].until) continue;
    const { target } = knockdowns[i];
    knockdowns.splice(i, 1);
    if (target.down || !target.entity.rigidbody) continue;
    // Stand back up: snap upright, then re-lock so it stays that way.
    target.entity.rigidbody.teleport(target.home, target.homeRot);
    target.entity.rigidbody.linearVelocity = pc.Vec3.ZERO;
    target.entity.rigidbody.angularVelocity = pc.Vec3.ZERO;
    target.entity.rigidbody.angularFactor = pc.Vec3.ZERO;
    target.entity.rigidbody.linearFactor = new pc.Vec3(0, 1, 0);
  }
  void dt;
};

// -------------------------------------------------------------- arc preview --

const PREVIEW_DOTS = 26;
const previewDots: pc.Entity[] = [];
const previewRoot = new pc.Entity('arc-preview');
app.root.addChild(previewRoot);
for (let i = 0; i < PREVIEW_DOTS; i += 1) {
  const dot = new pc.Entity(`dot-${i}`);
  dot.addComponent('render', { type: 'sphere', material: TRACE_MAT });
  dot.setLocalScale(0.09, 0.09, 0.09);
  dot.enabled = false;
  previewRoot.addChild(dot);
  previewDots.push(dot);
}

const simP = new pc.Vec3();
const simV = new pc.Vec3();
const simNext = new pc.Vec3();

const hideArc = (): void => {
  previewRoot.enabled = false;
};

const drawArc = (): void => {
  previewRoot.enabled = true;
  readAim();
  simP.copy(aimOrigin);
  simV.copy(aimDir).mulScalar(shotSpeed());
  const g = WALK.gravity * cfg.arcGravity;
  const step = 0.045;
  let stopped = false;
  for (let i = 0; i < PREVIEW_DOTS; i += 1) {
    const dot = previewDots[i];
    if (stopped) {
      dot.enabled = false;
      continue;
    }
    simV.y -= g * step;
    simNext.set(simP.x + simV.x * step, simP.y + simV.y * step, simP.z + simV.z * step);
    const hit = physics.raycastFirst(simP, simNext);
    if (hit && hit.entity !== player) {
      dot.setPosition(hit.point);
      dot.setLocalScale(0.2, 0.2, 0.2);
      dot.enabled = true;
      stopped = true;
      continue;
    }
    simP.copy(simNext);
    dot.setPosition(simP);
    dot.setLocalScale(0.09, 0.09, 0.09);
    dot.enabled = true;
  }
};

hideArc();

// -------------------------------------------------------------------- HUD ---

const ui = document.createElement('div');
ui.id = 'proto-ui';
ui.innerHTML = `
  <div id="crosshair"></div>
  <div id="hitmarker"><i></i><i></i><i></i><i></i></div>
  <div id="draw-meter"><div id="draw-fill"></div></div>
  <div id="range-banner">TARGETS 0</div>
  <div id="toast"></div>
  <div id="tier-bar">
    <span data-tier="light">1 Light</span>
    <span data-tier="medium">2 Medium</span>
    <span data-tier="heavy">3 Heavy</span>
  </div>
  <div id="pouch"></div>
  <div id="readout">
    <div><b id="r-variant"></b></div>
    <div id="r-blurb" class="dim"></div>
    <div class="row"><span>draw</span><b id="r-draw">–</b></div>
    <div class="row"><span>shot speed</span><b id="r-speed">0</b> m/s</div>
    <div class="row"><span>last hit at</span><b id="r-range">–</b> m</div>
    <div class="row"><span>flight time</span><b id="r-flight">–</b> s</div>
    <div class="row"><span>hits / shots</span><b id="r-acc">0 / 0</b></div>
    <div class="row"><span>accuracy</span><b id="r-pct">–</b></div>
    <div class="row"><span>dummies down</span><b id="r-kills">0 / 5</b></div>
    <div class="row"><span>range time</span><b id="r-clock">0.0</b> s</div>
    <div class="row"><span>best clear</span><b id="r-best">–</b></div>
  </div>
  <div id="panel">
    <h2>Tuning <span class="dim">(Esc to free the mouse)</span></h2>
    <div id="sliders"></div>
    <label class="knob"><span class="knob-head">How you aim</span></label>
    <select id="aim-mode">
      <option value="dot">Dot crosshair only</option>
      <option value="arc">Dotted arc preview</option>
      <option value="both">Both</option>
    </select>
    <label class="knob"><span class="knob-head">What a hit does</span></label>
    <div class="toggles" id="toggles"></div>
    <p class="note">
      Ammo tiers are the settled ones from #16 (Light 4 hits / Medium 2 / Heavy 1
      + knockdown, 5-slot pouch, ricochets full damage). Their exact masses and
      speeds are issue #14 — don't tune them here.
    </p>
    <div id="panel-actions">
      <button id="btn-reset">Reset preset</button>
      <button id="btn-range">Reset range (T)</button>
      <button id="btn-refill">Refill pouch (R)</button>
      <button id="btn-spawn">Back to the line (Y)</button>
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
  <div id="selftest-log" class="hidden"></div>
  <div id="click-to-play"><div>
    <h1>FLATPÄK SKRÄPBO — staff training range</h1>
    <p><b>Hold left click to draw, let go to fire.</b> WASD · mouse to look · Shift to sprint · Space to jump</p>
    <p>1 / 2 / 3 or scroll to swap ammo · R refill pouch · T reset the range · Y back to the line</p>
    <p class="dim">Five dummies, two boards, a sliding plate and three stacks. One dummy is behind a wall. One is round a corner — bank it.</p>
    <p class="dim">Click to play. Esc to let go of the mouse and drag the sliders.</p>
  </div></div>
`;
document.body.appendChild(ui);

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

const logLines: string[] = [];
function log(line: string): void {
  logLines.push(`${((Date.now() - pageStart) / 1000).toFixed(1)}s  ${line}`);
  while (logLines.length > 16) logLines.shift();
  if (selftest) $('selftest-log').textContent = logLines.join('\n');
}

const markerEl = $('hitmarker');
let markerUntil = 0;
function hitmarker(killed: boolean): void {
  if (!FEEDBACK.hitmarker) return;
  markerEl.classList.remove('on');
  void markerEl.offsetWidth;
  markerEl.classList.toggle('kill', killed);
  markerEl.classList.add('on');
  markerUntil = Date.now() + 220;
}

const toastEl = $('toast');
let toastUntil = 0;
function toast(text: string): void {
  toastEl.textContent = text;
  toastEl.classList.add('on');
  toastUntil = Date.now() + 1400;
}

// ----------------------------------------------------------------- knobs ---

type NumericKey = 'drawTime' | 'minSpeed' | 'maxSpeed' | 'arcGravity' | 'mass' | 'bounce' | 'reload' | 'spread' | 'drawSlow' | 'fovPull' | 'hitImpulse' | 'fireShake' | 'hitShake';

type Knob = { label: string; key: NumericKey; min: number; max: number; step: number; hint: string };

const KNOBS: Knob[] = [
  { label: 'Draw time', key: 'drawTime', min: 0, max: 2, step: 0.05, hint: 'seconds to full pull — 0 means no charge at all' },
  { label: 'Speed at no draw', key: 'minSpeed', min: 4, max: 60, step: 1, hint: 'm/s the instant you click' },
  { label: 'Speed at full draw', key: 'maxSpeed', min: 4, max: 80, step: 1, hint: 'm/s once the band is stretched' },
  { label: 'Arc weight', key: 'arcGravity', min: 0, max: 3, step: 0.05, hint: '1 = normal gravity. Higher drops harder' },
  { label: 'Projectile mass', key: 'mass', min: 0.2, max: 8, step: 0.1, hint: 'kg before the tier multiplier' },
  { label: 'Bounciness', key: 'bounce', min: 0, max: 0.9, step: 0.05, hint: 'how live a ricochet is' },
  { label: 'Reload', key: 'reload', min: 0, max: 2, step: 0.05, hint: 'seconds before you can fire again' },
  { label: 'Snap-shot spread', key: 'spread', min: 0, max: 15, step: 0.5, hint: 'degrees of wobble at zero draw' },
  { label: 'Speed while drawing', key: 'drawSlow', min: 0.2, max: 1, step: 0.05, hint: '1 = drawing does not slow you' },
  { label: 'Zoom on full draw', key: 'fovPull', min: 0, max: 30, step: 1, hint: 'degrees of FOV pulled in' },
  { label: 'Hit shove', key: 'hitImpulse', min: 0, max: 1400, step: 20, hint: 'extra push into whatever you hit' },
  { label: 'Shake on fire', key: 'fireShake', min: 0, max: 0.3, step: 0.01, hint: 'kick when you let go' },
  { label: 'Shake on hit', key: 'hitShake', min: 0, max: 0.4, step: 0.01, hint: 'thump when it lands' }
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
    cfg[knob.key] = Number(input.value);
    refreshPanel();
  });
  inputEls.set(knob.key, input);
  valueEls.set(knob.key, value);
  sliders.appendChild(wrap);
});

const aimSelect = $('aim-mode') as HTMLSelectElement;
aimSelect.addEventListener('change', () => {
  cfg.aimMode = aimSelect.value as AimMode;
  refreshPanel();
});

const togglesEl = $('toggles');
(Object.keys(FEEDBACK) as Array<keyof typeof FEEDBACK>).forEach((key) => {
  const label = document.createElement('label');
  const text: Record<keyof typeof FEEDBACK, string> = {
    hitmarker: 'Hitmarker on the crosshair',
    targetFlash: 'Target flashes white',
    screenShake: 'Screen shake',
    hitStop: 'Hit-stop (tiny freeze)',
    debris: 'Debris puff',
    tracer: 'Leave a tracer trail'
  };
  label.innerHTML = `<input type="checkbox" ${FEEDBACK[key] ? 'checked' : ''} /> <span>${text[key]}</span>`;
  const box = label.querySelector('input') as HTMLInputElement;
  box.addEventListener('change', () => {
    FEEDBACK[key] = box.checked;
    refreshPanel();
  });
  togglesEl.appendChild(label);
});

const settingsJson = (): string =>
  JSON.stringify(
    {
      basedOn: `${cfg.key} — ${cfg.name}`,
      ...Object.fromEntries(KNOBS.map((k) => [k.key, cfg[k.key]])),
      aimMode: cfg.aimMode,
      feedback: { ...FEEDBACK }
    },
    null,
    2
  );

function refreshPanel(): void {
  KNOBS.forEach((knob) => {
    const raw = cfg[knob.key];
    const input = inputEls.get(knob.key);
    const value = valueEls.get(knob.key);
    if (input) input.value = String(raw);
    if (value) value.textContent = knob.step < 0.1 ? raw.toFixed(2) : String(raw);
  });
  aimSelect.value = cfg.aimMode;
  $('r-variant').textContent = `${cfg.key} — ${cfg.name}`;
  $('r-blurb').textContent = cfg.blurb;
  $('switch-label').textContent = `${cfg.key} (${cfg.name})`;
  $('dump').textContent = settingsJson();
}

// ------------------------------------------------------------ range reset ---

const resetRange = (): void => {
  targets.forEach((t) => {
    t.down = false;
    t.hp = t.maxHp;
    t.entity.enabled = true;
    t.flashUntil = 0;
    if (t.entity.render) t.entity.render.material = t.base;
    const body = t.entity.rigidbody;
    if (!body) return;
    if (t.kind === 'dummy') {
      body.angularFactor = pc.Vec3.ZERO;
      body.linearFactor = new pc.Vec3(0, 1, 0);
    }
    body.teleport(t.home, t.homeRot);
    if (body.type !== 'kinematic') {
      body.linearVelocity = pc.Vec3.ZERO;
      body.angularVelocity = pc.Vec3.ZERO;
    }
  });
  knockdowns.length = 0;
  while (shots.length) shots.pop()?.entity.destroy();
  clearDebris();
  dummiesDowned = 0;
  shotsFired = 0;
  shotsHit = 0;
  rangeClock = 0;
  rangeRunning = false;
  refillPouch();
};

const backToLine = (): void => {
  player.rigidbody?.teleport(SPAWN);
  if (player.rigidbody) player.rigidbody.linearVelocity = pc.Vec3.ZERO;
};

let currentIndex = startIndex;

const loadVariant = (index: number): void => {
  const next = VARIANTS[(index + VARIANTS.length) % VARIANTS.length];
  Object.assign(cfg, next);
  currentIndex = VARIANTS.indexOf(next);
  const url = new URL(window.location.href);
  url.searchParams.set('variant', next.key);
  window.history.replaceState({}, '', url);
  drawing = false;
  drawT = 0;
  cooldown = 0;
  refreshPanel();
  resetRange();
  backToLine();
};

refreshPanel();
resetRange();

$('prev').addEventListener('click', () => loadVariant(currentIndex - 1));
$('next').addEventListener('click', () => loadVariant(currentIndex + 1));
$('btn-reset').addEventListener('click', () => loadVariant(currentIndex));
$('btn-range').addEventListener('click', resetRange);
$('btn-refill').addEventListener('click', refillPouch);
$('btn-spawn').addEventListener('click', backToLine);
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

const locked = (): boolean => document.pointerLockElement === canvas;

app.mouse?.on(pc.EVENT_MOUSEDOWN, (e: pc.MouseEvent) => {
  if (e.button !== pc.MOUSEBUTTON_LEFT || !locked()) return;
  if (cfg.drawTime <= 0.01) {
    fire();
    return;
  }
  drawing = true;
  drawT = 0;
});

app.mouse?.on(pc.EVENT_MOUSEUP, (e: pc.MouseEvent) => {
  if (e.button !== pc.MOUSEBUTTON_LEFT || !drawing) return;
  drawing = false;
  fire();
});

app.mouse?.on(pc.EVENT_MOUSEWHEEL, (e: pc.MouseEvent) => {
  if (!locked()) return;
  const dir = (e.wheelDelta ?? 0) > 0 ? 1 : -1;
  const i = TIER_ORDER.indexOf(tier);
  tier = TIER_ORDER[(i + dir + TIER_ORDER.length) % TIER_ORDER.length];
});

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.key === '1') tier = 'light';
  if (e.key === '2') tier = 'medium';
  if (e.key === '3') tier = 'heavy';
  if (e.key === 'r' || e.key === 'R') refillPouch();
  if (e.key === 't' || e.key === 'T') resetRange();
  if (e.key === 'y' || e.key === 'Y') backToLine();
  if (!locked()) {
    if (e.key === 'ArrowLeft') loadVariant(currentIndex - 1);
    if (e.key === 'ArrowRight') loadVariant(currentIndex + 1);
    if (e.key === 'F1') loadVariant(0);
  }
});

// --------------------------------------------------------------- selftest ---

/**
 * Smoke test with a hand on the tiller: it aims properly rather than hoping.
 *
 * Solve the launch elevation for a target at horizontal distance d and height
 * difference h, at the preset's own speed and arc weight. The flat solution is
 * the one a player would take. No solution means the preset genuinely cannot
 * reach that far — which is a finding, not a failure.
 */
const launchPitch = (d: number, h: number, v: number, g: number): number | null => {
  if (g <= 0.0001) return Math.atan2(h, d);
  const disc = v * v * v * v - g * (g * d * d + 2 * h * v * v);
  if (disc < 0) return null;
  return Math.atan((v * v - Math.sqrt(disc)) / (g * d));
};

const testAim = new pc.Vec3();

/** Point aimOverride at a target, compensating for drop. False if unreachable. */
const aimAt = (t: Target): boolean => {
  const to = t.entity.getPosition();
  const from = camera.getPosition();
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  const h = to.y - (from.y - 0.12);
  const pitch = launchPitch(d, h, shotSpeed(), WALK.gravity * cfg.arcGravity);
  if (pitch === null) return false;
  const flat = Math.cos(pitch);
  testAim.set((dx / d) * flat, Math.sin(pitch), (dz / d) * flat).normalize();
  aimOverride = testAim;
  return true;
};

let testPhase = 0;
/**
 * Frames, not seconds. Headless Chrome runs on virtual time, so wall-clock
 * pacing collapses: every frame arrives "0.6s later" and the whole test fires
 * in a handful of frames with the physics barely stepped. Counting frames
 * paces the test identically headless and on a real machine.
 */
let testFrames = 0;
const SHOT_EVERY = 30;
let pendingShot: { shot: Shot | undefined; before: number; at: number } | null = null;

const finishSelftest = (): void => {
  testPhase = 99;
  aimOverride = null;
  frozen = true;
  log('(frozen — selftest done)');
};

const runSelftest = (): void => {
  testFrames += 1;

  if (testPhase === 0) {
    overlay.classList.add('hidden');
    $('selftest-log').classList.remove('hidden');
    tier = 'medium';
    // Reach report: which dummies this preset can even get to from the line.
    drawT = cfg.drawTime;
    const v = shotSpeed();
    const g = WALK.gravity * cfg.arcGravity;
    const reach = dummyTargets
      .map((t) => {
        const to = t.entity.getPosition();
        const d = Math.hypot(to.x - SPAWN.x, to.z - SPAWN.z);
        return `${t.range}m ${launchPitch(d, to.y - SPAWN.y, v, g) === null ? 'NO' : 'ok'}`;
      })
      .join('  ');
    log(`${cfg.key} ${cfg.name}: ${v.toFixed(0)} m/s, arc ${cfg.arcGravity}`);
    log(`reach from the line — ${reach}`);
    const near = dummyTargets[0];
    const to = near.entity.getPosition();
    player.rigidbody?.teleport(new pc.Vec3(to.x, 1.4, to.z + 10));
    testPhase = 1;
    testFrames = 0;
    return;
  }

  if (testPhase !== 1) return;

  // Report the previous shot once it has had time to land.
  if (pendingShot && testFrames - pendingShot.at > SHOT_EVERY - 2) {
    const { shot, before } = pendingShot;
    pendingShot = null;
    const hit = shotsHit > before;
    const m = shot?.miss;
    const to = dummyTargets[0].entity.getPosition();
    log(
      `shot ${shotsFired} @${lastSpeed.toFixed(0)} m/s — ${hit ? 'HIT' : 'miss'}` +
        (hit || !m
          ? ''
          : ` by ${m.at.toFixed(2)}m (dy ${(m.pos.y - to.y).toFixed(2)}, dz ${(m.pos.z - to.z).toFixed(2)})`)
    );  }

  if (dummiesDowned > 0) {
    log(`PASS dummy down after ${shotsHit} hits, ${shotsFired} shots (${lastFlight.toFixed(2)}s flight at ${lastRange}m)`);
    finishSelftest();
    return;
  }
  if (shotsFired >= 6 && !pendingShot) {
    log(`FAIL ${shotsHit} hits from ${shotsFired} shots — never downed it`);
    finishSelftest();
    return;
  }

  if (testFrames % SHOT_EVERY !== 0) return;

  refillPouch();
  cooldown = 0;
  drawT = cfg.drawTime;
  // Clear the previous ball: it comes to rest against the dummy and blocks the
  // next identical shot. Real play never repeats a line this exactly.
  while (shots.length) shots.pop()?.entity.destroy();
  const before = shotsHit;
  if (!aimAt(dummyTargets[0])) {
    log('FAIL cannot even reach 10 m');
    finishSelftest();
    return;
  }
  fire();
  aimOverride = null;
  pendingShot = { shot: shots[shots.length - 1], before, at: testFrames };
};

// ------------------------------------------------------------------ update --

// Handle for poking at it from the browser console (and the selftest).
(window as unknown as Record<string, unknown>).__sling = { app, cfg, targets, shots, TIERS };

// A prototype page left open in a background tab or an unfocused side panel
// still renders and steps physics at full rate. The guard prototype wedged the
// machine this way, and `visibilitychange` alone does not catch it: a panel
// that is merely unfocused is still "visible". Idle out on blur as well, and
// stop rendering too — timeScale only stops physics, not the GPU work.
const idle = (): void => {
  paused = true;
  app.autoRender = false;
  app.timeScale = 0;
};

const wake = (): void => {
  if (frozen) return;
  paused = false;
  app.autoRender = true;
};

document.addEventListener('visibilitychange', () => {
  if (document.hidden) idle();
  else wake();
});
window.addEventListener('blur', idle);
window.addEventListener('focus', wake);

const hudCache = new Map<string, string>();
const hud = (id: string, text: string): void => {
  if (hudCache.get(id) === text) return;
  hudCache.set(id, text);
  $(id).textContent = text;
};

const crosshairEl = $('crosshair');
const meterEl = $('draw-meter');
const fillEl = $('draw-fill');
const pouchEl = $('pouch');
const bannerEl = $('range-banner');
const tierEls = Array.from($('tier-bar').querySelectorAll('span')) as HTMLElement[];

app.on('update', (rawDt: number) => {
  const now = Date.now();

  // A finished selftest has nothing left to do. Freezing here rather than in
  // finishSelftest matters: this handler runs every frame, so assigning
  // timeScale unconditionally below would immediately undo the freeze.
  if (frozen) {
    app.timeScale = 0;
    app.autoRender = false;
    return;
  }

  app.timeScale = paused ? 0 : now < hitStopUntil ? 0.12 : 1;
  if (paused) return;

  const dt = Math.min(rawDt, 0.05);

  if (cooldown > 0) cooldown = Math.max(0, cooldown - dt);
  if (drawing) drawT = Math.min(drawT + dt, cfg.drawTime);
  const ch = drawing ? charge() : 0;

  // Drawing plants your feet.
  if (fpc) fpc.speedGround = WALK.walkSpeed * (drawing ? cfg.drawSlow : 1);

  // Sliding plate.
  targets.forEach((t) => {
    if (!t.slide || t.down) return;
    t.slide.phase += dt * t.slide.speed;
    const x = t.slide.centre + Math.sin(t.slide.phase) * t.slide.span;
    t.entity.rigidbody?.teleport(x, t.home.y, t.home.z);
  });

  stepShots(dt);

  // Flash decay.
  for (const t of targets) {
    if (t.flashUntil && now > t.flashUntil) {
      t.flashUntil = 0;
      if (t.entity.render && !t.down) t.entity.render.material = t.base;
    }
  }

  // Camera: shake, draw sink, FOV pull.
  shakeAmount = Math.max(0, shakeAmount - dt * 2.2);
  if (shakeAmount > 0.0005) {
    shakeOffset.set(
      (Math.random() - 0.5) * shakeAmount,
      (Math.random() - 0.5) * shakeAmount,
      (Math.random() - 0.5) * shakeAmount * 0.4
    );
  } else {
    shakeOffset.set(0, 0, 0);
  }
  const sink = ch * 0.06;
  camera.setLocalPosition(shakeOffset.x, camBaseY - sink + shakeOffset.y, shakeOffset.z);
  if (camera.camera) camera.camera.fov = WALK.fov - cfg.fovPull * ch;

  // Sling viewmodel: the pouch pulls back, down and inward toward your cheek as
  // the band stretches. Pouch and ball share one position — the point the bands
  // tie to — so the whole assembly travels back together. The sling is held out
  // at the right hip, so a straight-back pull walks the ball off the edge of the
  // screen; drifting it inward keeps it framed and reads as a real anchor.
  slingAmmo.render!.material = AMMO_MAT[tier];
  pouchLocal.set(-ch * 0.06, 0.135 - ch * 0.09, 0.05 + ch * 0.07);
  cupLocal.copy(pouchLocal);
  cupLocal.z += POUCH_BACK;
  slingPouch.setLocalPosition(cupLocal);
  slingAmmo.setLocalPosition(pouchLocal);
  // An empty pouch still hangs there — only the ammo disappears.
  slingAmmo.enabled = canAfford(tier);
  layBand(bandL, BAND_TIP_L);
  layBand(bandR, BAND_TIP_R);
  sling.setLocalPosition(0.26 - ch * 0.03, -0.24 - ch * 0.02, -0.55 + ch * 0.05);

  // Aim aids.
  const wantArc = cfg.aimMode !== 'dot' && (drawing || cfg.drawTime <= 0.01) && locked();
  if (wantArc) drawArc();
  else hideArc();
  crosshairEl.style.display = cfg.aimMode === 'arc' ? 'none' : '';

  // Tracer trail: cheap, so only when they ask for it.
  if (FEEDBACK.tracer) {
    for (const shot of shots) {
      if (Math.random() < 0.5) continue;
      const p = shot.entity.getPosition();
      const dot = new pc.Entity('tracer');
      dot.addComponent('render', { type: 'sphere', material: TRACE_MAT });
      dot.setLocalScale(0.05, 0.05, 0.05);
      dot.setPosition(p);
      app.root.addChild(dot);
      window.setTimeout(() => dot.destroy(), 700);
    }
  }

  if (player.getPosition().y < -5) backToLine();

  // --- HUD ---

  if (markerUntil && now > markerUntil) {
    markerUntil = 0;
    markerEl.classList.remove('on');
  }
  if (toastUntil && now > toastUntil) {
    toastUntil = 0;
    toastEl.classList.remove('on');
  }

  const meterOn = drawing && cfg.drawTime > 0.01;
  meterEl.classList.toggle('on', meterOn);
  meterEl.classList.toggle('full', ch >= 0.999);
  if (meterOn) fillEl.style.width = `${(ch * 100).toFixed(0)}%`;

  crosshairEl.classList.toggle('drawing', drawing);
  crosshairEl.classList.toggle('empty', !canAfford(tier));

  const pouchKey = `${pouch}`;
  if (hudCache.get('pouch') !== pouchKey) {
    hudCache.set('pouch', pouchKey);
    pouchEl.innerHTML = Array.from({ length: POUCH_SLOTS }, (_, i) =>
      i < pouch ? '<i></i>' : '<i class="spent"></i>'
    ).join('');
  }

  if (hudCache.get('tier') !== tier || hudCache.get('tierAfford') !== pouchKey) {
    hudCache.set('tier', tier);
    hudCache.set('tierAfford', pouchKey);
    tierEls.forEach((el) => {
      const key = el.dataset.tier as TierKey;
      el.classList.toggle('on', key === tier);
      el.classList.toggle('broke', !canAfford(key));
    });
  }

  if (rangeRunning && dummiesDowned < dummyTargets.length) rangeClock += dt;
  if (rangeRunning && dummiesDowned >= dummyTargets.length) {
    rangeRunning = false;
    if (bestClear === null || rangeClock < bestClear) bestClear = rangeClock;
    toast(`Range clear in ${rangeClock.toFixed(1)}s`);
  }
  const standing = dummyTargets.filter((t) => !t.down).length;
  if (hudCache.get('banner') !== String(standing)) {
    hudCache.set('banner', String(standing));
    bannerEl.textContent = standing === 0 ? 'RANGE CLEAR' : `DUMMIES STANDING ${standing}`;
    bannerEl.classList.toggle('clear', standing === 0);
  }

  hud('r-draw', cfg.drawTime <= 0.01 ? 'no charge' : `${(ch * 100).toFixed(0)}%`);
  hud('r-speed', (drawing ? shotSpeed() : lastSpeed).toFixed(1));
  hud('r-range', lastRange ? String(lastRange) : '–');
  hud('r-flight', lastFlight ? lastFlight.toFixed(2) : '–');
  hud('r-acc', `${shotsHit} / ${shotsFired}`);
  hud('r-pct', shotsFired ? `${Math.round((shotsHit / shotsFired) * 100)}%` : '–');
  hud('r-kills', `${dummiesDowned} / ${dummyTargets.length}`);
  hud('r-clock', rangeClock.toFixed(1));
  hud('r-best', bestClear === null ? '–' : `${bestClear.toFixed(1)} s`);

  if (selftest) runSelftest();
});
