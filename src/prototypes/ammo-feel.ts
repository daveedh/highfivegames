/**
 * THROWAWAY: can grabbing real shelf stock, loading it, and firing it read instantly?
 * Three playable interaction variants on ?variant=A|B|C, not a paper inventory demo:
 * this question needs the existing PlayCanvas/Ammo feel-prototype environment.
 * Five slots, FIFO, tier damage, finite stock, and Pull and Hold are already settled.
 * Grab rules, empty feedback, and tier physics below are candidates, NOT decisions.
 * Run: npm run prototype:ammo. Plain English item names requested for this playtest.
 */
import * as pc from 'playcanvas';
import { FirstPersonController } from 'playcanvas/scripts/esm/first-person-controller.mjs';
import './walk-feel.css';
import './sling-feel.css';
import './ammo-feel.css';

type TierKey = 'light' | 'medium' | 'heavy';
type Shape = 'remote' | 'soft' | 'plate' | 'pot' | 'lamp' | 'roll' | 'glass' | 'ring' |
  'chair' | 'clock' | 'box' | 'mug' | 'pan' | 'duck' | 'hammer' | 'bear' | 'horse';
type Tier = { slots: number; damage: number; mass: number; speed: number; bounce: number; shove: number };
const tiers: Record<TierKey, Tier> = {
  light: { slots: 1, damage: 1, mass: 0.8, speed: 1.15, bounce: 0.4, shove: 80 },
  medium: { slots: 2, damage: 2, mass: 2, speed: 1, bounce: 0.4, shove: 320 },
  heavy: { slots: 3, damage: 4, mass: 5.2, speed: 0.72, bounce: 0.25, shove: 620 }
};
const variants = [
  { key: 'A', name: 'Point and pocket', reach: 2.5, cone: 0, manual: false, empty: 'text',
    blurb: 'Aim exactly at an object, tap E. The first item loads itself. Empty: a message.' },
  { key: 'B', name: 'Grab and go', reach: 3.5, cone: 12, manual: false, empty: 'shelves',
    blurb: 'Aim near an object, tap E. The first item loads itself. Empty: point out visible stock.' },
  { key: 'C', name: 'Pocket, then load', reach: 3.5, cone: 12, manual: true, empty: 'shelves',
    blurb: 'Forgiving E pickup. Press R to load the next item before each shot. No refill button.' }
];
const params = new URLSearchParams(location.search);
let variantIndex = Math.max(0, variants.findIndex(v => v.key === (params.get('variant') ?? 'B').toUpperCase()));
const cfg = { ...variants[variantIndex] };

pc.WasmModule.setConfig('Ammo', {
  glueUrl: 'wasm/ammo.wasm.js', wasmUrl: 'wasm/ammo.wasm.wasm', fallbackUrl: 'wasm/ammo.js'
});
await new Promise<void>(resolve => pc.WasmModule.getInstance('Ammo', () => resolve()));
const canvas = document.getElementById('application-canvas');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing application canvas');
const app = new pc.Application(canvas, { mouse: new pc.Mouse(canvas), keyboard: new pc.Keyboard(window) });
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.graphicsDevice.maxPixelRatio = Math.min(devicePixelRatio, 1.5);
app.start();
window.addEventListener('resize', () => app.resizeCanvas());
const physics = app.systems.rigidbody!;
physics.gravity.set(0, -16, 0);
app.scene.ambientLight = new pc.Color(0.5, 0.5, 0.55);
const sun = new pc.Entity('sun');
sun.addComponent('light', { type: 'directional', intensity: 1.2 });
sun.setEulerAngles(55, 30, 0);
app.root.addChild(sun);
function material(r: number, g: number, b: number): pc.StandardMaterial {
  const m = new pc.StandardMaterial();
  m.diffuse = new pc.Color(r, g, b);
  m.update();
  return m;
}
const grey = material(0.62, 0.62, 0.65);
const floorMat = material(0.32, 0.34, 0.38);
const blue = material(0.12, 0.3, 0.58);
const yellow = material(1, 0.8, 0.12);
const dark = material(0.14, 0.15, 0.18);
const leather = material(0.42, 0.25, 0.13);
const colours = { light: material(0.95, 0.85, 0.4), medium: material(0.95, 0.54, 0.2), heavy: material(0.8, 0.24, 0.2) };
function visual(parent: pc.Entity, type: string, size: number[], pos: number[], m: pc.StandardMaterial): pc.Entity {
  const e = new pc.Entity(type);
  e.addComponent('render', { type, material: m });
  e.setLocalScale(size[0], size[1], size[2]);
  e.setLocalPosition(pos[0], pos[1], pos[2]);
  parent.addChild(e);
  return e;
}
function box(name: string, pos: number[], size: number[], m = grey): pc.Entity {
  const e = new pc.Entity(name);
  e.setPosition(pos[0], pos[1], pos[2]);
  visual(e, 'box', size, [0, 0, 0], m);
  // Physics roots stay at unit scale; only the visual children are scaled.
  e.addComponent('collision', { type: 'box', halfExtents: new pc.Vec3(size[0] / 2, size[1] / 2, size[2] / 2) });
  e.addComponent('rigidbody', { type: 'static', friction: 0.7, restitution: 0.3 });
  app.root.addChild(e);
  return e;
}
box('floor', [0, -0.5, 0], [30, 1, 48], floorMat);
box('back', [0, 3, -24], [30, 6, 0.4]);
box('front', [0, 3, 24], [30, 6, 0.4]);
box('left', [-15, 3, 0], [0.4, 6, 48]);
box('right', [15, 3, 0], [0.4, 6, 48]);
box('bank shot wall', [7, 1.5, -12], [0.3, 3, 7]);
box('low cover', [-1, 0.5, -5], [3, 1, 0.5]);

