/**
 * THROWAWAY PROTOTYPE — Instructions Not Included
 *
 * Question (issue #15): is a robot security guard fun to be hunted by, and
 * satisfying to take down?
 *
 * One guard on a grey-box slice of FLATPÄK SKRÄPBO. It patrols a waypoint
 * route, spots you with a vision cone, charges, hits you on contact, and dies
 * when hit enough. Three personality presets (?variant=A|B|C) plus live
 * sliders, so the boys can tune speed / eyesight / toughness at the keyboard.
 *
 * Player movement is the settled Aisle Runner feel from issue #12 — it is not
 * up for tuning here.
 *
 * The SLINGSHOT IS A PLACEHOLDER: left click lobs a grey ball so the guard can
 * be shot at all. How shooting itself feels is issue #13; nothing about the
 * projectile here is a decision.
 *
 * Not production code: no tests, no abstractions, one file on purpose.
 * Run with `npm run prototype:guard`.
 */
import * as pc from 'playcanvas';
import { FirstPersonController } from 'playcanvas/scripts/esm/first-person-controller.mjs';
import './walk-feel.css';
import './guard-feel.css';

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

// ---------------------------------------------------------------- variants --

type DeathStyle = 'topple' | 'flatpack' | 'pop';

type Guard = {
  key: string;
  name: string;
  blurb: string;
  patrolSpeed: number;
  chaseSpeed: number;
  turnRate: number;
  sightRange: number;
  coneAngle: number;
  spotTime: number;
  loseTime: number;
  searchTime: number;
  pauseTime: number;
  attackRange: number;
  attackCooldown: number;
  knockback: number;
  hitsToKill: number;
  staggerTime: number;
  guardHeight: number;
  deathStyle: DeathStyle;
};

const VARIANTS: Guard[] = [
  {
    key: 'A',
    name: 'Night Shift',
    blurb: 'Slow, short-sighted, easy to lose. Spooky rather than dangerous.',
    patrolSpeed: 1.4,
    chaseSpeed: 3.2,
    turnRate: 120,
    sightRange: 9,
    coneAngle: 70,
    spotTime: 0.8,
    loseTime: 2.5,
    searchTime: 5,
    pauseTime: 1.6,
    attackRange: 1.4,
    attackCooldown: 1.6,
    knockback: 320,
    hitsToKill: 2,
    staggerTime: 0.45,
    guardHeight: 1.9,
    deathStyle: 'topple'
  },
  {
    key: 'B',
    name: 'Floor Manager',
    blurb: 'Brisk and nosy. Sees you down an aisle and commits. The default.',
    patrolSpeed: 2.2,
    chaseSpeed: 5,
    turnRate: 220,
    sightRange: 15,
    coneAngle: 95,
    spotTime: 0.45,
    loseTime: 3.5,
    searchTime: 7,
    pauseTime: 1,
    attackRange: 1.5,
    attackCooldown: 1.2,
    knockback: 450,
    hitsToKill: 3,
    staggerTime: 0.3,
    guardHeight: 2.1,
    deathStyle: 'flatpack'
  },
  {
    key: 'C',
    name: 'Loss Prevention',
    blurb: 'Fast, wide-eyed, relentless. Outrunning it is the only option.',
    patrolSpeed: 3,
    chaseSpeed: 7,
    turnRate: 400,
    sightRange: 22,
    coneAngle: 130,
    spotTime: 0.15,
    loseTime: 5,
    searchTime: 10,
    pauseTime: 0.4,
    attackRange: 1.7,
    attackCooldown: 0.9,
    knockback: 620,
    hitsToKill: 5,
    staggerTime: 0.15,
    guardHeight: 2.4,
    deathStyle: 'pop'
  }
];

const params = new URLSearchParams(window.location.search);
const startKey = (params.get('variant') ?? 'B').toUpperCase();
const startIndex = Math.max(
  0,
  VARIANTS.findIndex((g) => g.key === startKey)
);

const guardCfg: Guard = { ...VARIANTS[startIndex] };

// ?selftest=1 drives the whole loop without a human — see runSelftest below.
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

const GREY_FLOOR = mat(0.42, 0.42, 0.44);
const GREY_WALL = mat(0.62, 0.62, 0.64);
const GREY_SHELF = mat(0.74, 0.72, 0.68);
const GREY_PROP = mat(0.86, 0.86, 0.86);
const BLUE = mat(0.15, 0.32, 0.62);
const YELLOW = mat(0.9, 0.75, 0.12);

// Guard body colour doubles as the state readout you can see from across the
// showroom — the boys should never need the badge to know they've been made.
const GUARD_CALM = mat(0.36, 0.4, 0.5);
const GUARD_SUSPICIOUS = mat(0.85, 0.7, 0.12);
const GUARD_ANGRY = mat(0.78, 0.16, 0.14);
const GUARD_SEARCH = mat(0.85, 0.45, 0.12);
const GUARD_DEAD = mat(0.25, 0.26, 0.3);
const GUARD_HURT = mat(1, 1, 1);

