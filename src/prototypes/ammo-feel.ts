/**
 * THROWAWAY: can grabbing real shelf stock, loading it, and firing it read instantly?
 * Three playable interaction variants on ?variant=A|B|C, not a paper inventory demo:
 * this question needs the existing PlayCanvas/Ammo feel-prototype environment.
 * Five slots, FIFO, tier damage, finite stock, and Pull and Hold are already settled.
 * Chosen live: B's grab/load rules, heavier/slower Heavy objects, message-only empty feedback.
 * Audio was silent for a machine reason, not a code one: the default Windows output
 * was a monitor with no speakers (#21). Playback works; the dry-fire click is voiced
 * mid-band with a pitched body so small monitor speakers actually reproduce it.
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
  heavy: { slots: 3, damage: 4, mass: 8, speed: 0.55, bounce: 0.12, shove: 620 }
};
const variants = [
  { key: 'A', name: 'Point and pocket', reach: 2.5, cone: 0, manual: false, empty: 'text',
    blurb: 'Aim exactly at an object, tap E. The first item loads itself. Empty: a message.' },
  { key: 'B', name: 'Grab and go', reach: 3.5, cone: 12, manual: false, empty: 'text',
    blurb: 'Chosen: aim near an object, tap E; loading is automatic. Empty: a message. Sound is deferred.' },
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
const ceramic = material(0.93, 0.91, 0.85);
const wood = material(0.64, 0.39, 0.19);
const green = material(0.17, 0.48, 0.2);
const red = material(0.76, 0.16, 0.12);
const glass = material(0.55, 0.79, 0.84);
const cardboard = material(0.65, 0.5, 0.32);
const metal = material(0.57, 0.61, 0.65);
metal.metalness = 0.75;
metal.useMetalness = true;
metal.gloss = 0.65;
metal.update();
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

function makeShape(root: pc.Entity, name: string, accent: pc.StandardMaterial): void {
  const part = (type: string, size: number[], pos = [0, 0, 0], m = accent) => visual(root, type, size, pos, m);
  const ring = (size: number[], pos: number[], m = metal) => part('torus', size, pos, m);
  const eyes = (y: number, z: number, gap: number) => {
    for (const x of [-gap, gap]) part('sphere', [0.055, 0.07, 0.035], [x, y, z], dark);
  };
  const bowl = (m: pc.StandardMaterial) => {
    part('sphere', [0.82, 0.55, 0.82], [0, -0.13, 0], m);
    part('cylinder', [0.65, 0.025, 0.65], [0, 0.1, 0], dark);
    ring([0.78, 0.16, 0.78], [0, 0.1, 0], m);
  };
  const packet = (m: pc.StandardMaterial) => {
    part('box', [0.72, 0.78, 0.45], [0, -0.03, 0], m);
    part('box', [0.8, 0.07, 0.2], [0, 0.4, 0], m);
    part('box', [0.45, 0.35, 0.02], [0, 0, 0.235], ceramic);
  };
  switch (name) {
    case 'Remote control':
      part('box', [0.95, 0.65, 1], [0, 0, 0], dark);
      part('sphere', [0.19, 0.1, 0.1], [-0.23, 0.35, -0.34], red);
      for (let i = 0; i < 9; i++) part('box', [0.16, 0.07, 0.09], [(i % 3 - 1) * 0.25, 0.36, -0.12 + Math.floor(i / 3) * 0.18], grey);
      break;
    case 'Sofa cushion':
    case 'Pillow':
      part('sphere', [1, 0.57, 0.86], [0, 0, 0], name === 'Pillow' ? ceramic : blue);
      for (const x of [-0.44, 0.44]) part('box', [0.018, 0.025, 0.53], [x, 0, 0], ceramic);
      break;
    case 'Coaster stack':
      for (let i = 0; i < 4; i++) part('cylinder', [0.9, 0.13, 0.9], [0, -0.3 + i * 0.18, 0], i % 2 ? wood : cardboard);
      break;
    case 'Houseplant':
      part('cylinder', [0.58, 0.43, 0.58], [0, -0.28, 0], leather);
      part('cylinder', [0.52, 0.025, 0.52], [0, -0.055, 0], dark);
      part('cylinder', [0.04, 0.48, 0.04], [0, 0.18, 0], green);
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5;
        part('sphere', [0.2, 0.13, 0.5], [Math.sin(angle) * 0.19, 0.18 + (i % 2) * 0.15, Math.cos(angle) * 0.19], green)
          .setLocalEulerAngles(25, angle * pc.math.RAD_TO_DEG, 0);
      }
      break;
    case 'Table lamp':
    case 'Bedside lamp':
      part('cylinder', [0.7, 0.1, 0.7], [0, -0.45, 0], metal);
      part('cylinder', [0.07, 0.65, 0.07], [0, -0.08, 0], metal);
      part('cone', [0.85, 0.43, 0.85], [0, 0.26, 0], ceramic);
      ring([0.81, 0.06, 0.81], [0, 0.05, 0], wood);
      break;
    case 'Rolled-up rug':
    case 'Duvet roll':
      part('cylinder', [0.57, 1, 0.57], [0, 0, 0], name === 'Duvet roll' ? ceramic : red).setLocalEulerAngles(0, 0, 90);
      for (const x of [-0.26, 0.26]) ring([0.6, 0.07, 0.6], [x, 0, 0], cardboard).setLocalEulerAngles(0, 0, 90);
      for (const s of [0.39, 0.22]) ring([s, 0.03, s], [0.505, 0, 0], wood).setLocalEulerAngles(0, 0, 90);
      break;
    case 'Dinner plate':
      part('cylinder', [0.97, 0.35, 0.97], [0, -0.12, 0], ceramic);
      ring([0.93, 0.38, 0.93], [0, 0.03, 0], ceramic);
      ring([0.7, 0.03, 0.7], [0, 0.095, 0], blue);
      break;
    case 'Wine glass':
      part('cylinder', [0.55, 0.055, 0.55], [0, -0.46, 0], glass);
      part('cylinder', [0.055, 0.47, 0.055], [0, -0.2, 0], glass);
      part('sphere', [0.62, 0.52, 0.62], [0, 0.2, 0], glass);
      part('cylinder', [0.44, 0.02, 0.44], [0, 0.405, 0], dark);
      ring([0.5, 0.05, 0.5], [0, 0.41, 0], glass);
      break;
    case 'Napkin ring':
      ring([0.63, 0.35, 0.63], [0, 0, 0], wood).setLocalEulerAngles(90, 0, 0);
      part('box', [0.35, 0.2, 0.95], [0, 0, 0], ceramic).setLocalEulerAngles(0, 0, 20);
      break;
    case 'Candlestick':
      part('cylinder', [0.65, 0.1, 0.65], [0, -0.45, 0], metal);
      part('cylinder', [0.12, 0.4, 0.12], [0, -0.22, 0], metal);
      part('cylinder', [0.35, 0.07, 0.35], [0, 0, 0], metal);
      part('cylinder', [0.19, 0.43, 0.19], [0, 0.25, 0], ceramic);
      part('cylinder', [0.022, 0.04, 0.022], [0, 0.48, 0], dark);
      break;
    case 'Fruit bowl':
      bowl(ceramic);
      part('sphere', [0.3, 0.29, 0.3], [-0.17, 0.17, 0.02], red);
      part('sphere', [0.3, 0.28, 0.3], [0.16, 0.18, 0.12], green);
      part('sphere', [0.48, 0.17, 0.14], [0.02, 0.25, -0.17], yellow).setLocalEulerAngles(0, -25, 0);
      break;
    case 'Dining chair':
      part('box', [0.9, 0.12, 0.8], [0, -0.04, 0], wood);
      for (const x of [-0.35, 0.35]) for (const z of [-0.3, 0.3])
        part('box', [0.1, z < 0 ? 0.96 : 0.41, 0.1], [x, z < 0 ? -0.02 : -0.295, z], wood);
      for (const y of [0.2, 0.4]) part('box', [0.75, 0.12, 0.09], [0, y, -0.3], wood);
      break;
    case 'Alarm clock':
      part('cylinder', [0.78, 0.38, 0.78], [0, 0, 0], red).setLocalEulerAngles(90, 0, 0);
      part('cylinder', [0.66, 0.015, 0.66], [0, 0, 0.2], ceramic).setLocalEulerAngles(90, 0, 0);
      part('box', [0.035, 0.25, 0.02], [0, 0.1, 0.215], dark);
      part('box', [0.22, 0.035, 0.02], [0.09, 0, 0.215], dark);
      for (const x of [-0.25, 0.25]) {
        part('sphere', [0.29, 0.17, 0.32], [x, 0.38, 0], metal);
        part('box', [0.08, 0.16, 0.14], [x, -0.38, 0], metal);
      }
      break;
    case 'Slipper':
      part('sphere', [0.58, 0.13, 1], [0, -0.3, 0], dark);
      part('sphere', [0.61, 0.43, 0.65], [0, -0.1, -0.15], red);
      part('sphere', [0.42, 0.04, 0.35], [0, -0.03, 0.18], dark);
      ring([0.5, 0.08, 0.4], [0, 0.015, 0.14], ceramic);
      break;
    case 'Mattress-in-a-box':
    case 'Flatpack box':
      part('box', [0.94, name === 'Flatpack box' ? 0.42 : 0.95, 0.7], [0, 0, 0], cardboard);
      part('box', [0.12, name === 'Flatpack box' ? 0.43 : 0.96, 0.715], [0, 0, 0], wood);
      part('box', [0.38, 0.23, 0.015], [-0.19, 0.06, 0.36], ceramic);
      for (let i = 0; i < 4; i++) part('box', [0.035, 0.11, 0.02], [-0.3 + i * 0.06, 0.04, 0.375], dark);
      break;
    case 'Mug':
      part('cylinder', [0.64, 0.83, 0.64], [-0.13, -0.04, 0], ceramic);
      part('cylinder', [0.51, 0.02, 0.51], [-0.13, 0.365, 0], dark);
      ring([0.61, 0.05, 0.61], [-0.13, 0.38, 0], ceramic);
      ring([0.46, 0.15, 0.6], [0.25, -0.01, 0], ceramic).setLocalEulerAngles(90, 0, 0);
      break;
    case 'Colander':
      bowl(metal);
      for (const x of [-0.43, 0.43]) ring([0.23, 0.08, 0.28], [x, 0.04, 0], metal);
      for (let i = 0; i < 7; i++) part('sphere', [0.05, 0.045, 0.02], [(i % 4 - 1.5) * 0.13, -0.06 - Math.floor(i / 4) * 0.13, 0.35], dark);
      break;
    case 'Rolling pin':
      part('cylinder', [0.3, 0.68, 0.3], [0, 0, 0], wood).setLocalEulerAngles(0, 0, 90);
      for (const x of [-0.42, 0.42]) part('cylinder', [0.13, 0.2, 0.13], [x, 0, 0], leather).setLocalEulerAngles(0, 0, 90);
      break;
    case 'Frying pan':
      part('cylinder', [0.65, 0.44, 0.85], [-0.17, -0.15, 0], metal);
      part('cylinder', [0.58, 0.05, 0.76], [-0.17, 0.085, 0], dark);
      ring([0.63, 0.12, 0.82], [-0.17, 0.12, 0], metal);
      part('box', [0.4, 0.18, 0.16], [0.28, 0.02, 0], dark);
      break;
    case 'Saucepan':
    case 'Pressure cooker':
      part('cylinder', [0.66, 0.62, 0.66], [0, -0.13, 0], metal);
      if (name === 'Saucepan') {
        part('box', [0.43, 0.12, 0.13], [0.32, 0.05, 0], dark);
        part('cylinder', [0.56, 0.025, 0.56], [0, 0.19, 0], dark);
        ring([0.64, 0.06, 0.64], [0, 0.19, 0], metal);
      } else {
        for (const x of [-0.39, 0.39]) part('box', [0.2, 0.12, 0.24], [x, 0.04, 0], dark);
        part('sphere', [0.73, 0.18, 0.73], [0, 0.23, 0], metal);
        part('box', [0.31, 0.1, 0.14], [0, 0.36, 0], dark);
        part('cylinder', [0.065, 0.11, 0.065], [0.2, 0.34, 0], red);
      }
      break;
    case 'Rubber duck':
      part('sphere', [0.85, 0.57, 0.86], [0, -0.18, 0.04], yellow);
      part('sphere', [0.5, 0.49, 0.5], [0, 0.2, 0.2], yellow);
      part('sphere', [0.33, 0.1, 0.27], [0, 0.12, 0.44], accent);
      for (const x of [-0.34, 0.34]) part('sphere', [0.16, 0.27, 0.48], [x, -0.15, 0], yellow);
      eyes(0.25, 0.415, 0.14);
      break;
    case 'Toy hammer':
      part('cylinder', [0.16, 0.7, 0.16], [0, -0.14, 0], wood);
      part('box', [0.83, 0.29, 0.45], [0, 0.25, 0], blue);
      for (const x of [-0.39, 0.39]) part('box', [0.1, 0.32, 0.48], [x, 0.25, 0], red);
      break;
    case 'Teddy bear':
      part('sphere', [0.56, 0.52, 0.4], [0, -0.12, 0], wood);
      part('sphere', [0.49, 0.43, 0.42], [0, 0.25, 0], wood);
      for (const x of [-0.22, 0.22]) {
        part('sphere', [0.18, 0.18, 0.13], [x, 0.43, 0], wood);
        part('sphere', [0.25, 0.23, 0.35], [x, -0.37, 0.08], wood);
        part('sphere', [0.22, 0.37, 0.23], [x * 1.5, -0.07, 0], wood);
      }
      part('sphere', [0.25, 0.17, 0.1], [0, 0.19, 0.2], cardboard);
      part('sphere', [0.085, 0.055, 0.04], [0, 0.23, 0.25], dark);
      eyes(0.3, 0.19, 0.1);
      break;
    case 'Xylophone':
      part('box', [0.94, 0.25, 0.75], [0, -0.15, 0], wood);
      for (let i = 0; i < 6; i++) part('box', [0.115, 0.09, 0.72 - i * 0.055], [-0.36 + i * 0.145, 0.02, 0], [red, yellow, green, blue, ceramic, accent][i]);
      part('cylinder', [0.035, 0.65, 0.035], [0, 0.14, 0], wood).setLocalEulerAngles(0, 0, 65);
      part('sphere', [0.12, 0.12, 0.12], [0.29, 0.28, 0], red);
      break;
    case 'Brick bucket':
      part('cylinder', [0.75, 0.7, 0.75], [0, -0.12, 0], blue);
      part('cylinder', [0.65, 0.03, 0.65], [0, 0.24, 0], dark);
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 0.22;
        const m = [red, yellow, green][i];
        part('box', [0.22, 0.18, 0.25], [x, 0.3, 0], m);
        part('cylinder', [0.07, 0.035, 0.07], [x, 0.41, 0], m);
      }
      break;
    case 'Rocking horse':
      part('sphere', [0.41, 0.32, 0.66], [0, -0.02, 0], wood);
      part('box', [0.23, 0.48, 0.23], [0, 0.16, 0.23], wood).setLocalEulerAngles(-20, 0, 0);
      part('sphere', [0.26, 0.2, 0.39], [0, 0.35, 0.32], wood);
      for (const x of [-0.09, 0.09]) part('cone', [0.07, 0.16, 0.07], [x, 0.48, 0.22], wood);
      for (const x of [-0.22, 0.22]) {
        for (const z of [-0.22, 0.22]) part('box', [0.085, 0.3, 0.09], [x, -0.26, z], wood);
        for (let i = 0; i < 5; i++) {
          const z = (i - 2) * 0.18;
          part('box', [0.13, 0.08, 0.2], [x, -0.44 + z * z * 0.7, z], dark).setLocalEulerAngles(-z * 65, 0, 0);
        }
      }
      part('box', [0.37, 0.07, 0.26], [0, 0.14, -0.06], red);
      eyes(0.38, 0.45, 0.11);
      break;
    case 'Tealight bag':
      packet(glass);
      for (let i = 0; i < 4; i++) {
        const x = (i % 2 - 0.5) * 0.3;
        const y = -0.2 + Math.floor(i / 2) * 0.3;
        part('cylinder', [0.22, 0.055, 0.22], [x, y, 0.26], ceramic).setLocalEulerAngles(90, 0, 0);
      }
      break;
    case 'Scented candle':
      part('cylinder', [0.65, 0.84, 0.65], [0, -0.03, 0], glass);
      part('cylinder', [0.56, 0.035, 0.56], [0, 0.4, 0], ceramic);
      part('cylinder', [0.025, 0.08, 0.025], [0, 0.45, 0], dark);
      part('box', [0.32, 0.33, 0.025], [0, -0.04, 0.325], ceramic);
      break;
    case 'Picture frame':
      for (const x of [-0.42, 0.42]) part('box', [0.12, 0.95, 0.12], [x, 0, 0], wood);
      for (const y of [-0.415, 0.415]) part('box', [0.85, 0.12, 0.12], [0, y, 0], wood);
      part('box', [0.72, 0.74, 0.035], [0, 0, 0], ceramic);
      part('sphere', [0.17, 0.17, 0.02], [0.17, 0.17, 0.03], yellow);
      part('cone', [0.5, 0.43, 0.03], [-0.07, -0.11, 0.04], green);
      break;
    case 'Ice cube tray':
      part('box', [0.85, 0.2, 0.95], [0, -0.2, 0], blue);
      for (let i = 0; i < 6; i++) {
        const x = (i % 2 - 0.5) * 0.37;
        const z = (Math.floor(i / 2) - 1) * 0.29;
        part('box', [0.27, 0.015, 0.21], [x, -0.095, z], dark);
        part('box', [0.22, 0.11, 0.17], [x, -0.04, z], glass);
      }
      break;
    case 'Toilet brush':
      part('cylinder', [0.12, 0.68, 0.12], [0, 0.1, 0], blue);
      part('sphere', [0.45, 0.37, 0.45], [0, -0.3, 0], ceramic);
      for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3;
        part('box', [0.065, 0.3, 0.065], [Math.cos(angle) * 0.2, -0.29, Math.sin(angle) * 0.2], grey);
      }
      break;
    case 'Lampshade':
      part('cone', [0.96, 0.8, 0.96], [0, 0, 0], ceramic);
      ring([0.92, 0.05, 0.92], [0, -0.4, 0], wood);
      break;
    case 'Watering can':
      part('cylinder', [0.56, 0.64, 0.56], [-0.09, -0.12, 0], green);
      ring([0.62, 0.12, 0.66], [-0.19, 0.2, 0], green).setLocalEulerAngles(90, 0, 0);
      part('cylinder', [0.11, 0.64, 0.11], [0.27, 0.02, 0], green).setLocalEulerAngles(0, 0, -40);
      part('sphere', [0.24, 0.075, 0.24], [0.47, 0.27, 0], metal).setLocalEulerAngles(0, 0, -40);
      break;
    case 'Meatball bag':
      packet(blue);
      for (const x of [-0.13, 0, 0.13]) part('sphere', [0.12, 0.12, 0.035], [x, 0, 0.26], leather);
      break;
    case 'Storage tub':
      part('box', [0.9, 0.63, 0.72], [0, -0.13, 0], glass);
      part('box', [1, 0.12, 0.8], [0, 0.25, 0], blue);
      for (const x of [-0.48, 0.48]) part('box', [0.06, 0.12, 0.25], [x, 0.15, 0], dark);
      break;
    default: throw new Error(`Missing prototype model: ${name}`);
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
    makeShape(model, name, colours[tier]);
    let bottom = Infinity;
    for (const child of model.children) {
      if (child instanceof pc.Entity && child.render) {
        for (const mesh of child.render.meshInstances) bottom = Math.min(bottom, mesh.aabb.getMin().y);
      }
    }
    // Shallow objects sit on their collision base, rather than floating inside it.
    model.setLocalPosition(0, -size[1] * (0.5 + bottom), 0);
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
  e.setLocalRotation(new pc.Quat().setFromDirections(pc.Vec3.UP, dir));
}
const forkPoint = (t: number) => new pc.Vec3(0.105 * Math.sin(t * Math.PI / 2), 0.075 - 0.07 * Math.cos(t * Math.PI / 2), 0);
for (let i = 0; i < 8; i++) rod(sling, forkPoint(-1 + i / 4), forkPoint(-1 + (i + 1) / 4), 0.026, blue);
const tipL = new pc.Vec3(-0.105, 0.185, 0);
const tipR = new pc.Vec3(0.105, 0.185, 0);
rod(sling, forkPoint(-1), tipL, 0.026, blue);
rod(sling, forkPoint(1), tipR, 0.026, blue);
rod(sling, new pc.Vec3(0, 0.005, 0), new pc.Vec3(0, -0.115, 0), 0.034, dark);
const POUCH_HEIGHT = tipL.y;
const POUCH_HALF_WIDTH = 0.03;
const BAND_WIDTH = 0.012;
const cup = visual(sling, 'sphere', [0.065, 0.055, 0.025], [0, POUCH_HEIGHT, 0.08], leather);
cup.name = 'sling-pouch';
const bandL = rod(sling, tipL, new pc.Vec3(-POUCH_HALF_WIDTH, POUCH_HEIGHT, 0.08), BAND_WIDTH, dark);
const bandR = rod(sling, tipR, new pc.Vec3(POUCH_HALF_WIDTH, POUCH_HEIGHT, 0.08), BAND_WIDTH, dark);
bandL.name = 'band-left';
bandR.name = 'band-right';
let loadedModel: pc.Entity | null = null;
function showLoaded(): void {
  loadedModel?.destroy();
  loadedModel = null;
  if (!loaded) return;
  loadedModel = loaded.model.clone();
  loadedModel.name = 'loaded product';
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
let clickAudio: AudioContext | null = null;
let clickBuffer: AudioBuffer | null = null;
let lastClick = -Infinity;
async function dryFireClick(): Promise<boolean> {
  const now = performance.now();
  if (now - lastClick < 100) return false;
  lastClick = now;
  try {
    clickAudio ??= new AudioContext();
    if (!clickBuffer) {
      clickBuffer = clickAudio.createBuffer(1, Math.ceil(clickAudio.sampleRate * 0.09), clickAudio.sampleRate);
      const samples = clickBuffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    await clickAudio.resume();
    if (clickAudio.state !== 'running') throw new Error(`Audio engine is ${clickAudio.state}`);
    const start = clickAudio.currentTime;
    const out = clickAudio.createGain();
    out.gain.value = 0.9;
    out.connect(clickAudio.destination);

    const source = clickAudio.createBufferSource();
    source.buffer = clickBuffer;
    // Wide band centred where small monitor speakers are most efficient; a tight
    // filter here throws away most of the burst's energy and the click vanishes.
    const filter = clickAudio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.7;
    const gain = clickAudio.createGain();
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.exponentialRampToValueAtTime(1, start + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.085);
    source.connect(filter).connect(gain).connect(out);

    // Pitched body under the noise, so the snap reads as a band release, not a tick.
    const body = clickAudio.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(900, start);
    body.frequency.exponentialRampToValueAtTime(320, start + 0.06);
    const bodyGain = clickAudio.createGain();
    bodyGain.gain.setValueAtTime(0.001, start);
    bodyGain.gain.exponentialRampToValueAtTime(0.5, start + 0.004);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, start + 0.07);
    body.connect(bodyGain).connect(out);

    source.onended = () => {
      source.disconnect(); filter.disconnect(); gain.disconnect();
      body.disconnect(); bodyGain.disconnect(); out.disconnect();
    };
    source.start(start);
    body.start(start);
    body.stop(start + 0.09);
    return true;
  } catch (error) {
    console.error('Dry-fire audio unavailable', error);
    say('Dry-fire sound unavailable in this browser.');
    return false;
  }
}
function emptyClick(): void {
  if (queue.length) { say('Press R to load the next item.'); return; }
  if (cfg.empty === 'click' || cfg.empty === 'click-message') {
    revealUntil = 0;
    if (cfg.empty === 'click-message') say('Pouch empty. E grabs shelf or fallen stock.');
    else el('ammo-message').textContent = '';
    void dryFireClick();
    return;
  }
  say('Pouch empty. E grabs shelf or fallen stock.');
  if (cfg.empty === 'shelves') revealUntil = performance.now() + 2400;
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
  <div id="panel"><h2>Grab / load comparison</h2><p id="blurb"></p>
    <div id="grab-knobs"></div>
    <label>Empty-pouch feedback<select id="empty-mode"><option value="text">Message only</option><option value="shelves">Message + visible stock markers</option><option value="click">Dry-fire click</option><option value="click-message">Click + message</option></select></label>
    <details id="audio-diagnostics"><summary>Audio diagnostics (deferred)</summary>
      <button id="test-click">Test click</button> <button id="test-tone">Test tone</button> <button id="test-wa-tone">Test Web Audio tone</button><p class="note" id="sound-status"></p>
      <audio id="reference-tone" controls style="width:100%" aria-label="Reference tone audio player"></audio>
    </details>
    <details><summary>Weight-tier physics</summary><div id="tier-knobs"></div></details>
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
el('test-click').onclick = async () => {
  el('sound-status').textContent = 'Starting audio...';
  const started = await dryFireClick();
  el('sound-status').textContent = started ? 'Click sent. Audio engine is running.' : 'Click not sent. Check the message above, then try again.';
};
// Discriminator: a loud, sustained tone down the SAME Web Audio path as the click.
// If the native player's tone is audible and this one is not, the fault is Web Audio
// output routing in this browser, not click synthesis or envelope shaping.
el('test-wa-tone').onclick = async () => {
  el('sound-status').textContent = 'Starting Web Audio tone...';
  try {
    clickAudio ??= new AudioContext();
    await clickAudio.resume();
    const start = clickAudio.currentTime;
    const osc = clickAudio.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 660;
    const gain = clickAudio.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
    gain.gain.setValueAtTime(0.4, start + 1.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.4);
    osc.connect(gain).connect(clickAudio.destination);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    osc.start(start);
    osc.stop(start + 1.45);
    const sink = (clickAudio as AudioContext & { sinkId?: unknown }).sinkId;
    const sinkLabel = typeof sink === 'string' ? (sink === '' ? 'default' : sink) : 'unavailable';
    el('sound-status').textContent =
      `Web Audio tone sent for 1.4 s. state=${clickAudio.state}, sampleRate=${clickAudio.sampleRate}, sinkId=${sinkLabel}. ` +
      `If the native Test tone is audible and this is not, Web Audio is routed to a different output.`;
  } catch (error) {
    el('sound-status').textContent = `Web Audio error: ${error instanceof Error ? error.message : String(error)}`;
  }
};
const referenceTone = el('reference-tone');
if (!(referenceTone instanceof HTMLAudioElement)) throw new Error('Missing reference audio player');
const sampleRate = 44100;
const sampleCount = Math.round(sampleRate * 0.4);
const toneWav = new ArrayBuffer(44 + sampleCount * 2);
const wav = new DataView(toneWav);
for (const [offset, text] of [[0, 'RIFF'], [8, 'WAVE'], [12, 'fmt '], [36, 'data']] as const)
  for (let i = 0; i < text.length; i++) wav.setUint8(offset + i, text.charCodeAt(i));
wav.setUint32(4, 36 + sampleCount * 2, true);
wav.setUint32(16, 16, true);
wav.setUint16(20, 1, true);
wav.setUint16(22, 1, true);
wav.setUint32(24, sampleRate, true);
wav.setUint32(28, sampleRate * 2, true);
wav.setUint16(32, 2, true);
wav.setUint16(34, 16, true);
wav.setUint32(40, sampleCount * 2, true);
for (let i = 0; i < sampleCount; i++) {
  const time = i / sampleRate;
  const envelope = Math.min(1, time / 0.02, (0.4 - time) / 0.02);
  wav.setInt16(44 + i * 2, Math.round(Math.sin(time * 660 * Math.PI * 2) * 0.15 * envelope * 32767), true);
}
const toneUrl = URL.createObjectURL(new Blob([toneWav], { type: 'audio/wav' }));
referenceTone.src = toneUrl;
referenceTone.onended = () => { el('sound-status').textContent = 'Native audio player finished the reference tone.'; };
window.addEventListener('pagehide', () => URL.revokeObjectURL(toneUrl), { once: true });
el('test-tone').onclick = async () => {
  el('sound-status').textContent = 'Starting native audio player...';
  try {
    referenceTone.currentTime = 0;
    await referenceTone.play();
    el('sound-status').textContent = 'Native audio player is playing the reference tone.';
  } catch (error) {
    console.error('Reference tone unavailable', error);
    el('sound-status').textContent = `Audio error: ${error instanceof Error ? error.message : String(error)}`;
  }
};
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
  const pouch = new pc.Vec3(-charge * 0.06, POUCH_HEIGHT, 0.08 + charge * 0.07);
  cup.setLocalPosition(pouch);
  loadedModel?.setLocalPosition(pouch.clone().add(new pc.Vec3(0, 0, -0.035)));
  stretch(bandL, tipL, pouch.clone().add(new pc.Vec3(-POUCH_HALF_WIDTH, 0, 0)), BAND_WIDTH);
  stretch(bandR, tipR, pouch.clone().add(new pc.Vec3(POUCH_HALF_WIDTH, 0, 0)), BAND_WIDTH);
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