const player = new pc.Entity('player');
const camera = new pc.Entity('camera');
camera.addComponent('camera', { fov: 90, nearClip: 0.04, farClip: 90, clearColor: new pc.Color(0.12, 0.15, 0.2) });
player.addChild(camera);
camera.setLocalPosition(0, 0.75, 0);
player.addComponent('collision', { type: 'capsule', radius: 0.35, height: 1.7 });
player.addComponent('rigidbody', { type: 'dynamic', mass: 80, angularFactor: pc.Vec3.ZERO, friction: 0.5 });
player.addComponent('script');
app.root.addChild(player);
player.rigidbody!.teleport(-10, 0.9, 19);
const controller = player.script!.create(FirstPersonController, {
  properties: { camera, lookSens: 0.1, speedGround: 45, speedAir: 5, sprintMult: 1.6,
    velocityDampingGround: 0.995, velocityDampingAir: 0.99925, jumpForce: 550 }
});
if (!(controller instanceof FirstPersonController)) throw new Error('First-person controller failed to initialize');

type Item = {
  entity: pc.Entity; model: pc.Entity; name: string; shape: Shape; tier: TierKey;
  size: [number, number, number]; home: pc.Vec3; state: 'world' | 'pouch';
  armed: boolean; quiet: number; struck: Set<pc.Entity>;
};
const items: Item[] = [];
const byEntity = new Map<pc.Entity, Item>();
const queue: Item[] = [];
let loaded: Item | null = null;
let focus: Item | null = null;
let drawing = false;
let drawTime = 0;
let cooldown = 0;
let messageUntil = 0;
let revealUntil = 0;
let fired = 0;
let lastSpeed = 0;
let stepOffset = 0;

