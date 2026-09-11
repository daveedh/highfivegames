# PlayCanvas engine-only first-person controller research

Research ticket: #6  
Date: 2026-09-11

## Short answer

For a fast PlayCanvas engine-only proof of concept, start from the official engine example and the official `FirstPersonController` script that ships in the `playcanvas` npm package:

- Engine example: [`examples/src/examples/camera/first-person.example.mjs`](https://github.com/playcanvas/engine/blob/main/examples/src/examples/camera/first-person.example.mjs), runnable in the official examples browser as [Camera / First Person](https://playcanvas.github.io/#/camera/first-person).
- Controller script: [`playcanvas/scripts/esm/first-person-controller.mjs`](https://github.com/playcanvas/engine/blob/main/scripts/esm/first-person-controller.mjs).
- Package script README: [`scripts/esm/README.md`](https://github.com/playcanvas/engine/blob/main/scripts/esm/README.md).

Use a **dynamic rigidbody capsule** for the first playable version. It is the current first-party pattern, handles collision against static furniture/walls through Ammo physics, already includes pointer-lock mouse look, WASD, sprint, jump, ground detection, and tuning knobs, and is liftable into an npm/bundler app. A custom kinematic controller is possible, but PlayCanvas does not expose a separate core `CharacterController` component/primitive comparable to Unity's character controller; you would need to write sweep/slide/step handling yourself or use Ammo directly.

## What PlayCanvas provides vs. what we write

### Provided by PlayCanvas engine/package

- **Engine-only application wiring.** The Engine manual says PlayCanvas can be used directly against the engine, and the engine is published on npm with TypeScript declarations and examples. The standalone example shows `import * as pc from 'playcanvas'`, `new pc.Application(canvas)`, camera/light/entities, and per-frame `app.on('update', ...)` code. Sources: [Engine manual](https://developer.playcanvas.com/user-manual/engine/), [Standalone engine page](https://developer.playcanvas.com/user-manual/engine/standalone/).
- **Input devices.** In engine examples, `AppBase`/`AppOptions` are configured with `new Mouse(document.body)`, `new Keyboard(window)`, `new TouchDevice(document.body)`, and `new GamePads()`. Source: [`camera/first-person.example.mjs`](https://github.com/playcanvas/engine/blob/main/examples/src/examples/camera/first-person.example.mjs).
- **Pointer lock helpers.** `Mouse#enablePointerLock(success, error)`, `Mouse#disablePointerLock(success)`, and `Mouse.isPointerLocked()` are in the engine. The source notes that pointer lock requests can only be initiated by a user action, and some browsers may require fullscreen. Source: [`src/platform/input/mouse.js`](https://github.com/playcanvas/engine/blob/main/src/platform/input/mouse.js).
- **Keyboard polling.** `Keyboard` tracks pressed/wasPressed/wasReleased states, clears on blur/visibility loss, and can be attached to `window` or an element. Source: [`src/platform/input/keyboard.js`](https://github.com/playcanvas/engine/blob/main/src/platform/input/keyboard.js).
- **Physics bodies and collisions.** PlayCanvas physics is powered by ammo.js/Bullet; rigidbody and collision components are available in engine-only, Editor, React, and Web Components. Sources: [Physics overview](https://developer.playcanvas.com/user-manual/physics/), [Rigid Bodies](https://developer.playcanvas.com/user-manual/physics/rigid-bodies/).
- **Collision shapes.** Collision components support box, sphere, capsule, cylinder, cone, mesh, and compound. If paired with a rigidbody, the collision component defines the rigidbody shape; without a rigidbody, it is a trigger. Sources: [Collision component docs](https://developer.playcanvas.com/user-manual/editor/scenes/components/collision/), [`CollisionComponent` source](https://github.com/playcanvas/engine/blob/main/src/framework/components/collision/component.js).
- **Raycasts.** `app.systems.rigidbody.raycastFirst()` and `raycastAll()` query collision shapes. The docs explicitly show ground probing by casting down from the player position and filtering out the player entity. Source: [Ray casting docs](https://developer.playcanvas.com/user-manual/physics/ray-casting/).
- **Ready-to-use first-person script.** The package README says `playcanvas/scripts/esm/*` scripts ship inside the npm package but are not part of the core engine bundle; they include first- and third-person controllers. Source: [`scripts/esm/README.md`](https://github.com/playcanvas/engine/blob/main/scripts/esm/README.md).
- **Official first-person controller.** `FirstPersonController` is a physics-based first-person character controller with keyboard/mouse pointer lock, touch, gamepad, dynamic rigidbody movement, capsule collision, damped ground/air movement, sprinting, jumping, and camera control. Source: [`first-person-controller.mjs`](https://github.com/playcanvas/engine/blob/main/scripts/esm/first-person-controller.mjs).

### We must write or choose

- Game-specific controller glue if we do not use the packaged `FirstPersonController` directly.
- Pointer-lock UX overlay text such as “Click to play / Esc releases mouse”.
- Any step-up, slope-limit, crouch, head-bob, ladder, moving-platform polish beyond the first-party script.
- Collision authoring for furniture: simple static boxes/capsules/compound shapes for shelves and obstacles where possible; static mesh collision for complex level geometry only when needed.
- A custom kinematic sweep/slide controller only if the rigidbody capsule feels too bouncy or unpredictable.

## Pointer lock and mouse-look pattern

### Browser requirements and gotchas

Use either the newer first-party `KeyboardMouseSource({ pointerLock: true })` path through `FirstPersonController`, or call `app.mouse.enablePointerLock()` from a user gesture.

Important details from PlayCanvas and browser sources:

- PlayCanvas `Mouse#enablePointerLock()` calls `document.body.requestPointerLock()` and supports success/error callbacks. It no-ops through the error callback when `requestPointerLock` is unavailable. Source: [`mouse.js`](https://github.com/playcanvas/engine/blob/main/src/platform/input/mouse.js).
- Pointer lock must be requested from a user action such as a mouse or keyboard input handler. Source: [`mouse.js`](https://github.com/playcanvas/engine/blob/main/src/platform/input/mouse.js); browser background: [MDN Pointer Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API).
- Some browsers may require fullscreen before pointer lock. Source: [`mouse.js`](https://github.com/playcanvas/engine/blob/main/src/platform/input/mouse.js).
- Esc exits pointer lock; code should tolerate losing lock and show the click-to-play overlay again. The official `KeyboardMouseSource` ignores keydown input while pointer lock is requested but the element is not locked. Source: [`keyboard-mouse-source.js`](https://github.com/playcanvas/engine/blob/main/src/extras/input/sources/keyboard-mouse-source.js).
- Pointer-locked motion should use relative deltas, not absolute coordinates. PlayCanvas `Mouse` reports pointer-locked movement using browser relative deltas; `KeyboardMouseSource` uses native `event.movementX/Y` while locked. Sources: [`mouse.js`](https://github.com/playcanvas/engine/blob/main/src/platform/input/mouse.js), [`keyboard-mouse-source.js`](https://github.com/playcanvas/engine/blob/main/src/extras/input/sources/keyboard-mouse-source.js).
- Attach keyboard to `window` or ensure the element can receive focus. The `Keyboard` constructor notes that elements like `div` need `tabindex="0"` to accept focus. Source: [`keyboard.js`](https://github.com/playcanvas/engine/blob/main/src/platform/input/keyboard.js).
- Prevent the browser context menu if right-click or pointer capture matters. `Mouse#disableContextMenu()` exists; `KeyboardMouseSource` also prevents context menu on the attached element. Sources: [`mouse.js`](https://github.com/playcanvas/engine/blob/main/src/platform/input/mouse.js), [`keyboard-mouse-source.js`](https://github.com/playcanvas/engine/blob/main/src/extras/input/sources/keyboard-mouse-source.js).

### Mouse-look implementation sketch

The old tutorial uses `app.mouse.on('mousemove', ...)`, enters pointer lock from `mousedown`, accumulates yaw/pitch from `e.dx/e.dy`, and applies them to the camera. Source: [First Person Movement tutorial](https://developer.playcanvas.com/tutorials/first-person-movement/). That tutorial is useful for the shape of the algorithm, but it is an older Editor-style `pc.createScript`/global `pc` sample. For engine-only v2.x, prefer ES modules and the package script.

If writing our own instead of using `FirstPersonController`, use this shape:

```js
let yaw = 0;
let pitch = 0;
const sensitivity = 0.08; // degrees per CSS pixel; official script default

canvas.addEventListener('click', () => {
  canvas.requestPointerLock();
});

window.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas) return;

  yaw -= event.movementX * sensitivity;
  pitch = pc.math.clamp(pitch - event.movementY * sensitivity, -85, 85);

  player.setLocalEulerAngles(0, yaw, 0);
  camera.setLocalEulerAngles(pitch, 0, 0);
});
```

The official controller stores angles, clamps pitch to `[-90, 90]`, sets the camera local Euler angles, and uses yaw to rotate movement vectors. Source: [`first-person-controller.mjs`](https://github.com/playcanvas/engine/blob/main/scripts/esm/first-person-controller.mjs).

## WASD movement approaches

### Option A: dynamic rigidbody capsule (recommended for first PoC)

Official example setup:

```js
const camera = new Entity();
camera.addComponent('camera', { fov: 90 });
camera.setLocalPosition(0, 0.5, 0);

const characterController = new Entity('cc');
characterController.setPosition(5, 2, 10);
characterController.addChild(camera);
characterController.addComponent('collision', {
  type: 'capsule',
  radius: 0.5,
  height: 2
});
characterController.addComponent('rigidbody', {
  type: 'dynamic',
  mass: 100,
  linearDamping: 0,
  angularDamping: 0,
  linearFactor: Vec3.ONE,
  angularFactor: Vec3.ZERO,
  friction: 0.5,
  restitution: 0
});
characterController.addComponent('script');
characterController.script.create(FirstPersonController, {
  properties: { camera, jumpForce: 850 }
});
```

Source: [`camera/first-person.example.mjs`](https://github.com/playcanvas/engine/blob/main/examples/src/examples/camera/first-person.example.mjs).

How it moves:

- Dynamic bodies are fully simulated: gravity, collisions, forces, impulses, and physics-owned transform. Source: [Rigid Bodies docs](https://developer.playcanvas.com/user-manual/physics/rigid-bodies/).
- The official controller creates a capsule collision and dynamic rigidbody if absent, with radius `0.5`, height `2`, mass `100`, angular factor zero, friction `0.5`, restitution `0`. Source: [`first-person-controller.mjs`](https://github.com/playcanvas/engine/blob/main/scripts/esm/first-person-controller.mjs).
- It reads WASD/arrow keys, normalizes input, multiplies by `speedGround` or `speedAir`, rotates the movement by yaw, damps X/Z velocity, and assigns `rigidbody.linearVelocity`. Source: [`first-person-controller.mjs`](https://github.com/playcanvas/engine/blob/main/scripts/esm/first-person-controller.mjs).
- The forces/impulses docs explicitly say direct `linearVelocity` assignment is useful when a character should reach an exact speed immediately, and points to the official first/third-person controller scripts. Source: [Forces and impulses docs](https://developer.playcanvas.com/user-manual/physics/forces-and-impulses/).

Pros for the furniture-store maze:

- Fastest path to a playable browser FPS.
- Uses PlayCanvas/Ammo collisions directly against static shelves, walls, floors, and robots.
- Capsule shape slides better than a box over edges and corners.
- Dynamic player can be pushed by explosions/guards/projectiles if desired.
- Official source to lift and tune.

Cons:

- Physics-driven capsules can feel floaty, bouncy, or snaggy in tight clutter unless damping, friction, collision margins, and furniture colliders are simplified.
- Stepping up small thresholds, slope limits, and stair behavior are not solved as high-level gameplay primitives.
- Dynamic bodies are owned by physics; setting entity transforms directly will be overwritten on the next physics step. Use velocity/impulses or `rigidbody.teleport()` for respawn. Source: [Rigid Bodies docs](https://developer.playcanvas.com/user-manual/physics/rigid-bodies/).

### Option B: kinematic/custom character controller

Kinematic bodies are moved by your code through entity transforms; they have infinite mass, ignore forces/impulses/gravity, push dynamic bodies, and are not affected by them. Sources: [Rigid Bodies docs](https://developer.playcanvas.com/user-manual/physics/rigid-bodies/), [Forces and impulses docs](https://developer.playcanvas.com/user-manual/physics/forces-and-impulses/), [`constants.js`](https://github.com/playcanvas/engine/blob/main/src/framework/components/rigid-body/constants.js).

Pros:

- More deterministic game feel in a maze: exact acceleration, max speed, friction, slopes, and step height.
- Less chance that tiny furniture props or physics impulses shove the player around.
- Easier to make “arcade FPS” movement feel intentional.

Cons:

- PlayCanvas does not provide a high-level kinematic character sweep/slide/step primitive in the core API. A search of the current engine tree shows first/third-person controller scripts, but no separate `character-controller` component or exposed `btKinematicCharacterController` wrapper.
- A robust kinematic controller must handle capsule casts or multiple raycasts, wall sliding, depenetration, floor snapping, step-up/step-down, slope rejection, ceilings, and moving platforms.
- Simple `setPosition()` movement without shape sweeps can tunnel through thin furniture or stick in corners.

Recommendation: use dynamic capsule now; revisit kinematic only if playtests show the physics capsule cannot be tuned for the maze.

## Jumping and ground detection

The first-party controller uses a downward raycast:

- It casts from the character entity position to `Vec3.DOWN` plus another `0.1` meters and treats any hit as grounded. Source: [`first-person-controller.mjs`](https://github.com/playcanvas/engine/blob/main/scripts/esm/first-person-controller.mjs).
- The ray-casting docs explicitly show probing ground by casting down from the player, filtering out the player, and checking for non-null hit. Source: [Ray casting docs](https://developer.playcanvas.com/user-manual/physics/ray-casting/#probing-the-environment).
- It applies jump as an impulse only when grounded and not already jumping; the script clears `_jumping` when vertical velocity becomes negative. Source: [`first-person-controller.mjs`](https://github.com/playcanvas/engine/blob/main/scripts/esm/first-person-controller.mjs).
- PlayCanvas docs distinguish forces from impulses: force over time, impulse as instant velocity change; impulses only affect dynamic bodies. Source: [Forces and impulses docs](https://developer.playcanvas.com/user-manual/physics/forces-and-impulses/).

For our implementation, improve the official sketch slightly by filtering out the player and optionally requiring an upward-facing normal:

```js
function isGrounded(app, player) {
  const from = player.getPosition();
  const to = new pc.Vec3(from.x, from.y - 1.15, from.z);
  const hit = app.systems.rigidbody.raycastFirst(from, to, {
    filterCallback: (entity) => entity !== player
  });

  return !!hit && hit.normal.y > 0.5;
}
```

For the official capsule defaults (`height: 2`, `radius: 0.5`, origin at capsule center), a ray distance around `1.05` to `1.15` meters reaches just below the bottom of the capsule. Add coyote time later if jumps feel unforgiving.

## Concrete recommended implementation sketch

### Liftable engine-only setup

```js
import {
  AppBase,
  AppOptions,
  CameraComponentSystem,
  CollisionComponentSystem,
  Entity,
  FILLMODE_FILL_WINDOW,
  Keyboard,
  Mouse,
  RESOLUTION_AUTO,
  RenderComponentSystem,
  RigidBodyComponentSystem,
  ScriptComponentSystem,
  Vec3,
  WasmModule,
  createGraphicsDevice
} from 'playcanvas';
import { FirstPersonController } from 'playcanvas/scripts/esm/first-person-controller.mjs';

const canvas = document.getElementById('application-canvas');

WasmModule.setConfig('Ammo', {
  glueUrl: '/wasm/ammo.wasm.js',
  wasmUrl: '/wasm/ammo.wasm.wasm',
  fallbackUrl: '/wasm/ammo.js'
});
await new Promise((resolve) => WasmModule.getInstance('Ammo', resolve));

const device = await createGraphicsDevice(canvas, {});
const options = new AppOptions();
options.graphicsDevice = device;
options.mouse = new Mouse(document.body);
options.keyboard = new Keyboard(window, { preventDefault: true });
options.componentSystems = [
  RenderComponentSystem,
  CameraComponentSystem,
  ScriptComponentSystem,
  CollisionComponentSystem,
  RigidBodyComponentSystem
];

const app = new AppBase(canvas);
app.init(options);
app.setCanvasFillMode(FILLMODE_FILL_WINDOW);
app.setCanvasResolution(RESOLUTION_AUTO);
app.start();

app.systems.rigidbody.gravity.set(0, -18, 0);

const camera = new Entity('camera');
camera.addComponent('camera', { fov: 85, farClip: 150 });
camera.setLocalPosition(0, 0.65, 0);

const player = new Entity('player');
player.setPosition(0, 2, 0);
player.addChild(camera);
player.addComponent('collision', {
  type: 'capsule',
  radius: 0.45,
  height: 1.8
});
player.addComponent('rigidbody', {
  type: 'dynamic',
  mass: 80,
  linearDamping: 0,
  angularDamping: 0,
  linearFactor: Vec3.ONE,
  angularFactor: Vec3.ZERO,
  friction: 0.7,
  restitution: 0
});
player.addComponent('script');
player.script.create(FirstPersonController, {
  properties: {
    camera,
    lookSens: 0.08,
    speedGround: 45,
    speedAir: 5,
    sprintMult: 1.35,
    velocityDampingGround: 0.99,
    velocityDampingAir: 0.99925,
    jumpForce: 500
  }
});
app.root.addChild(player);
```

### If writing a tiny custom controller

Use this only if the packaged script is too much. This is the same core pattern: pointer lock, yaw-only body, pitch-only camera, WASD relative to yaw, dynamic capsule velocity, raycast ground check, impulse jump.

```js
const move = new pc.Vec3();
const forward = new pc.Vec3();
const right = new pc.Vec3();
const velocity = new pc.Vec3();
const groundRayEnd = new pc.Vec3();
let yaw = 0;
let pitch = 0;
let grounded = false;

const cfg = {
  mouseSensitivity: 0.08,
  walkSpeed: 5.0,      // meters / second target horizontal speed
  airControl: 0.25,
  jumpImpulse: 5.5,
  groundRay: 1.05,
  eyeHeight: 0.65
};

canvas.addEventListener('click', () => canvas.requestPointerLock());
window.addEventListener('mousemove', (event) => {
  if (document.pointerLockElement !== canvas) return;
  yaw -= event.movementX * cfg.mouseSensitivity;
  pitch = pc.math.clamp(pitch - event.movementY * cfg.mouseSensitivity, -85, 85);
  player.setLocalEulerAngles(0, yaw, 0);
  camera.setLocalEulerAngles(pitch, 0, 0);
});

app.on('update', (dt) => {
  const p = player.getPosition();
  groundRayEnd.set(p.x, p.y - cfg.groundRay, p.z);
  const hit = app.systems.rigidbody.raycastFirst(p, groundRayEnd, {
    filterCallback: (entity) => entity !== player
  });
  grounded = !!hit && hit.normal.y > 0.5;

  move.set(0, 0, 0);
  if (app.keyboard.isPressed(pc.KEY_W)) move.z -= 1;
  if (app.keyboard.isPressed(pc.KEY_S)) move.z += 1;
  if (app.keyboard.isPressed(pc.KEY_A)) move.x -= 1;
  if (app.keyboard.isPressed(pc.KEY_D)) move.x += 1;
  if (move.lengthSq() > 0) move.normalize();

  const yawQuat = new pc.Quat().setFromEulerAngles(0, yaw, 0);
  yawQuat.transformVector(pc.Vec3.FORWARD, forward);
  yawQuat.transformVector(pc.Vec3.RIGHT, right);

  const desiredX = (right.x * move.x - forward.x * move.z) * cfg.walkSpeed;
  const desiredZ = (right.z * move.x - forward.z * move.z) * cfg.walkSpeed;
  const current = player.rigidbody.linearVelocity;
  const blend = grounded ? 1 : cfg.airControl;

  velocity.set(
    pc.math.lerp(current.x, desiredX, blend),
    current.y,
    pc.math.lerp(current.z, desiredZ, blend)
  );
  player.rigidbody.linearVelocity = velocity;

  if (grounded && app.keyboard.wasPressed(pc.KEY_SPACE)) {
    player.rigidbody.applyImpulse(0, cfg.jumpImpulse * player.rigidbody.mass, 0);
  }
});
```

## Starting tuning values

For the furniture-store maze proof of concept:

| Setting | Start value | Reason |
| --- | ---: | --- |
| Capsule radius | `0.45–0.5` m | Fits human-ish body; official script/example use `0.5`. |
| Capsule height | `1.8–2.0` m | Official script/example use `2`; `1.8` feels adult-height if world units are meters. |
| Camera local Y / eye height | `0.65–0.9` above player origin | Official first-person camera example uses `0.5`; Gaussian splat example uses `0.9`. With origin at capsule center, `0.65` gives approximately 1.55 m eye height for a 1.8 m capsule. |
| FOV | `80–90` | Official FPS map example uses `90`; splat example uses `75`. Start at `85` for comfort. |
| Mouse sensitivity | `0.08` | Official `FirstPersonController.lookSens` default. |
| Gravity | `-18` m/s² | Official FPS map increases gravity to `-18` for more realistic jumping; splat example uses `-10`. |
| Ground speed | `45–50` in official controller units | Official default is `50`; splat example uses `65`. Start lower for tight aisles. |
| Air speed | `5` | Official default. |
| Sprint multiplier | `1.3–1.5` | Official default `1.5`; splat example `1.73`. Keep low in mazes. |
| Jump force | `500–850` | Official FPS map uses `850` with gravity `-18`; splat example uses `420` with gravity `-10`. Start `500–650` and tune to shelf/obstacle scale. |
| Friction | `0.5–0.8` | Official uses `0.5`; higher may reduce sliding in tight aisles. |
| Restitution | `0` | Avoid bounce. |
| Angular factor | `Vec3.ZERO` | Official controller locks rotation so the capsule stays upright. |

## Official samples/tutorials to lift from

1. **Best current lift:** official engine example [`examples/src/examples/camera/first-person.example.mjs`](https://github.com/playcanvas/engine/blob/main/examples/src/examples/camera/first-person.example.mjs), live at [playcanvas.github.io/#/camera/first-person](https://playcanvas.github.io/#/camera/first-person). It is engine-only, ESM, uses `AppBase`, explicit component systems, Ammo WASM config, static mesh collision level, dynamic capsule player, and `FirstPersonController`.
2. **Another current lift:** [`examples/src/examples/gaussian-splatting/first-person.example.mjs`](https://github.com/playcanvas/engine/blob/main/examples/src/examples/gaussian-splatting/first-person.example.mjs), live at [playcanvas.github.io/#/gaussian-splatting/first-person](https://playcanvas.github.io/#/gaussian-splatting/first-person). It uses the same controller against a hidden static collision mesh.
3. **Reusable script:** [`playcanvas/scripts/esm/first-person-controller.mjs`](https://github.com/playcanvas/engine/blob/main/scripts/esm/first-person-controller.mjs). It ships with the npm package but is imported separately from `playcanvas/scripts/esm/...`, not from the core bundle. Source: [`scripts/esm/README.md`](https://github.com/playcanvas/engine/blob/main/scripts/esm/README.md).
4. **Older tutorial:** [First Person Movement tutorial](https://developer.playcanvas.com/tutorials/first-person-movement/) demonstrates the classic pointer-lock + `mousemove` + `applyForce` pattern, but it is an older Editor/global-`pc` style script (`pc.createScript`) and should not be the primary source for a new engine-only v2.x codebase.

## Recommended decision for High Five Games

Implement the PoC with the official dynamic capsule controller first:

- Import `FirstPersonController` from `playcanvas/scripts/esm/first-person-controller.mjs`.
- Use Ammo physics with `RigidBodyComponentSystem` and `CollisionComponentSystem`.
- Player entity: capsule collision, dynamic rigidbody, `angularFactor: Vec3.ZERO`, zero restitution, moderate friction.
- Static environment: simple box/compound collision for most furniture and walls; static mesh collision only for large irregular pieces.
- Use the official controller's ground raycast and jump impulse initially, with a filter to exclude the player if writing custom ground checks.
- Tune for narrow aisles before writing a kinematic controller.

Only move to a custom kinematic controller after the first playtest if the dynamic capsule cannot be tuned around maze/furniture collision issues.