const glass = (r: number, g: number, b: number, opacity: number): pc.StandardMaterial => {
  const m = new pc.StandardMaterial();
  m.diffuse = new pc.Color(0, 0, 0);
  m.emissive = new pc.Color(r, g, b);
  m.opacity = opacity;
  m.blendType = pc.BLEND_NORMAL;
  m.depthWrite = false;
  m.cull = pc.CULLFACE_NONE;
  m.useLighting = false;
  m.update();
  return m;
};

const CONE_CALM = glass(0.9, 0.9, 0.5, 0.1);
const CONE_ANGRY = glass(1, 0.2, 0.2, 0.16);

// ------------------------------------------------------------------ scene ---

const staticBox = (
  name: string,
  material: pc.StandardMaterial,
  pos: [number, number, number],
  scale: [number, number, number]
): pc.Entity => {
  const e = new pc.Entity(name);
  e.addComponent('render', { type: 'box', material });
  e.setPosition(pos[0], pos[1], pos[2]);
  e.setLocalScale(scale[0], scale[1], scale[2]);
  e.addComponent('collision', {
    type: 'box',
    halfExtents: new pc.Vec3(scale[0] / 2, scale[1] / 2, scale[2] / 2)
  });
  e.addComponent('rigidbody', { type: 'static', friction: 0.6, restitution: 0 });
  app.root.addChild(e);
  return e;
};

const FLOOR_W = 40;
const FLOOR_D = 32;

staticBox('floor', GREY_FLOOR, [0, -0.5, 0], [FLOOR_W, 1, FLOOR_D]);
staticBox('wall-n', GREY_WALL, [0, 2, -FLOOR_D / 2], [FLOOR_W, 4, 0.5]);
staticBox('wall-s', GREY_WALL, [0, 2, FLOOR_D / 2], [FLOOR_W, 4, 0.5]);
staticBox('wall-w', GREY_WALL, [-FLOOR_W / 2, 2, 0], [0.5, 4, FLOOR_D]);
staticBox('wall-e', GREY_WALL, [FLOOR_W / 2, 2, 0], [0.5, 4, FLOOR_D]);

// Four shelf runs making three long aisles plus a cross-aisle: enough to break
// line of sight, enough to get cornered in.
staticBox('shelf-a', GREY_SHELF, [-11, 1, -4], [1.4, 2, 17]);
staticBox('shelf-b', GREY_SHELF, [-3.5, 1, -4], [1.4, 2, 17]);
staticBox('shelf-c', GREY_SHELF, [4, 1, -4], [1.4, 2, 17]);
staticBox('shelf-d', GREY_SHELF, [11.5, 1, -4], [1.4, 2, 17]);

// A low display run you can see over but not walk through, and two islands
// that make blind corners for the guard to come round.
staticBox('low-run', GREY_SHELF, [0, 0.5, 10], [22, 1, 1.2]);
staticBox('island-w', GREY_SHELF, [-16, 1, 6], [4, 2, 4]);
staticBox('island-e', GREY_SHELF, [16, 1, 6], [4, 2, 4]);

// The back room: a dead end. Being chased in here should feel like a mistake.
staticBox('deadend-w', GREY_WALL, [-6, 1.5, -13], [12, 3, 0.6]);
staticBox('deadend-e', GREY_WALL, [9, 1.5, -13], [14, 3, 0.6]);

const CLUTTER: Array<[number, number, number]> = [
  [-7.5, 0.35, 2],
  [0.2, 0.35, -6],
  [7.8, 0.35, 4],
  [-14, 0.35, -2],
  [14, 0.35, -6],
  [1.5, 0.35, 12]
];
CLUTTER.forEach(([x, y, z], i) => {
  const e = new pc.Entity(`flatpack-${i}`);
  e.addComponent('render', { type: 'box', material: GREY_PROP });
  e.setPosition(x, y, z);
  e.setLocalScale(0.7, 0.7, 0.7);
  e.addComponent('collision', { type: 'box', halfExtents: new pc.Vec3(0.35, 0.35, 0.35) });
  e.addComponent('rigidbody', { type: 'dynamic', mass: 8, friction: 0.7, restitution: 0.1 });
  app.root.addChild(e);
});

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
const CAPSULE_HEIGHT = WALK.eyeHeight + 0.1;
const SPAWN = new pc.Vec3(0, 1.4, 13);