function makeShape(root: pc.Entity, shape: Shape, m: pc.StandardMaterial): void {
  const part = (type: string, size: number[], pos = [0, 0, 0]) => visual(root, type, size, pos, m);
  switch (shape) {
    case 'mug':
    case 'pot':
    case 'glass':
      part('cylinder', [0.7, 0.8, 0.7], [-0.1, 0, 0]);
      if (shape === 'mug') part('torus', [0.45, 0.45, 0.45], [0.3, 0, 0]).setLocalEulerAngles(90, 0, 0);
      if (shape === 'pot') part('sphere', [0.85, 0.5, 0.85], [0, 0.28, 0]);
      break;
    case 'lamp':
      part('cylinder', [0.7, 0.12, 0.7], [0, -0.43, 0]);
      part('cylinder', [0.12, 0.65, 0.12], [0, -0.05, 0]);
      part('cone', [0.8, 0.45, 0.8], [0, 0.25, 0]); break;
    case 'chair':
    case 'horse':
      part('box', [1, 0.16, 0.9], [0, -0.02, 0]);
      part('box', [1, 0.5, 0.15], [0, 0.22, 0.37]);
      for (const x of [-0.36, 0.36]) for (const z of [-0.3, 0.3]) part('box', [0.12, 0.4, 0.12], [x, -0.3, z]);
      if (shape === 'horse') part('sphere', [0.45, 0.4, 0.45], [0, 0.35, -0.25]);
      break;
    case 'pan':
      part('cylinder', [0.65, 0.22, 0.8], [-0.15, 0, 0]);
      part('box', [0.5, 0.12, 0.14], [0.25, 0, 0]); break;
    case 'plate': part('cylinder', [1, 0.25, 1]); break;
    case 'ring': part('torus', [0.8, 0.8, 0.8]); break;
    case 'roll': part('cylinder', [0.6, 1, 0.6]).setLocalEulerAngles(0, 0, 90); break;
    case 'duck':
    case 'bear':
      part('sphere', [0.8, 0.6, 0.8], [0, -0.15, 0]);
      part('sphere', [0.5, 0.5, 0.5], [0, 0.22, -0.12]);
      part('box', [0.32, 0.13, 0.24], [0, 0.15, -0.4]); break;
    case 'hammer':
      part('box', [0.15, 0.8, 0.15], [0, -0.1, 0]);
      part('box', [0.8, 0.25, 0.4], [0, 0.35, 0]); break;
    case 'soft': part('sphere', [1, 0.65, 1]); break;
    case 'clock': part('cylinder', [0.85, 0.4, 0.85]).setLocalEulerAngles(90, 0, 0); break;
    default: part('box', [1, 1, 1]);
  }
}
type Product = [string, Shape];
const zones: { name: string; products: Product[] }[] = [
  { name: 'Living Rooms', products: [['Remote control', 'remote'], ['Sofa cushion', 'soft'], ['Coaster stack', 'plate'], ['Houseplant', 'pot'], ['Table lamp', 'lamp'], ['Rolled-up rug', 'roll']] },
  { name: 'Dining', products: [['Dinner plate', 'plate'], ['Wine glass', 'glass'], ['Napkin ring', 'ring'], ['Candlestick', 'lamp'], ['Fruit bowl', 'pot'], ['Dining chair', 'chair']] },
  { name: 'Bedrooms', products: [['Pillow', 'soft'], ['Alarm clock', 'clock'], ['Slipper', 'soft'], ['Bedside lamp', 'lamp'], ['Duvet roll', 'roll'], ['Mattress-in-a-box', 'box']] },
  { name: 'Kitchens', products: [['Mug', 'mug'], ['Colander', 'pot'], ['Rolling pin', 'roll'], ['Frying pan', 'pan'], ['Saucepan', 'pot'], ['Pressure cooker', 'pot']] },
  { name: "Children's", products: [['Rubber duck', 'duck'], ['Toy hammer', 'hammer'], ['Teddy bear', 'bear'], ['Xylophone', 'box'], ['Brick bucket', 'pot'], ['Rocking horse', 'horse']] },
  { name: 'Market Hall', products: [['Tealight bag', 'box'], ['Scented candle', 'glass'], ['Picture frame', 'box'], ['Ice cube tray', 'box'], ['Toilet brush', 'hammer'], ['Lampshade', 'lamp'],
    ['Watering can', 'pot'], ['Meatball bag', 'soft'], ['Storage tub', 'box'], ['Flatpack box', 'box']] }
];
const zoneSigns: { text: string; pos: pc.Vec3 }[] = [];
function dimensions(shape: Shape, tier: TierKey): [number, number, number] {
  if (shape === 'chair' || shape === 'horse') return [0.7, 0.9, 0.7];
  if (shape === 'plate' || shape === 'pan') return [0.5, 0.16, 0.45];
  if (shape === 'lamp') return [0.38, 0.65, 0.38];
  if (shape === 'remote') return [0.14, 0.1, 0.35];
  const s = tier === 'heavy' ? 0.7 : tier === 'medium' ? 0.45 : 0.28;
  return [s, s, s];
}
function configureBody(item: Item): void {
  const body = item.entity.rigidbody!;
  const t = tiers[item.tier];
  body.mass = t.mass;
  body.restitution = t.bounce;
  body.body.setCcdMotionThreshold(0.01);
  body.body.setCcdSweptSphereRadius(Math.min(...item.size) * 0.3);
}
zones.forEach((zone, zi) => {
  const x = zi < 3 ? -10 : 10;
  const z = 16 - (zi % 3) * 14;
  const rows = zone.products.length > 6 ? 2 : 1;
  for (let row = 0; row < rows; row++) {
    const height = row === 0 ? 0.9 : 1.6;
    box(`${zone.name} shelf`, [x, height, z], [7.7, 0.15, 1.4]);
    box('yellow price-tag edge', [x, height, z + 0.74], [7.7, 0.1, 0.08], yellow);
  }
  box('shelf back', [x, 1.25, z - 0.75], [7.7, 2.5, 0.15], blue);
  for (const dx of [-3.7, 3.7]) box('shelf leg', [x + dx, 0.45, z], [0.12, 0.9, 1.4]);
  zoneSigns.push({ text: zone.name, pos: new pc.Vec3(x, 3.05, z) });
  zone.products.forEach(([name, shape], i) => {
    const tier: TierKey = i < (zi === 5 ? 6 : 3) ? 'light' : i === zone.products.length - 1 ? 'heavy' : 'medium';
    const size = dimensions(shape, tier);
    const row = zi === 5 && i >= 6 ? 1 : 0;
    const col = row ? i - 6 : i;
    const home = new pc.Vec3(x - 3.1 + col * 1.22, (row ? 1.6 : 0.9) + 0.09 + size[1] / 2, z + 0.13);
    const entity = new pc.Entity(name);
    entity.setPosition(home);
    const model = new pc.Entity('product silhouette');
    makeShape(model, shape, colours[tier]);
    model.setLocalScale(...size);
    entity.addChild(model);
    entity.addComponent('collision', { type: 'box', halfExtents: new pc.Vec3(...size).mulScalar(0.5) });
    entity.addComponent('rigidbody', { type: 'dynamic', mass: tiers[tier].mass, friction: 0.7,
      restitution: tiers[tier].bounce, linearDamping: 0.08, angularDamping: 0.2 });
    app.root.addChild(entity);
    const item: Item = { entity, model, name, shape, tier, size, home, state: 'world', armed: false, quiet: 0, struck: new Set() };
    items.push(item);
    byEntity.set(entity, item);
    configureBody(item);
    entity.collision!.on('collisionstart', (result: pc.ContactResult) => hit(item, result.other));
  });
});

