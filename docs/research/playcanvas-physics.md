# PlayCanvas engine-only physics with Ammo.js

Research ticket: [#5](https://github.com/daveedh/highfivegames/issues/5)  
Date: 2026-09-11

## Verdict

**Feasible.** PlayCanvas engine-only can carry the proof-of-concept loop: raycast from the first-person camera to pick a shelf object, attach/hold it in game code, place it at a slingshot muzzle, fire it as a dynamic rigid body with `applyImpulse`, and react when it collides with a robot guard or enters a guard trigger hurtbox.

The main engine-only gotcha is that the PlayCanvas Editor normally imports/loads Ammo for you. In an npm/Vite build, you must serve the Ammo WASM files yourself and call `pc.WasmModule.setConfig('Ammo', ...)` plus `pc.WasmModule.getInstance('Ammo', ...)` **before** creating/starting the app. PlayCanvas physics is opt-in; until Ammo is present, physics components are inert placeholders. PlayCanvas documents the three required files as `ammo.wasm.wasm`, `ammo.wasm.js`, and `ammo.js` fallback, and notes that they ship in `playcanvas/engine` under `examples/assets/wasm/ammo/` and in the `sync-ammo` npm package. [PlayCanvas physics basics](https://developer.playcanvas.com/user-manual/physics/physics-basics/), [WasmModule source](https://github.com/playcanvas/engine/blob/main/src/core/wasm-module.js), [Falling Shapes example](https://github.com/playcanvas/engine/blob/main/examples/src/examples/physics/falling-shapes.example.mjs)

## Recommended dynamic-body budget

There is **no official first-party number** for “how many dynamic bodies on a modest laptop.” The defensible budget from first-party evidence is:

- **Safe baseline:** about **40 dynamic bodies**. The first-party Falling Shapes example spawns `count = 40` dynamic rigid bodies, including primitives and a mesh collider, and visualizes active vs sleeping bodies with `body.isActive()`. [Falling Shapes example](https://github.com/playcanvas/engine/blob/main/examples/src/examples/physics/falling-shapes.example.mjs)
- **Reasonable POC target:** **50–100 simple dynamic primitives in a room** if most shelf items are asleep, contacts are sparse, collision shapes are primitive boxes/spheres/capsules, and projectiles are pooled/despawned.
- **Risk zone:** **100–150+ awake/contacting bodies**, lots of simultaneous projectile hits, mesh/compound colliders, or per-frame `contact` handlers. The rigidbody system steps at a fixed `1 / 60` with up to `10` substeps, then writes active dynamic body transforms back to entities; awake bodies, contacts, triggers, raycast-all/tag filters, and mesh colliders all add cost. [RigidBodyComponentSystem source](https://github.com/playcanvas/engine/blob/main/src/framework/components/rigid-body/system.js), [Ammo physics backend](https://github.com/playcanvas/engine/blob/main/src/framework/physics/ammo/ammo-physics-world.js)

Practical design: make the room, walls, floor, shelves, and most furniture displays **static**; make only grabbable stock items **dynamic**; let shelf objects sleep; wake them when grabbed/hit; despawn fired projectiles quickly; use collision groups/masks for cheap filtering.

## Loading Ammo WASM in Vite / npm

Place the Ammo files where Vite serves static assets, for example:

```text
public/ammo/ammo.wasm.js
public/ammo/ammo.wasm.wasm
public/ammo/ammo.js
```

Then load Ammo before constructing the app:

```js
import * as pc from 'playcanvas';

pc.WasmModule.setConfig('Ammo', {
  glueUrl: '/ammo/ammo.wasm.js',
  wasmUrl: '/ammo/ammo.wasm.wasm',
  fallbackUrl: '/ammo/ammo.js'
});

await new Promise((resolve, reject) => {
  pc.WasmModule.setConfig('Ammo', {
    glueUrl: '/ammo/ammo.wasm.js',
    wasmUrl: '/ammo/ammo.wasm.wasm',
    fallbackUrl: '/ammo/ammo.js',
    errorHandler: reject
  });
  pc.WasmModule.getInstance('Ammo', () => resolve());
});

const canvas = document.getElementById('application-canvas');
const app = new pc.Application(canvas);
app.start();
```

Notes:

- `WasmModule` is specifically documented as useful when “developing against the Engine directly”; Editor projects automatically load WASM modules included as assets. [WasmModule source](https://github.com/playcanvas/engine/blob/main/src/core/wasm-module.js)
- The loader chooses the glue script + WASM when WebAssembly is supported, otherwise the fallback URL, and uses `locateFile` to point the glue code at `config.wasmUrl`. [WasmModule source](https://github.com/playcanvas/engine/blob/main/src/core/wasm-module.js)
- The first-party Falling Shapes example uses this exact sequence before `AppBase` initialization. [Falling Shapes example](https://github.com/playcanvas/engine/blob/main/examples/src/examples/physics/falling-shapes.example.mjs)

If using lower-level `AppBase`, register the physics systems yourself:

```js
const device = await pc.createGraphicsDevice(canvas, { deviceTypes: ['webgl2', 'webgl1'] });

const options = new pc.AppOptions();
options.graphicsDevice = device;
options.componentSystems = [
  pc.RenderComponentSystem,
  pc.CameraComponentSystem,
  pc.LightComponentSystem,
  pc.ScriptComponentSystem,
  pc.CollisionComponentSystem,
  pc.RigidBodyComponentSystem
];

const app = new pc.AppBase(canvas);
app.init(options);
app.start();
```

`pc.Application` registers component systems for you; `AppBase` only uses what you provide. The rigidbody system installs the Ammo backend automatically when Ammo is loaded and no custom physics world is supplied. [PlayCanvas physics basics](https://developer.playcanvas.com/user-manual/physics/physics-basics/), [RigidBodyComponentSystem source](https://github.com/playcanvas/engine/blob/main/src/framework/components/rigid-body/system.js)

## Rigidbody and collision components in code

A simulated physical object needs both components: `collision` gives the entity a shape; `rigidbody` decides how the physics engine treats it. A rigidbody without collision “has nothing to collide with and does nothing.” Static bodies are cheap and never move; dynamic bodies are fully simulated; kinematic bodies are moved by game code but push dynamic bodies. [Rigid bodies docs](https://developer.playcanvas.com/user-manual/physics/rigid-bodies/)

Static shelf or floor:

```js
const shelf = new pc.Entity('shelf');
shelf.addComponent('render', { type: 'box' });
shelf.setLocalScale(3, 0.2, 1);

shelf.addComponent('collision', {
  type: 'box',
  halfExtents: new pc.Vec3(1.5, 0.1, 0.5)
});

shelf.addComponent('rigidbody', {
  type: 'static',
  friction: 0.8,
  restitution: 0
});

app.root.addChild(shelf);
```

Dynamic shelf item / projectile:

```js
const projectile = new pc.Entity('flatpack-box');
projectile.tags.add('pickup', 'projectile');
projectile.addComponent('render', { type: 'box' });
projectile.setLocalScale(0.35, 0.2, 0.5);

projectile.addComponent('collision', {
  type: 'box',
  halfExtents: new pc.Vec3(0.175, 0.1, 0.25)
});

projectile.addComponent('rigidbody', {
  type: 'dynamic',
  mass: 1,
  friction: 0.5,
  restitution: 0.1
});

app.root.addChild(projectile);
```

The engine source examples show adding components with `Entity#addComponent`, and the first-party Falling Shapes example creates static floor and dynamic falling objects this way. [RigidBodyComponent source](https://github.com/playcanvas/engine/blob/main/src/framework/components/rigid-body/component.js), [Falling Shapes example](https://github.com/playcanvas/engine/blob/main/examples/src/examples/physics/falling-shapes.example.mjs)

## Firing a projectile with `applyImpulse`

For a slingshot launch, use a **single impulse**. PlayCanvas documents forces as continuous pushes and impulses as instant velocity/momentum changes; impulses should be applied once rather than every frame. [Forces and impulses docs](https://developer.playcanvas.com/user-manual/physics/forces-and-impulses/)

```js
const ZERO = new pc.Vec3(0, 0, 0);

function fireProjectile(projectile, muzzleEntity, aimDirection, strength = 18) {
  const spawn = muzzleEntity.getPosition();
  const impulse = aimDirection.clone().normalize().mulScalar(strength);

  projectile.rigidbody.linearVelocity = ZERO;
  projectile.rigidbody.angularVelocity = ZERO;
  projectile.rigidbody.teleport(spawn, muzzleEntity.getRotation());
  projectile.rigidbody.activate();
  projectile.rigidbody.applyImpulse(impulse);
}
```

`applyImpulse` accepts either numbers or a `Vec3`, activates the body, and forwards the impulse to the physics backend. [RigidBodyComponent source](https://github.com/playcanvas/engine/blob/main/src/framework/components/rigid-body/component.js)

For fast/small projectiles, consider Bullet continuous collision detection through the Ammo escape hatch; PlayCanvas exposes the native `btRigidBody` as `entity.rigidbody.body` once initialized:

```js
const body = projectile.rigidbody.body;
body.setCcdMotionThreshold(1);
body.setCcdSweptSphereRadius(0.15);
```

PlayCanvas documents this exact CCD pattern and warns that direct Ammo calls bypass the PlayCanvas API and tie you to the Ammo backend. [Calling Ammo docs](https://developer.playcanvas.com/user-manual/physics/calling-ammo/)

## Projectile-vs-guard collision handling

Use `collisionstart` for one-shot hit reactions. `contact` fires every physics step while touching, so keep it for cases that need per-step contact details. Collision events are fired on both entities’ collision and rigidbody components; contacts are reported when at least one body is dynamic. [Collision events docs](https://developer.playcanvas.com/user-manual/physics/collision-events/)

```js
projectile.collision.on('collisionstart', (result) => {
  const guard = result.other;
  if (!guard.tags.has('guard')) return;

  const impact = result.contacts.reduce(
    (max, contact) => Math.max(max, contact.impulse),
    0
  );

  damageGuard(guard, { projectile, impact, contacts: result.contacts });
  projectile.destroy();
});
```

Alternative: put a non-blocking trigger hurtbox on the guard. A trigger is a collision component without a rigidbody; it fires `triggerenter` / `triggerleave` and does not physically block. Only dynamic and kinematic rigid bodies fire trigger events. [Trigger volumes docs](https://developer.playcanvas.com/user-manual/physics/trigger-volumes/)

```js
const hurtbox = new pc.Entity('guard-hurtbox');
hurtbox.tags.add('guard-hurtbox');
hurtbox.addComponent('collision', {
  type: 'box',
  halfExtents: new pc.Vec3(0.5, 1.0, 0.35)
});

guard.addChild(hurtbox);

hurtbox.collision.on('triggerenter', (entity) => {
  if (!entity.tags.has('projectile')) return;

  damageGuard(guard, { projectile: entity });
  entity.destroy();
});
```

The rigidbody system source confirms it emits `collisionstart`, `contact`, and `collisionend`, and handles trigger overlaps separately from contact events. [RigidBodyComponentSystem source](https://github.com/playcanvas/engine/blob/main/src/framework/components/rigid-body/system.js)

## Camera-forward raycast for aim and pickup

Raycasts are methods on `app.systems.rigidbody`. A raycast is a straight line query between two 3D points that returns collision-shape hits. The docs show starting at the camera position and ending at `camera.screenToWorld(screenX, screenY, farClip)`. [Ray casting docs](https://developer.playcanvas.com/user-manual/physics/ray-casting/)

Crosshair aim ray:

```js
function cameraForwardRay(cameraEntity, distance = 30) {
  const from = cameraEntity.getPosition().clone();
  const forward = cameraEntity.forward.clone().normalize();
  const to = from.clone().add(forward.mulScalar(distance));
  return { from, to };
}

function getAimHit(cameraEntity) {
  const { from, to } = cameraForwardRay(cameraEntity, 40);

  return app.systems.rigidbody.raycastFirst(from, to, {
    filterCallback: (entity) => !entity.tags.has('player')
  });
}
```

Pointer/screen-position picking ray:

```js
function pickFromScreen(cameraEntity, screenX, screenY) {
  const from = cameraEntity.getPosition().clone();
  const to = cameraEntity.camera.screenToWorld(
    screenX,
    screenY,
    cameraEntity.camera.farClip
  );

  return app.systems.rigidbody.raycastFirst(from, to, {
    filterTags: ['pickup']
  });
}

const hit = pickFromScreen(camera, app.graphicsDevice.width / 2, app.graphicsDevice.height / 2);
if (hit && hit.entity.tags.has('pickup')) {
  grabObject(hit.entity);
}
```

Performance note: `filterTags` and `filterCallback` require checking every hit along the ray, so `raycastFirst` with those options does `raycastAll`-style work; collision group/mask filtering happens inside the physics engine and is cheaper. [Ray casting docs](https://developer.playcanvas.com/user-manual/physics/ray-casting/), [RigidBodyComponentSystem source](https://github.com/playcanvas/engine/blob/main/src/framework/components/rigid-body/system.js)

## Grabbing and loading pattern

Physics can detect the aimed object, but “holding” it should be game logic. For the POC, avoid simulating a complicated hand constraint:

1. Raycast from the camera to find an entity tagged `pickup`.
2. Temporarily remove it from free physics while held: set it kinematic or disable rigidbody simulation, parent/position it at a hold socket, and ignore collisions with the player.
3. On loading the slingshot, place it at the muzzle with `rigidbody.teleport(...)`, reset velocities, make it dynamic, activate it, then fire with one impulse.
4. Use collision groups/masks so held/projectile objects do not collide with the player or other projectiles unless desired. [Rigid bodies docs](https://developer.playcanvas.com/user-manual/physics/rigid-bodies/), [Forces and impulses docs](https://developer.playcanvas.com/user-manual/physics/forces-and-impulses/)

## Current API and deprecated patterns

Prefer current v2 patterns:

- Load Ammo with `pc.WasmModule.setConfig('Ammo', ...)` and `getInstance` in engine-only builds; do not rely on the Editor’s legacy injected Ammo path. [Physics basics](https://developer.playcanvas.com/user-manual/physics/physics-basics/)
- Use `entity.addComponent('rigidbody', { type: 'dynamic' })` or constants such as `pc.BODYTYPE_DYNAMIC`; avoid deprecated `RigidBodyComponent#bodyType`. The engine source marks `bodyType` deprecated in favor of `type`. [RigidBodyComponent source](https://github.com/playcanvas/engine/blob/main/src/framework/components/rigid-body/component.js)
- Avoid internal/deprecated transform sync methods such as `syncBodyToEntity`; use `rigidbody.teleport`, velocities, forces, and impulses for dynamic bodies. [Rigid bodies docs](https://developer.playcanvas.com/user-manual/physics/rigid-bodies/), [RigidBodyComponent source](https://github.com/playcanvas/engine/blob/main/src/framework/components/rigid-body/component.js)

## Sources

Primary sources used:

- PlayCanvas: [Physics basics](https://developer.playcanvas.com/user-manual/physics/physics-basics/)
- PlayCanvas: [Rigid bodies](https://developer.playcanvas.com/user-manual/physics/rigid-bodies/)
- PlayCanvas: [Forces and impulses](https://developer.playcanvas.com/user-manual/physics/forces-and-impulses/)
- PlayCanvas: [Collision events](https://developer.playcanvas.com/user-manual/physics/collision-events/)
- PlayCanvas: [Trigger volumes](https://developer.playcanvas.com/user-manual/physics/trigger-volumes/)
- PlayCanvas: [Ray casting](https://developer.playcanvas.com/user-manual/physics/ray-casting/)
- PlayCanvas: [Calling Ammo directly / CCD](https://developer.playcanvas.com/user-manual/physics/calling-ammo/)
- playcanvas/engine: [WasmModule source](https://github.com/playcanvas/engine/blob/main/src/core/wasm-module.js)
- playcanvas/engine: [RigidBodyComponent source](https://github.com/playcanvas/engine/blob/main/src/framework/components/rigid-body/component.js)
- playcanvas/engine: [RigidBodyComponentSystem source](https://github.com/playcanvas/engine/blob/main/src/framework/components/rigid-body/system.js)
- playcanvas/engine: [AmmoPhysicsWorld source](https://github.com/playcanvas/engine/blob/main/src/framework/physics/ammo/ammo-physics-world.js)
- playcanvas/engine: [Falling Shapes example](https://github.com/playcanvas/engine/blob/main/examples/src/examples/physics/falling-shapes.example.mjs)