const camera = new pc.Entity('camera');
camera.addComponent('camera', {
  clearColor: new pc.Color(0.09, 0.11, 0.17),
  fov: WALK.fov,
  farClip: 200,
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
player.setPosition(SPAWN);

const camBaseY = CAPSULE_HEIGHT / 2 - 0.1;
camera.setLocalPosition(0, camBaseY, 0);

player.script?.create(FirstPersonController, {
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
});

// ------------------------------------------------------------------ guard ---

const GUARD_RADIUS = 0.45;
const WAYPOINTS: Array<[number, number]> = [
  [-7.5, 8],
  [-7.5, -11],
  [0.2, -11],
  [0.2, 8],
  [7.8, 8],
  [7.8, -11],
  [15, -11],
  [15, 8]
];

// Yellow floor pips showing the route, mostly for the top-down view.
WAYPOINTS.forEach(([x, z], i) => {
  const pip = new pc.Entity(`waypoint-${i}`);
  pip.addComponent('render', { type: 'box', material: YELLOW });
  pip.setPosition(x, 0.02, z);
  pip.setLocalScale(0.8, 0.04, 0.8);
  app.root.addChild(pip);
});

const guard = new pc.Entity('guard');
guard.addComponent('render', { type: 'capsule', material: GUARD_CALM });
guard.addComponent('collision', { type: 'capsule', radius: GUARD_RADIUS, height: guardCfg.guardHeight });
guard.addComponent('rigidbody', { type: 'kinematic', friction: 0.6, restitution: 0 });
app.root.addChild(guard);

// A blue "eye" band so you can read which way it is facing at a glance.
const visor = new pc.Entity('visor');
visor.addComponent('render', { type: 'box', material: BLUE });
guard.addChild(visor);

// The vision cone, drawn from the eye. Apex at the guard, mouth pointing
// forward (-Z), so what it can see is literally visible. Toggle with V.
const cone = new pc.Entity('vision-cone');
cone.addComponent('render', { type: 'cone', material: CONE_CALM, castShadows: false });
cone.setLocalEulerAngles(90, 0, 0);
guard.addChild(cone);

type GuardState = 'patrol' | 'suspicious' | 'chase' | 'search' | 'down';

const g = {
  state: 'patrol' as GuardState,
  yaw: 180,
  waypoint: 0,
  pauseLeft: 0,
  seeing: 0,
  unseen: 0,
  searchLeft: 0,
  staggerLeft: 0,
  attackLeft: 0,
  hits: 0,
  lastKnown: new pc.Vec3(),
  deathAt: 0,
  scanFrom: 0,
  scanTo: 0
};

/** Rebuild guard geometry from the current config. Called on every slider move. */
const applyGuardShape = (): void => {
  const h = guardCfg.guardHeight;
  guard.setLocalScale(GUARD_RADIUS * 2, h / 2, GUARD_RADIUS * 2);
  if (guard.collision) {
    guard.collision.height = h;
    guard.collision.radius = GUARD_RADIUS;
  }
  // Children are in the parent's squashed local space, so undo that scale.
  const eyeLocalY = 0.62;
  visor.setLocalScale(1.02, 0.14 / (h / 2), 0.55);
  visor.setLocalPosition(0, eyeLocalY, -0.52);

  const range = guardCfg.sightRange;
  const mouth = 2 * Math.tan((guardCfg.coneAngle / 2) * pc.math.DEG_TO_RAD) * range;
  cone.setLocalScale(mouth / (GUARD_RADIUS * 2), range / (h / 2), mouth / (GUARD_RADIUS * 2));
  cone.setLocalPosition(0, eyeLocalY, -(range / 2) / (GUARD_RADIUS * 2));
};

const eyePosition = (): pc.Vec3 => {
  const p = guard.getPosition();
  return new pc.Vec3(p.x, p.y + guardCfg.guardHeight * 0.31, p.z);
};

const setGuardMaterial = (m: pc.StandardMaterial): void => {
  if (guard.render) guard.render.material = m;
};

const stateMaterial = (): pc.StandardMaterial => {
  if (g.state === 'down') return GUARD_DEAD;
  if (g.state === 'chase') return GUARD_ANGRY;
  if (g.state === 'suspicious') return GUARD_SUSPICIOUS;
  if (g.state === 'search') return GUARD_SEARCH;
  return GUARD_CALM;
};

const setState = (next: GuardState): void => {
  if (g.state === next) return;
  g.state = next;
  setGuardMaterial(stateMaterial());
  if (cone.render) cone.render.material = next === 'chase' || next === 'suspicious' ? CONE_ANGRY : CONE_CALM;
  log(`guard → ${next.toUpperCase()}`);
};

// --------------------------------------------------------- guard senses -----

const losFrom = new pc.Vec3();
const losTo = new pc.Vec3();

/** Distance + cone + line of sight. The three checks from the #7 research. */
const canSeePlayer = (): boolean => {
  if (g.state === 'down') return false;
  const eye = eyePosition();
  const p = player.getPosition();
  const dx = p.x - eye.x;
  const dz = p.z - eye.z;
  const dist = Math.hypot(dx, dz);
  if (dist > guardCfg.sightRange) return false;

  const toPlayer = Math.atan2(-dx, -dz) * pc.math.RAD_TO_DEG;
  const delta = Math.abs(((toPlayer - g.yaw + 540) % 360) - 180);
  if (delta > guardCfg.coneAngle / 2) return false;

  // Start the ray outside our own capsule so we don't hit ourselves.
  const nx = dx / dist;
  const nz = dz / dist;
  losFrom.set(eye.x + nx * (GUARD_RADIUS + 0.1), eye.y, eye.z + nz * (GUARD_RADIUS + 0.1));
  losTo.set(p.x, p.y, p.z);
  const hit = physics.raycastFirst(losFrom, losTo);
  return !hit || hit.entity === player;
};

const distanceToPlayer = (): number => {
  const a = guard.getPosition();
  const b = player.getPosition();
  return Math.hypot(b.x - a.x, b.z - a.z);
};

// --------------------------------------------------------- guard movement ---

const moveTo = new pc.Vec3();

/** Turn `yaw` toward `target` no faster than turnRate, and report if aimed. */
const steerYaw = (targetYaw: number, dt: number): boolean => {
  const delta = ((targetYaw - g.yaw + 540) % 360) - 180;
  const max = guardCfg.turnRate * dt;
  if (Math.abs(delta) <= max) {
    g.yaw = targetYaw;
    return true;
  }
  g.yaw += Math.sign(delta) * max;
  return false;
};

const blockedAhead = (dirX: number, dirZ: number, reach: number): boolean => {
  const eye = eyePosition();
  losFrom.set(eye.x + dirX * (GUARD_RADIUS + 0.05), 0.6, eye.z + dirZ * (GUARD_RADIUS + 0.05));
  losTo.set(losFrom.x + dirX * reach, 0.6, losFrom.z + dirZ * reach);
  const hit = physics.raycastFirst(losFrom, losTo);
  return !!hit && hit.entity !== player;
};

/**
 * Walk toward a point at `speed`. Direct steering plus two whiskers: if the way
 * ahead is blocked, slide around it. Enough for a waypoint route and a straight
 * charge; `recast-navigation` is the upgrade path (#7).
 */
const walkToward = (target: pc.Vec3, speed: number, dt: number): number => {
  const pos = guard.getPosition();
  let dx = target.x - pos.x;
  let dz = target.z - pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.001) return 0;
  dx /= dist;
  dz /= dist;

  const desiredYaw = Math.atan2(-dx, -dz) * pc.math.RAD_TO_DEG;
  steerYaw(desiredYaw, dt);

  if (blockedAhead(dx, dz, 1.1)) {
    let slid = false;
    for (const sign of [1, -1]) {
      const a = 55 * sign * pc.math.DEG_TO_RAD;
      const sx = dx * Math.cos(a) - dz * Math.sin(a);
      const sz = dx * Math.sin(a) + dz * Math.cos(a);
      if (!blockedAhead(sx, sz, 1.1)) {
        dx = sx;
        dz = sz;
        slid = true;
        break;
      }
    }
    if (!slid) return dist;
  }

  const step = speed * dt;
  moveTo.set(pos.x + dx * step, guardCfg.guardHeight / 2, pos.z + dz * step);
  guard.rigidbody?.teleport(moveTo);
  return dist;
};

// ------------------------------------------------------- player condition ---

const MAX_HEARTS = 3;
let hearts = MAX_HEARTS;
let guardKills = 0;
let chaseSeconds = 0;
let dead = false;

const knockDir = new pc.Vec3();

const hitPlayer = (): void => {
  if (dead) return;
  hearts -= 1;
  const a = guard.getPosition();
  const b = player.getPosition();
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  knockDir.set((dx / len) * guardCfg.knockback, guardCfg.knockback * 0.35, (dz / len) * guardCfg.knockback);
  player.rigidbody?.applyImpulse(knockDir);

  const flash = $('damage-flash');
  flash.classList.add('on');
  window.setTimeout(() => flash.classList.remove('on'), 90);

  log(`you took a hit (${hearts} left)`);
  if (hearts <= 0) {
    dead = true;
    $('gameover').classList.remove('hidden');
    log('GAME OVER');
  }
};

// ---------------------------------------------------------- guard damage ----

const debris: pc.Entity[] = [];

const clearDebris = (): void => {
  debris.splice(0).forEach((d) => d.destroy());
};

const killGuard = (): void => {
  setState('down');
  g.deathAt = Date.now();
  guardKills += 1;
  if (cone.render) cone.render.enabled = false;

  if (guardCfg.deathStyle === 'topple' && guard.rigidbody) {
    // Let physics do the work: hand the capsule over to the sim and shove it.
    guard.rigidbody.type = 'dynamic';
    guard.rigidbody.mass = 70;
    const a = guard.getPosition();
    const b = player.getPosition();
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    const len = Math.hypot(dx, dz) || 1;
    guard.rigidbody.applyImpulse((dx / len) * 260, 120, (dz / len) * 260);
    guard.rigidbody.applyTorqueImpulse(-(dz / len) * 220, 0, (dx / len) * 220);
  }

  if (guardCfg.deathStyle === 'pop') {
    const p = guard.getPosition();
    for (let i = 0; i < 8; i += 1) {
      const bit = new pc.Entity(`bit-${i}`);
      bit.addComponent('render', { type: 'box', material: GUARD_DEAD });
      bit.setPosition(p.x + (Math.random() - 0.5), p.y + Math.random() * 1.2, p.z + (Math.random() - 0.5));
      bit.setLocalScale(0.22, 0.22, 0.22);
      bit.addComponent('collision', { type: 'box', halfExtents: new pc.Vec3(0.11, 0.11, 0.11) });
      bit.addComponent('rigidbody', { type: 'dynamic', mass: 1, restitution: 0.4 });
      app.root.addChild(bit);
      bit.rigidbody?.applyImpulse(
        (Math.random() - 0.5) * 6,
        2 + Math.random() * 4,
        (Math.random() - 0.5) * 6
      );
      debris.push(bit);
    }
    if (guard.render) guard.render.enabled = false;
  }

  log(`guard DOWN after ${g.hits} hit${g.hits === 1 ? '' : 's'} (${guardCfg.deathStyle})`);
};

const damageGuard = (): void => {
  if (g.state === 'down') return;
  g.hits += 1;
  g.staggerLeft = guardCfg.staggerTime;
  setGuardMaterial(GUARD_HURT);
  // Being shot is being spotted: it should never be a free hit.
  if (g.state === 'patrol' || g.state === 'search') {
    g.lastKnown.copy(player.getPosition());
    setState('chase');
  }
  if (g.hits >= guardCfg.hitsToKill) killGuard();
};

const reviveGuard = (): void => {
  clearDebris();
  g.hits = 0;
  g.seeing = 0;
  g.unseen = 0;
  g.staggerLeft = 0;
  g.attackLeft = 0;
  g.waypoint = 0;
  g.pauseLeft = 0;
  if (guard.rigidbody) {
    guard.rigidbody.type = 'kinematic';
    guard.rigidbody.teleport(WAYPOINTS[0][0], guardCfg.guardHeight / 2, WAYPOINTS[0][1]);
  }
  guard.setEulerAngles(0, 180, 0);
  g.yaw = 180;
  if (guard.render) guard.render.enabled = true;
  if (cone.render) cone.render.enabled = coneVisible;
  g.state = 'chase';
  setState('patrol');
  setGuardMaterial(GUARD_CALM);
};

// ------------------------------------------------- placeholder projectile ---

type Shot = { entity: pc.Entity; born: number; spent: boolean };
const shots: Shot[] = [];
let shotsFired = 0;

const fire = (): void => {
  if (dead) return;
  shotsFired += 1;
  const origin = camera.getPosition();
  const forward = camera.forward;

  const ball = new pc.Entity('shot');
  ball.addComponent('render', { type: 'sphere', material: YELLOW });
  ball.setLocalScale(0.24, 0.24, 0.24);
  ball.setPosition(origin.x + forward.x * 0.7, origin.y + forward.y * 0.7, origin.z + forward.z * 0.7);
  ball.addComponent('collision', { type: 'sphere', radius: 0.12 });
  ball.addComponent('rigidbody', { type: 'dynamic', mass: 2, restitution: 0.35, friction: 0.5 });
  app.root.addChild(ball);
  ball.rigidbody?.applyImpulse(forward.x * 44, forward.y * 44 + 4, forward.z * 44);

  const shot: Shot = { entity: ball, born: Date.now(), spent: false };
  shots.push(shot);

  // Stay well inside the ~40 dynamic body budget from the #5 research.
  while (shots.length > 12) {
    const old = shots.shift();
    old?.entity.destroy();
  }
};

/**
 * Hit detection by proximity rather than contact events: with a kinematic
 * guard, contact callbacks are unreliable at speed, and the ball is small and
 * fast enough to tunnel. Good enough to answer "is killing it satisfying".
 */
const resolveShots = (): void => {
  const gp = guard.getPosition();
  const reach = GUARD_RADIUS + 0.35;
  for (let i = shots.length - 1; i >= 0; i -= 1) {
    const shot = shots[i];
    const p = shot.entity.getPosition();
    if (!shot.spent && g.state !== 'down') {
      const dy = Math.abs(p.y - gp.y);
      const flat = Math.hypot(p.x - gp.x, p.z - gp.z);
      if (flat < reach && dy < guardCfg.guardHeight / 2 + 0.2) {
        shot.spent = true;
        damageGuard();
      }
    }
    if (Date.now() - shot.born > 9000 || p.y < -4) {
      shot.entity.destroy();
      shots.splice(i, 1);
    }
  }
};

// -------------------------------------------------------------------- HUD ---

const ui = document.createElement('div');
ui.id = 'proto-ui';
ui.innerHTML = `
  <div id="crosshair"></div>
  <div id="damage-flash"></div>
  <div id="state-badge" class="patrol">PATROL</div>
  <div id="guard-health"></div>
  <div id="hearts"></div>
  <div id="readout">
    <div><b id="r-variant"></b></div>
    <div id="r-blurb" class="dim"></div>
    <div class="row"><span>guard state</span><b id="r-state">–</b></div>
    <div class="row"><span>distance</span><b id="r-dist">–</b> m</div>
    <div class="row"><span>can see you</span><b id="r-see">–</b></div>
    <div class="row"><span>hits landed</span><b id="r-hits">0</b></div>
    <div class="row"><span>shots fired</span><b id="r-shots">0</b></div>
    <div class="row"><span>time chased</span><b id="r-chase">0.0</b> s</div>
    <div class="row"><span>guards downed</span><b id="r-kills">0</b></div>
  </div>
  <div id="panel">
    <h2>Tuning <span class="dim">(Esc to free the mouse)</span></h2>
    <div id="sliders"></div>
    <label class="knob"><span class="knob-head">Death style</span></label>
    <select id="death-style">
      <option value="topple">Topple over (physics)</option>
      <option value="flatpack">Fold flat (flat-pack collapse)</option>
      <option value="pop">Burst into parts</option>
    </select>
    <div id="panel-actions">
      <button id="btn-reset">Reset preset</button>
      <button id="btn-revive">Revive guard (G)</button>
      <button id="btn-kill">Test death (K)</button>
      <button id="btn-spawn">Respawn me (R)</button>
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
  <div id="gameover" class="hidden"><div>
    <h1>THANK YOU FOR VISITING</h1>
    <p>Security escorted you out.</p>
    <p class="dim">Press R to go again.</p>
  </div></div>
  <div id="selftest-log" class="hidden"></div>
  <div id="click-to-play"><div>
    <h1>Get hunted in FLATPÄK SKRÄPBO</h1>
    <p>WASD · mouse to look · Shift to sprint · Space to jump · <b>Left click to shoot</b></p>
    <p>R respawn · G revive guard · K test death · M map · V hide the vision cone</p>
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
  while (logLines.length > 14) logLines.shift();
  if (selftest) $('selftest-log').textContent = logLines.join('\n');
}

type Knob = {
  label: string;
  key: keyof Omit<Guard, 'key' | 'name' | 'blurb' | 'deathStyle'>;
  min: number;
  max: number;
  step: number;
  hint: string;
};

const KNOBS: Knob[] = [
  { label: 'Patrol speed', key: 'patrolSpeed', min: 0.5, max: 5, step: 0.1, hint: 'm/s while it has not seen you' },
  { label: 'Chase speed', key: 'chaseSpeed', min: 1, max: 9, step: 0.1, hint: 'you run at ~7 m/s' },
  { label: 'Turn rate', key: 'turnRate', min: 45, max: 720, step: 5, hint: 'how fast it whips round' },
  { label: 'Sight range', key: 'sightRange', min: 3, max: 30, step: 0.5, hint: 'how far it can see' },
  { label: 'Vision cone', key: 'coneAngle', min: 20, max: 180, step: 5, hint: 'how wide its eyes are' },
  { label: 'Spot time', key: 'spotTime', min: 0, max: 2, step: 0.05, hint: 'seconds before it commits' },
  { label: 'Lose time', key: 'loseTime', min: 0.5, max: 8, step: 0.25, hint: 'seconds out of sight to shake it' },
  { label: 'Search time', key: 'searchTime', min: 0, max: 15, step: 0.5, hint: 'how long it hunts after losing you' },
  { label: 'Pause at stops', key: 'pauseTime', min: 0, max: 4, step: 0.2, hint: 'look around at each waypoint' },
  { label: 'Attack range', key: 'attackRange', min: 0.8, max: 3.5, step: 0.1, hint: 'how close is a hit' },
  { label: 'Attack cooldown', key: 'attackCooldown', min: 0.3, max: 3, step: 0.1, hint: 'seconds between hits' },
  { label: 'Knockback', key: 'knockback', min: 0, max: 1200, step: 20, hint: 'how hard it shoves you' },
  { label: 'Hits to kill', key: 'hitsToKill', min: 1, max: 8, step: 1, hint: 'shots it takes to go down' },
  { label: 'Stagger', key: 'staggerTime', min: 0, max: 1, step: 0.05, hint: 'seconds it reels when shot' },
  { label: 'Guard height', key: 'guardHeight', min: 1.2, max: 3, step: 0.1, hint: 'metres — how it looms' }
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
    guardCfg[knob.key] = Number(input.value);
    applyGuardShape();
    refreshPanel();
  });
  inputEls.set(knob.key, input);
  valueEls.set(knob.key, value);
  sliders.appendChild(wrap);
});

const deathSelect = $('death-style') as HTMLSelectElement;
deathSelect.addEventListener('change', () => {
  guardCfg.deathStyle = deathSelect.value as DeathStyle;
  refreshPanel();
});

const settingsJson = (): string =>
  JSON.stringify(
    {
      basedOn: `${guardCfg.key} — ${guardCfg.name}`,
      ...Object.fromEntries(KNOBS.map((k) => [k.key, guardCfg[k.key]])),
      deathStyle: guardCfg.deathStyle
    },
    null,
    2
  );

function refreshPanel(): void {
  KNOBS.forEach((knob) => {
    const raw = guardCfg[knob.key];
    const input = inputEls.get(knob.key);
    const value = valueEls.get(knob.key);
    if (input) input.value = String(raw);
    if (value) value.textContent = knob.step < 0.1 ? raw.toFixed(2) : String(raw);
  });
  deathSelect.value = guardCfg.deathStyle;
  $('r-variant').textContent = `${guardCfg.key} — ${guardCfg.name}`;
  $('r-blurb').textContent = guardCfg.blurb;
  $('switch-label').textContent = `${guardCfg.key} (${guardCfg.name})`;
  $('dump').textContent = settingsJson();
}

const respawnPlayer = (): void => {
  player.rigidbody?.teleport(SPAWN);
  if (player.rigidbody) player.rigidbody.linearVelocity = pc.Vec3.ZERO;
  hearts = MAX_HEARTS;
  dead = false;
  chaseSeconds = 0;
  $('gameover').classList.add('hidden');
};

let currentIndex = startIndex;

const loadVariant = (index: number): void => {
  const next = VARIANTS[(index + VARIANTS.length) % VARIANTS.length];
  Object.assign(guardCfg, next);
  currentIndex = VARIANTS.indexOf(next);
  const url = new URL(window.location.href);
  url.searchParams.set('variant', next.key);
  window.history.replaceState({}, '', url);
  applyGuardShape();
  refreshPanel();
  reviveGuard();
  respawnPlayer();
};

let coneVisible = params.get('cone') !== '0';

applyGuardShape();
refreshPanel();
reviveGuard();

$('prev').addEventListener('click', () => loadVariant(currentIndex - 1));
$('next').addEventListener('click', () => loadVariant(currentIndex + 1));
$('btn-reset').addEventListener('click', () => loadVariant(currentIndex));
$('btn-revive').addEventListener('click', reviveGuard);
$('btn-kill').addEventListener('click', killGuard);
$('btn-spawn').addEventListener('click', respawnPlayer);
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

app.mouse?.on(pc.EVENT_MOUSEDOWN, (e: pc.MouseEvent) => {
  if (e.button === pc.MOUSEBUTTON_LEFT && document.pointerLockElement === canvas) fire();
});

// A top-down look at the whole floor (M): patrol route, cone, and where the
// guard actually went when it lost you.
const mapCam = new pc.Entity('map-camera');
mapCam.addComponent('camera', {
  clearColor: new pc.Color(0.09, 0.11, 0.17),
  projection: pc.PROJECTION_ORTHOGRAPHIC,
  orthoHeight: 18,
  farClip: 200,
  enabled: params.get('top') === '1'
});
mapCam.setPosition(0, 40, 0);
mapCam.setEulerAngles(-90, 0, 0);
app.root.addChild(mapCam);
if (mapCam.camera?.enabled && camera.camera) camera.camera.enabled = false;

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  if (e.key === '1') loadVariant(0);
  if (e.key === '2') loadVariant(1);
  if (e.key === '3') loadVariant(2);
  if (e.key === 'r' || e.key === 'R') respawnPlayer();
  if (e.key === 'g' || e.key === 'G') reviveGuard();
  if (e.key === 'k' || e.key === 'K') killGuard();
  if (e.key === 'v' || e.key === 'V') {
    coneVisible = !coneVisible;
    if (cone.render) cone.render.enabled = coneVisible && g.state !== 'down';
  }
  if (e.key === 'm' || e.key === 'M') {
    if (!mapCam.camera || !camera.camera) return;
    mapCam.camera.enabled = !mapCam.camera.enabled;
    camera.camera.enabled = !mapCam.camera.enabled;
  }
  if (document.pointerLockElement !== canvas) {
    if (e.key === 'ArrowLeft') loadVariant(currentIndex - 1);
    if (e.key === 'ArrowRight') loadVariant(currentIndex + 1);
  }
});

// ------------------------------------------------------------- guard brain --

const waypointTarget = new pc.Vec3();

const tickGuard = (dt: number): void => {
  if (g.state === 'down') {
    if (guardCfg.deathStyle === 'flatpack') {
      // Fold: squash to a slab on the floor over about a third of a second.
      const t = Math.min((Date.now() - g.deathAt) / 350, 1);
      const h = guardCfg.guardHeight;
      guard.setLocalScale(
        GUARD_RADIUS * 2 * (1 + t * 0.6),
        (h / 2) * (1 - t * 0.92),
        GUARD_RADIUS * 2 * (1 + t * 0.6)
      );
      const p = guard.getPosition();
      guard.rigidbody?.teleport(p.x, (h / 2) * (1 - t * 0.92) * 0.5, p.z);
    }
    return;
  }

  const sees = canSeePlayer();
  if (sees) {
    g.seeing += dt;
    g.unseen = 0;
    g.lastKnown.copy(player.getPosition());
  } else {
    g.seeing = 0;
    g.unseen += dt;
  }

  if (g.staggerLeft > 0) {
    g.staggerLeft -= dt;
    if (g.staggerLeft <= 0) setGuardMaterial(stateMaterial());
    return;
  }

  if (g.attackLeft > 0) g.attackLeft -= dt;

  switch (g.state) {
    case 'patrol':
    case 'search': {
      if (sees) setState('suspicious');
      break;
    }
    case 'suspicious': {
      if (!sees) {
        setState(g.searchLeft > 0 ? 'search' : 'patrol');
      } else if (g.seeing >= guardCfg.spotTime) {
        setState('chase');
        chaseSeconds = 0;
      }
      break;
    }
    case 'chase': {
      if (g.unseen >= guardCfg.loseTime) {
        g.searchLeft = guardCfg.searchTime;
        setState('search');
      }
      break;
    }
    default:
      break;
  }

  if (g.state === 'chase') {
    chaseSeconds += dt;
    const dist = distanceToPlayer();
    if (dist <= guardCfg.attackRange) {
      // In range: square up and swing on cooldown instead of shoving past.
      const p = player.getPosition();
      const pos = guard.getPosition();
      steerYaw(Math.atan2(-(p.x - pos.x), -(p.z - pos.z)) * pc.math.RAD_TO_DEG, dt);
      if (g.attackLeft <= 0) {
        g.attackLeft = guardCfg.attackCooldown;
        hitPlayer();
      }
    } else {
      walkToward(sees ? player.getPosition() : g.lastKnown, guardCfg.chaseSpeed, dt);
    }
  } else if (g.state === 'suspicious') {
    // Freeze and stare while it makes up its mind: the tell that you've been
    // noticed but not yet committed to.
    const p = player.getPosition();
    const pos = guard.getPosition();
    steerYaw(Math.atan2(-(p.x - pos.x), -(p.z - pos.z)) * pc.math.RAD_TO_DEG, dt);
  } else if (g.state === 'search') {
    g.searchLeft -= dt;
    const toLastKnown = walkToward(g.lastKnown, guardCfg.patrolSpeed * 1.4, dt);
    if (toLastKnown < 1 || g.searchLeft <= 0) {
      if (g.searchLeft <= 0) {
        setState('patrol');
      } else {
        // Sweep on the spot, then move on: a slow scan of the last place seen.
        g.yaw += guardCfg.turnRate * 0.35 * dt;
      }
    }
  } else {
    // Patrol.
    if (g.pauseLeft > 0) {
      g.pauseLeft -= dt;
      g.yaw += guardCfg.turnRate * 0.3 * dt;
    } else {
      const [wx, wz] = WAYPOINTS[g.waypoint];
      waypointTarget.set(wx, guardCfg.guardHeight / 2, wz);
      const dist = walkToward(waypointTarget, guardCfg.patrolSpeed, dt);
      if (dist < 0.8) {
        g.waypoint = (g.waypoint + 1) % WAYPOINTS.length;
        g.pauseLeft = guardCfg.pauseTime;
      }
    }
  }

  guard.setEulerAngles(0, g.yaw, 0);
};

// --------------------------------------------------------------- selftest ---

// Walk into view, confirm the guard spots and charges, then land the hits and
// confirm it dies.
let testPhase = 0;
let testClock = 0;

const runSelftest = (dt: number): void => {
  testClock += dt;
  if (testPhase === 0) {
    overlay.classList.add('hidden');
    $('selftest-log').classList.remove('hidden');
    // Stand in the open, a few metres in front of the guard's route.
    player.rigidbody?.teleport(WAYPOINTS[0][0], 1.4, WAYPOINTS[0][1] - 5);
    log('selftest: waiting to be spotted');
    testPhase = 1;
    testClock = 0;
    return;
  }
  if (testPhase === 1) {
    if (g.state === 'chase') {
      log(`PASS spotted and charging after ${testClock.toFixed(1)}s`);
      testPhase = 2;
      testClock = 0;
    } else if (testClock > 20) {
      log('FAIL never charged');
      testPhase = 4;
    }
    return;
  }
  if (testPhase === 2) {
    if (hearts < MAX_HEARTS) {
      log(`PASS it reached me and hit (${MAX_HEARTS - hearts} taken)`);
      testPhase = 3;
      testClock = 0;
    } else if (testClock > 20) {
      log('FAIL never landed a hit');
      testPhase = 4;
    }
    return;
  }
  if (testPhase === 3) {
    if (g.state === 'down') {
      log(`PASS died after ${g.hits} hits — selftest complete`);
      testPhase = 4;
    } else if (testClock > 0.35) {
      testClock = 0;
      damageGuard();
    }
  }
};

// ------------------------------------------------------------------ update --

app.on('update', (dt: number) => {
  const step = Math.min(dt, 0.05);
  tickGuard(step);
  resolveShots();
  if (selftest) runSelftest(step);

  const pos = player.getPosition();
  if (pos.y < -5) respawnPlayer();

  const badge = $('state-badge');
  badge.textContent = g.state.toUpperCase();
  badge.className = g.state;

  const bars = Array.from({ length: guardCfg.hitsToKill }, (_, i) =>
    i < guardCfg.hitsToKill - g.hits ? '<i></i>' : '<i class="gone"></i>'
  ).join('');
  $('guard-health').innerHTML = g.state === 'down' ? '' : bars;
  $('hearts').innerHTML = Array.from({ length: MAX_HEARTS }, (_, i) =>
    i < hearts ? '<span>♥</span>' : '<span class="spent">♥</span>'
  ).join('');

  $('r-state').textContent = g.state;
  $('r-dist').textContent = distanceToPlayer().toFixed(1);
  $('r-see').textContent = g.state === 'down' ? '–' : canSeePlayer() ? 'YES' : 'no';
  $('r-hits').textContent = `${g.hits} / ${guardCfg.hitsToKill}`;
  $('r-shots').textContent = String(shotsFired);
  $('r-chase').textContent = chaseSeconds.toFixed(1);
  $('r-kills').textContent = String(guardKills);
});