const targets = [-4, 0, 4].map((x, i) => {
  const entity = box(`security dummy ${i + 1}`, [x, 1.2, -19], [0.8, 2.4, 0.55], blue);
  visual(entity, 'box', [0.65, 0.15, 0.1], [0, 0.7, 0.32], yellow);
  return { entity, hp: 4, fall: 0, shove: 0, home: entity.getPosition().clone() };
});
function hit(item: Item, other: pc.Entity): void {
  if (!item.armed || item.state !== 'world' || item.struck.has(other)) return;
  const target = targets.find(t => t.entity === other && t.hp > 0);
  if (!target) return;
  item.struck.add(other);
  target.hp = Math.max(0, target.hp - tiers[item.tier].damage);
  target.shove = tiers[item.tier].shove;
  if (target.hp === 0) target.entity.collision!.enabled = false;
  say(`${item.name}: ${target.hp === 0 ? (item.tier === 'heavy' ? 'flattened' : 'down') : `${target.hp}/4 remaining`}`);
}

const sling = new pc.Entity('sling');
camera.addChild(sling);
sling.setLocalPosition(0.26, -0.24, -0.55);
function rod(parent: pc.Entity, a: pc.Vec3, b: pc.Vec3, thickness: number, m: pc.StandardMaterial): pc.Entity {
  const e = visual(parent, 'cylinder', [1, 1, 1], [0, 0, 0], m);
  stretch(e, a, b, thickness);
  return e;
}
function stretch(e: pc.Entity, a: pc.Vec3, b: pc.Vec3, width: number): void {
  const dir = new pc.Vec3().sub2(b, a);
  const length = dir.length();
  e.setLocalPosition(new pc.Vec3().add2(a, b).mulScalar(0.5));
  e.setLocalScale(width, length, width);
  dir.normalize();
  e.setLocalEulerAngles(Math.asin(dir.y) * pc.math.RAD_TO_DEG - 90, Math.atan2(dir.x, dir.z) * pc.math.RAD_TO_DEG, 0);
}
const forkPoint = (t: number) => new pc.Vec3(0.105 * Math.sin(t * Math.PI / 2), 0.075 - 0.07 * Math.cos(t * Math.PI / 2), 0);
for (let i = 0; i < 8; i++) rod(sling, forkPoint(-1 + i / 4), forkPoint(-1 + (i + 1) / 4), 0.026, blue);
const tipL = new pc.Vec3(-0.105, 0.185, 0);
const tipR = new pc.Vec3(0.105, 0.185, 0);
rod(sling, forkPoint(-1), tipL, 0.026, blue);
rod(sling, forkPoint(1), tipR, 0.026, blue);
rod(sling, new pc.Vec3(0, 0.005, 0), new pc.Vec3(0, -0.115, 0), 0.034, dark);
const cup = visual(sling, 'sphere', [0.05, 0.05, 0.03], [0, 0.135, 0.08], leather);
const bandL = rod(sling, tipL, new pc.Vec3(0, 0.135, 0.05), 0.017, dark);
const bandR = rod(sling, tipR, new pc.Vec3(0, 0.135, 0.05), 0.017, dark);
let loadedModel: pc.Entity | null = null;
function showLoaded(): void {
  loadedModel?.destroy();
  loadedModel = null;
  if (!loaded) return;
  loadedModel = new pc.Entity('loaded product');
  makeShape(loadedModel, loaded.shape, colours[loaded.tier]);
  const max = Math.max(...loaded.size);
  loadedModel.setLocalScale(loaded.size[0] / max * 0.12, loaded.size[1] / max * 0.12, loaded.size[2] / max * 0.12);
  sling.addChild(loadedModel);
}
function loadNext(): void {
  if (loaded || !queue.length || drawing || cooldown > 0) return;
  loaded = queue[0];
  showLoaded();
}
const used = () => queue.reduce((sum, item) => sum + tiers[item.tier].slots, 0);
const locked = () => document.pointerLockElement === canvas;
function ray(from: pc.Vec3, to: pc.Vec3): pc.RaycastResult | undefined {
  return physics.raycastAll(from, to).filter(h => h.entity !== player).sort((a, b) => a.hitFraction - b.hitFraction)[0];
}
function visible(item: Item): boolean {
  const origin = camera.getPosition();
  return ray(origin, item.entity.getPosition())?.entity === item.entity;
}
function findFocus(): Item | null {
  const origin = camera.getPosition();
  const forward = camera.forward;
  const direct = ray(origin, origin.clone().add(forward.clone().mulScalar(cfg.reach)));
  if (direct && byEntity.has(direct.entity)) return byEntity.get(direct.entity)!;
  if (!cfg.cone) return null;
  let best: Item | null = null;
  let bestScore = Infinity;
  for (const item of items) {
    if (item.state !== 'world') continue;
    const offset = item.entity.getPosition().clone().sub(origin);
    const distance = offset.length();
    const angle = Math.acos(pc.math.clamp(offset.normalize().dot(forward), -1, 1)) * pc.math.RAD_TO_DEG;
    if (distance > cfg.reach || angle > cfg.cone || !visible(item)) continue;
    const score = angle + distance * 0.1;
    if (score < bestScore) { best = item; bestScore = score; }
  }
  return best;
}
function grab(): void {
  focus = findFocus();
  if (!focus) { say('No stock in reach. Look at a yellow shelf edge.'); return; }
  if (drawing) { say('Release or cancel the draw before grabbing.'); return; }
  const item = focus;
  if (used() + tiers[item.tier].slots > 5) { say(`${item.name} needs ${tiers[item.tier].slots} slots; ${5 - used()} free. Nothing swapped.`); return; }
  item.state = 'pouch';
  item.armed = false;
  item.entity.enabled = false;
  queue.push(item);
  if (!cfg.manual) loadNext();
  say(`${item.name} pocketed${cfg.manual && !loaded ? ' - R to load' : ''}`);
  focus = null;
}
function emptyClick(): void {
  say(queue.length ? 'Press R to load the next item.' : 'Pouch empty. E grabs shelf or fallen stock.');
  if (!queue.length && cfg.empty === 'shelves') revealUntil = performance.now() + 2400;
}
function fire(): void {
  if (!loaded || cooldown > 0) { if (!loaded) emptyClick(); return; }
  const item = loaded;
  const ch = pc.math.clamp(drawTime / 0.75, 0, 1);
  const direction = camera.forward.clone();
  const spread = Math.tan((1 - ch) * 7 * pc.math.DEG_TO_RAD);
  const theta = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * spread;
  direction.add(camera.right.clone().mulScalar(Math.cos(theta) * radius));
  direction.add(camera.up.clone().mulScalar(Math.sin(theta) * radius)).normalize();
  const origin = camera.getPosition().clone();
  const muzzle = origin.clone().add(direction.clone().mulScalar(0.75));
  // A blocked muzzle must not teleport a carried object through a wall.
  if (ray(origin, muzzle.clone().add(direction.clone().mulScalar(Math.max(...item.size) / 2)))) {
    say('Too close to the shelf or wall. Step back to fire.');
    return;
  }
  queue.shift();
  loaded = null;
  showLoaded();
  item.state = 'world';
  item.armed = true;
  item.quiet = 0;
  item.struck.clear();
  item.entity.enabled = true;
  configureBody(item);
  item.entity.rigidbody!.teleport(muzzle, pc.Quat.IDENTITY);
  item.entity.rigidbody!.linearVelocity = pc.Vec3.ZERO;
  item.entity.rigidbody!.angularVelocity = new pc.Vec3(1.5, 2, 0.5);
  lastSpeed = pc.math.lerp(14, 48, ch) * tiers[item.tier].speed;
  item.entity.rigidbody!.applyImpulse(direction.mulScalar(lastSpeed * tiers[item.tier].mass));
  cooldown = 0.35;
  fired++;
  say(`${item.name} fired at ${lastSpeed.toFixed(1)} m/s`);
}
function cancelDraw(): void { drawing = false; drawTime = 0; }
function reset(): void {
  cancelDraw();
  queue.length = 0;
  loaded = null;
  showLoaded();
  cooldown = 0;
  fired = 0;
  focus = null;
  revealUntil = 0;
  for (const item of items) {
    item.state = 'world'; item.armed = false; item.quiet = 0; item.struck.clear();
    item.entity.enabled = true;
    configureBody(item);
    item.entity.rigidbody!.teleport(item.home, pc.Quat.IDENTITY);
    item.entity.rigidbody!.linearVelocity = pc.Vec3.ZERO;
    item.entity.rigidbody!.angularVelocity = pc.Vec3.ZERO;
  }
  for (const target of targets) {
    target.hp = 4; target.fall = 0;
    target.entity.setPosition(target.home);
    target.entity.setEulerAngles(0, 0, 0);
    target.entity.collision!.enabled = true;
    target.entity.rigidbody!.teleport(target.home, pc.Quat.IDENTITY);
  }
  player.rigidbody!.teleport(-10, 0.9, 19);
  player.rigidbody!.linearVelocity = pc.Vec3.ZERO;
  say('Playtest reset: original 40 objects returned. Not an in-game restock.');
}

const ui = document.createElement('div');
ui.id = 'proto-ui';
ui.innerHTML = `
  <div id="zone-labels"></div><div id="crosshair"></div>
  <div id="draw-meter"><div id="draw-fill"></div></div>
  <div id="ammo-focus"></div><div id="ammo-message" role="status"></div>
  <div id="readout"><h1>THROWAWAY: the store is your ammo box</h1>
    <div id="state"></div><p class="instructions">Can grabbing, loading and firing read instantly?
    Try a Light + Heavy + Light pouch, reject an oversized pickup, empty it, then retrieve your shots.
    Try grabbing beside a shelf back: forgiveness must not reach through it.</p>
    <p class="instructions dim">Plain English names for this playtest; grey-box shapes are provisional. No restock, no new shot bodies.
    Three stationary 4-HP dummies at the far end; guard behavior and kill effects are separate.</p></div>
  <div id="panel"><h2>Unsettled grab / load feel</h2><p id="blurb"></p>
    <div id="grab-knobs"></div>
    <label>Empty-pouch feedback<select id="empty-mode"><option value="text">Message only</option><option value="shelves">Message + visible stock markers</option></select></label>
    <details><summary>Unsettled weight-tier physics</summary><div id="tier-knobs"></div></details>
    <p class="note">Locked: five FIFO slots (1/2/3), damage (1/2/4), 0.75s draw,
    14-48 m/s base speed, 0.35s reload, 55% draw walk speed, normal gravity.</p>
    <div id="panel-actions"><button id="reset">Reset playtest</button><button id="copy">Copy settings</button></div>
    <pre id="dump" hidden></pre>
  </div>
  <div id="ammo-queue"></div><div id="ammo-slots"></div>
  <div id="switcher"><button id="prev" aria-label="Previous variant">&lt;</button><span id="variant"></span><button id="next" aria-label="Next variant">&gt;</button></div>
  <div id="click-to-play"><div><h1>Everything with a yellow tag is ammunition.</h1>
    <p>Click the showroom to play.</p><p>WASD move / Shift sprint / Space jump</p>
    <p>E grab / hold left mouse, release to fire / R load (C)</p>
    <p>Right mouse cancels draw / Esc opens tuning</p>
    <p class="dim">Try A, B and C with the bottom arrows. Changes are candidates until you choose.</p></div></div>`;
document.body.appendChild(ui);
function el(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing #${id}`);
  return node;
}
function say(text: string): void {
  el('ammo-message').textContent = text;
  messageUntil = performance.now() + 2600;
}
function slider(container: HTMLElement, label: string, value: number, min: number, max: number, step: number, set: (v: number) => void): void {
  const wrap = document.createElement('label');
  wrap.className = 'knob';
  wrap.innerHTML = `<span class="knob-head">${label}<b>${value}</b></span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}">`;
  const input = wrap.querySelector('input')!;
  input.oninput = () => { set(input.valueAsNumber); wrap.querySelector('b')!.textContent = input.value; };
  container.appendChild(wrap);
}
function panel(): void {
  el('variant').textContent = `${cfg.key} - ${cfg.name}`;
  el('blurb').textContent = cfg.blurb;
  el('grab-knobs').replaceChildren();
  slider(el('grab-knobs'), 'Reach (m)', cfg.reach, 1, 6, 0.25, v => { cfg.reach = v; });
  slider(el('grab-knobs'), 'Aim forgiveness (degrees)', cfg.cone, 0, 25, 1, v => { cfg.cone = v; });
  const select = el('empty-mode');
  if (select instanceof HTMLSelectElement) {
    select.value = cfg.empty;
    select.onchange = () => { cfg.empty = select.value; };
  }
  el('tier-knobs').replaceChildren();
  for (const key of ['light', 'medium', 'heavy'] as const) {
    const title = document.createElement('h2'); title.textContent = key; el('tier-knobs').appendChild(title);
    const t = tiers[key];
    const fields = [
      ['mass', 'Mass (kg)', 0.1, 12, 0.1],
      ['speed', 'Speed multiplier', 0.4, 1.5, 0.05],
      ['bounce', 'Bounciness', 0, 0.9, 0.05],
      ['shove', 'Knockdown shove', 0, 1000, 20]
    ] as const;
    for (const [field, label, min, max, step] of fields) slider(el('tier-knobs'), label, t[field], min, max, step, value => {
      t[field] = value;
      for (const item of items) if (item.tier === key && item.state === 'world') configureBody(item);
    });
  }
}
function switchVariant(delta: number): void {
  variantIndex = (variantIndex + delta + variants.length) % variants.length;
  Object.assign(cfg, variants[variantIndex]);
  cancelDraw();
  // Preserve stock and queue: only the interaction rule changes.
  if (!cfg.manual) loadNext();
  const url = new URL(location.href); url.searchParams.set('variant', cfg.key); history.replaceState(null, '', url);
  panel();
  say(`${cfg.name}. Stock and pouch unchanged.`);
}
el('prev').onclick = () => switchVariant(-1);
el('next').onclick = () => switchVariant(1);
el('reset').onclick = reset;
el('copy').onclick = async () => {
  const text = JSON.stringify({ question: 'Unsettled grab/load and tier feel', grab: cfg, tiers }, null, 2);
  el('dump').hidden = false; el('dump').textContent = text;
  try { await navigator.clipboard.writeText(text); say('Settings copied.'); }
  catch (error) { console.warn('Clipboard unavailable', error); say('Clipboard unavailable; select the settings text below.'); }
};
panel();

const icons: Record<Shape, string> = {
  remote: '<rect x="12" y="2" width="12" height="26" rx="2"/>',
  soft: '<ellipse cx="18" cy="16" rx="16" ry="10"/>',
  plate: '<ellipse cx="18" cy="16" rx="16" ry="4"/>',
  pot: '<path d="M5 10h26v14H5zm4-5h18v3H9zM1 12h4v6H1zm30 0h4v6h-4z"/>',
  lamp: '<path d="M10 2h16l8 13H2zm6 14h4v10h10v3H6v-3h10z"/>',
  roll: '<rect x="3" y="10" width="30" height="13" rx="6"/>',
  glass: '<path d="M9 2h18l-3 15-4 3v6h7v3H9v-3h7v-6l-4-3z"/>',
  ring: '<path fill-rule="evenodd" d="M18 2a13 13 0 1 0 0 26 13 13 0 0 0 0-26m0 6a7 7 0 1 1 0 14 7 7 0 0 1 0-14"/>',
  chair: '<path d="M6 2h4v14h20v13h-4v-9H10v9H6zm4 0h17v12H10z"/>',
  clock: '<circle cx="18" cy="15" r="12"/><path d="M6 27h7v3H6zm17 0h7v3h-7z"/>',
  box: '<path d="M3 5h30v23H3z"/>',
  mug: '<path fill-rule="evenodd" d="M3 5h22v3h9v14h-9v5H3zm22 7v6h5v-6z"/>',
  pan: '<ellipse cx="12" cy="17" rx="11" ry="7"/><path d="M20 15h16v4H20z"/>',
  duck: '<ellipse cx="16" cy="21" rx="13" ry="8"/><circle cx="24" cy="9" r="7"/><path d="M28 8h8v4h-8z"/>',
  hammer: '<path d="M3 3h30v9H21v18h-6V12H3z"/>',
  bear: '<circle cx="18" cy="9" r="7"/><circle cx="11" cy="3" r="3"/><circle cx="25" cy="3" r="3"/><ellipse cx="18" cy="22" rx="10" ry="9"/>',
  horse: '<path d="M6 12h20V3h7v13h-5v12h-4V19H10v9H6z"/>'
};
let pouchKey = '';
function hud(): void {
  const key = queue.map(i => i.name).join(',') + ':' + loaded?.name;
  if (key !== pouchKey) {
    pouchKey = key;
    el('ammo-queue').innerHTML = queue.length ? queue.map((item, index) =>
      `<div class="ammo-card ${item === loaded ? 'loaded' : ''}"><svg viewBox="0 0 36 32" aria-label="${item.shape}">${icons[item.shape]}</svg>
      ${item.name}<small>${index === 0 ? (loaded ? 'LOADED' : 'NEXT') : 'QUEUED'} / ${tiers[item.tier].slots} slots</small></div>`).join('') : '<div class="ammo-card">EMPTY<small>E to grab</small></div>';
    el('ammo-slots').innerHTML = Array.from({ length: 5 }, (_, i) => `<i class="${i >= used() ? 'free' : ''}"></i>`).join('');
  }
  const free = 5 - used();
  const blocked = focus && tiers[focus.tier].slots > free;
  el('ammo-focus').textContent = focus ? `${focus.name} / ${focus.tier} / ${tiers[focus.tier].slots} slots\n${blocked ? `Needs ${tiers[focus.tier].slots}; ${free} free` : 'E - grab'}` : '';
  el('ammo-focus').classList.toggle('blocked', Boolean(blocked));
  el('crosshair').classList.toggle('drawing', drawing || Boolean(focus));
  el('crosshair').classList.toggle('empty', !loaded && !focus);
  el('state').textContent = `${used()}/5 slots | ${queue.length} carried | ${items.length - queue.length} in world | 40 total
    | ${loaded ? `loaded: ${loaded.name}` : 'unloaded'} | ${fired} fired | last ${lastSpeed.toFixed(1)} m/s
    | targets ${targets.map(t => t.hp).join('/')} HP`;
}
const signEls = zoneSigns.map(sign => {
  const label = document.createElement('span'); label.textContent = sign.text; el('zone-labels').appendChild(label); return label;
});
const stockMarkerEls = items.map(item => {
  const label = document.createElement('span'); label.textContent = item.name; label.hidden = true;
  el('zone-labels').appendChild(label); return label;
});
function project(label: HTMLElement, point: pc.Vec3, show: boolean): void {
  if (!show || point.clone().sub(camera.getPosition()).dot(camera.forward) <= 0) { label.hidden = true; return; }
  const screen = camera.camera!.worldToScreen(point);
  label.hidden = screen.x < 0 || screen.x > innerWidth || screen.y < 0 || screen.y > innerHeight;
  label.style.left = `${screen.x}px`; label.style.top = `${screen.y}px`;
}
app.mouse!.on(pc.EVENT_MOUSEDOWN, (event: pc.MouseEvent) => {
  if (!locked()) return;
  if (event.button === pc.MOUSEBUTTON_RIGHT) { cancelDraw(); return; }
  if (event.button !== pc.MOUSEBUTTON_LEFT || cooldown > 0) return;
  if (!loaded) { emptyClick(); return; }
  drawing = true; drawTime = 0;
});
app.mouse!.on(pc.EVENT_MOUSEUP, (event: pc.MouseEvent) => {
  if (event.button !== pc.MOUSEBUTTON_LEFT || !drawing) return;
  if (locked()) fire();
  cancelDraw();
});
canvas.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('pointerlockchange', () => {
  cancelDraw();
  el('click-to-play').classList.toggle('hidden', locked());
  document.body.classList.toggle('playing', locked());
});
window.addEventListener('keydown', event => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement ||
    event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
  if (event.repeat) return;
  if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
    event.preventDefault(); switchVariant(event.code === 'ArrowLeft' ? -1 : 1); return;
  }
  if (!locked()) return;
  if (event.code === 'KeyE') grab();
  if (event.code === 'KeyR') { loadNext(); if (!queue.length) emptyClick(); }
});
let paused = false;
function pause(): void { paused = true; cancelDraw(); app.timeScale = 0; app.autoRender = false; }
function resume(): void { paused = false; app.timeScale = 1; app.autoRender = true; }
window.addEventListener('blur', pause);
window.addEventListener('focus', resume);
document.addEventListener('visibilitychange', () => document.hidden ? pause() : resume());
let uiElapsed = 0;
app.on('update', (rawDt: number) => {
  if (paused) return;
  const dt = Math.min(rawDt, 0.05);
  const now = performance.now();
  cooldown = Math.max(0, cooldown - dt);
  if (!cfg.manual && !loaded && cooldown === 0) loadNext();
  if (drawing) drawTime = Math.min(0.75, drawTime + dt);
  const charge = drawing ? drawTime / 0.75 : 0;
  controller.speedGround = 45 * (drawing ? 0.55 : 1);

  // Settled 0.45m step assist, with camera smoothing rather than a camera snap.
  const p = player.getPosition();
  const v = player.rigidbody!.linearVelocity;
  const horizontal = new pc.Vec3(v.x, 0, v.z);
  if (horizontal.length() > 0.2 && v.y < 0.5 && v.y > -1) {
    const feet = p.y - 0.85;
    const stepPoint = p.clone().add(horizontal.normalize().mulScalar(0.55));
    const support = ray(new pc.Vec3(p.x, feet + 0.08, p.z), new pc.Vec3(p.x, feet - 0.15, p.z));
    const step = ray(new pc.Vec3(stepPoint.x, feet + 0.45, stepPoint.z), new pc.Vec3(stepPoint.x, feet + 0.04, stepPoint.z));
    if (support && step && step.normal.y > 0.7) {
      const lift = step.point.y - feet + 0.015;
      const head = new pc.Vec3(p.x, p.y + 0.82, p.z);
      if (lift > 0.04 && lift <= 0.45 && !ray(head, head.clone().add(new pc.Vec3(0, lift, 0)))) {
        player.rigidbody!.teleport(p.x, p.y + lift, p.z);
        stepOffset -= lift;
      }
    }
  }
  stepOffset *= Math.exp(-dt / 0.12);
  camera.setLocalPosition(0, 0.75 + stepOffset - charge * 0.06, 0);
  camera.camera!.fov = 90 - 12 * charge;
  const pouch = new pc.Vec3(-charge * 0.06, 0.135 - charge * 0.09, 0.05 + charge * 0.07);
  cup.setLocalPosition(pouch.clone().add(new pc.Vec3(0, 0, 0.03)));
  loadedModel?.setLocalPosition(pouch);
  stretch(bandL, tipL, pouch, 0.017); stretch(bandR, tipR, pouch, 0.017);
  sling.setLocalPosition(0.26 - charge * 0.03, -0.24 - charge * 0.02, -0.55 + charge * 0.05);
  el('draw-meter').classList.toggle('on', drawing);
  el('draw-meter').classList.toggle('full', charge >= 1);
  el('draw-fill').style.width = `${charge * 100}%`;
  for (const item of items) {
    if (item.state !== 'world' || !item.armed) continue;
    const body = item.entity.rigidbody!;
    item.quiet = body.linearVelocity.length() < 0.2 && body.angularVelocity.length() < 0.3 ? item.quiet + dt : 0;
    if (item.quiet > 0.35) item.armed = false;
  }
  for (const target of targets) {
    if (target.hp > 0) continue;
    target.fall = Math.min(1, target.fall + dt * (1.5 + target.shove / 250));
    target.entity.setEulerAngles(-90 * target.fall, 0, 0);
    target.entity.setPosition(target.home.x, 1.2 - 0.9 * target.fall, target.home.z - target.fall * target.shove / 500);
  }
  uiElapsed += dt;
  if (uiElapsed > 0.07) {
    uiElapsed = 0;
    focus = findFocus();
    hud();
    zoneSigns.forEach((sign, i) => project(signEls[i], sign.pos, true));
    items.forEach((item, i) => project(stockMarkerEls[i], item.entity.getPosition().clone().add(new pc.Vec3(0, 0.4, 0)),
      item.state === 'world' && (item === focus || (now < revealUntil && visible(item)))));
    if (now > messageUntil) el('ammo-message').textContent = '';
  }
});
hud();
// Inspection surface for browser diagnostics; no separate simulation or fake inventory.
export { app, player, camera, items, queue, targets, cfg, tiers, grab, fire, loadNext, reset, findFocus };
