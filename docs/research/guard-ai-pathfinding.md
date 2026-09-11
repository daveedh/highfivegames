# Guard AI pathfinding and spotting

Research ticket: [#7](https://github.com/daveedh/highfivegames/issues/7)  
Date: 2026-09-11

## Verdict

Use **hand-authored waypoint patrol routes plus a tiny graph search and direct steering** for the proof of concept. PlayCanvas engine-only gives us the pieces we need for movement support — Ammo physics, collision components, rigid bodies, trigger volumes, and raycasts — but it does **not** appear to provide a native navigation or pathfinding API. A simple waypoint graph is fastest to ship, easiest for a dad-and-kids project to debug visually, and good enough for three melee guards in one mostly flat showroom. If guards later get stuck often, layouts become procedural, or the showroom grows beyond hand-authored aisles, migrate to **`recast-navigation` with `@recast-navigation/playcanvas`**.

## Options compared

| Option | Setup cost | Handles shelf-maze obstacles? | Recommendation |
| --- | --- | --- | --- |
| **Hand-authored waypoints + direct steering** | Low: define nodes at aisle centers, patrol loops, and graph links in code/data. | Good if nodes are placed in navigable aisle centers and guards re-path through the graph when direct line-of-sight is blocked. It will not automatically understand a moved sofa or badly placed shelf. | **Choose this first.** It is small, inspectable, and enough for three guards in one authored room. |
| **`recast-navigation` / `@recast-navigation/playcanvas` navmesh** | Medium/high: add packages, initialize WASM, extract PlayCanvas `MeshInstance`s, tune agent radius/slope/step settings, debug generated navmesh. | Best. Recast-style navmeshes are designed to convert walkable geometry into a pathfinding surface; Detour handles path queries, and the package also exposes crowd simulation and temporary obstacles. | Keep as the migration path, not the first implementation. |
| **Other JS libraries** | Varies. Grid A* is easy but coarse; broad AI frameworks add conceptual weight. | Grid libraries work only if the store is snapped to a 2D occupancy grid. General frameworks still need integration and tuning. | Not needed for the first pass. |
| **Native PlayCanvas navigation** | Not applicable. | PlayCanvas physics/raycast/collision are native, pathfinding is not. | Do not wait for a native navmesh API. |

## Primary-source findings

### PlayCanvas engine-only support we can rely on

PlayCanvas physics is powered by Ammo.js, a WebAssembly port of Bullet. The official physics docs say rigidbody components decide how entities move, collision components give them physical shapes, and the same components are available whether building in the Editor, directly against the engine, React, or Web Components. [PlayCanvas physics docs](https://developer.playcanvas.com/user-manual/physics/)

The engine examples show the engine-only setup explicitly: configure Ammo with `WasmModule.setConfig('Ammo', ...)`, wait for `WasmModule.getInstance('Ammo', ...)`, create an `AppBase`, and register `CollisionComponentSystem` and `RigidBodyComponentSystem`. [PlayCanvas raycast example source](https://github.com/playcanvas/engine/blob/main/examples/src/examples/physics/raycast.example.mjs)

PlayCanvas has first-class physics raycasts. The docs define raycasts as queries from one point to another and show `app.systems.rigidbody.raycastFirst(from, to)`. They also document `raycastAll`, `RaycastResult`, `filterTags`, `filterCallback`, collision group/mask filtering, and sorting for all hits. [PlayCanvas ray casting docs](https://developer.playcanvas.com/user-manual/physics/ray-casting/)

Collision components support primitive and mesh shapes; if paired with a rigidbody, the collision component determines the rigid body shape, and without a rigidbody it becomes a trigger volume. That is useful for melee hitboxes or aggro zones. [PlayCanvas collision docs](https://developer.playcanvas.com/user-manual/editor/scenes/components/collision/)

### Native pathfinding/navmesh availability

I found no first-party PlayCanvas engine navigation/pathfinding API in the docs or examples. A PlayCanvas forum answer corroborates this: “PlayCanvas doesn’t provide an API” for pathfinding, so developers must write their own or integrate a third-party library. Use this forum thread as corroboration only, not as the primary basis. [PlayCanvas forum corroboration](https://forum.playcanvas.com/t/point-and-click-obeying-barriers/23235)

### Navmesh package option

`recast-navigation` describes itself as a WebAssembly port of Recast and Detour. Its README lists navmesh generation, pathfinding, crowd simulation, temporary obstacles, web and Node support, TypeScript support, and integration helpers for Three.js and PlayCanvas. It supports runtime navmesh generation for procedural/frequently changing environments, offline generation for mostly static environments, and Detour navmesh querying. [recast-navigation README](https://github.com/isaac-mason/recast-navigation-js/tree/main/packages/recast-navigation)

The package must be initialized asynchronously with `await init()`. It can generate solo or tiled navmeshes from flat position/index arrays, query paths with `NavMeshQuery.computePath(start, end)`, find closest/random points on the navmesh, and optionally run a `Crowd` with agents. [recast-navigation README](https://github.com/isaac-mason/recast-navigation-js/tree/main/packages/recast-navigation)

`@recast-navigation/playcanvas` is specifically described as “PlayCanvas nav mesh generation and visualisation helpers” for `recast-navigation`. Its README shows `pcToSoloNavMesh`, `pcToTiledNavMesh`, and `pcToTileCache` functions that generate navmeshes from PlayCanvas `MeshInstance` objects, plus PlayCanvas helpers for visualizing a navmesh, tile cache, and crowd. [@recast-navigation/playcanvas README](https://github.com/isaac-mason/recast-navigation-js/tree/main/packages/recast-navigation-playcanvas)

Current npm registry metadata reports `recast-navigation` version **0.43.1** and `@recast-navigation/playcanvas` version **0.43.1**. The PlayCanvas helper package depends on `@recast-navigation/core` and `@recast-navigation/generators` at the same version and has a PlayCanvas peer dependency of `^2.0.0`. [recast-navigation npm metadata](https://registry.npmjs.org/recast-navigation/latest), [@recast-navigation/playcanvas npm metadata](https://registry.npmjs.org/@recast-navigation/playcanvas/latest)

## Recommended guard state machine

```text
PATROL
  follow this guard's patrol node loop
  if canSpotPlayer(): save lastKnownPlayerPos -> SPOT
  if hit by slingshot object: save player/object direction -> CHASE

SPOT
  short reaction delay, rotate toward player, play alert sound
  if canSpotPlayer() after delay -> CHASE
  else -> PATROL

CHASE
  if close enough and unobstructed -> ATTACK
  if direct path/line-of-sight is clear -> steer directly at player
  else -> follow graph path toward nearest node to lastKnownPlayerPos
  refresh lastKnownPlayerPos while canSpotPlayer()
  if player unseen for 2-4 seconds -> SEARCH

SEARCH
  move to lastKnownPlayerPos, then scan adjacent nodes briefly
  if canSpotPlayer() -> CHASE
  if timeout -> RETURN_TO_PATROL

RETURN_TO_PATROL
  graph path to nearest patrol node
  when reached -> PATROL

ATTACK
  stop or slow movement, play wind-up, apply melee damage if still in range
  if player exits melee range -> CHASE

DIE
  disable AI, collider/trigger, and hit reactions; play fall/sparks
```

## Concrete movement approach for the proof of concept

Represent the showroom navigation as a small graph of safe aisle-center points. Each node stores a world position and neighboring node ids. Patrols are arrays of node ids.

```js
const navGraph = {
  nodes: {
    entrance: { p: new pc.Vec3(0, 0, 0), links: ['sofaAisle'] },
    sofaAisle: { p: new pc.Vec3(4, 0, 0), links: ['entrance', 'beds'] },
    beds: { p: new pc.Vec3(4, 0, 7), links: ['sofaAisle', 'checkout'] },
    checkout: { p: new pc.Vec3(-2, 0, 7), links: ['beds'] }
  },
  patrols: {
    guardA: ['entrance', 'sofaAisle', 'beds', 'sofaAisle']
  }
};
```

Movement loop:

1. In `PATROL`, steer toward the next patrol node. Advance when within a small radius.
2. In `CHASE`, first test whether the player is visible and the aisle is unobstructed. If yes, steer directly toward the player for a satisfying charge.
3. If direct chase is blocked by shelves/furniture, choose the closest graph node to the guard and the closest graph node to `lastKnownPlayerPos`, run A* over the graph, and steer along the returned node list.
4. Use static colliders for shelves, walls, showroom partitions, counters, and large sofas. Use a capsule collision shape for the guard. Use collision groups/masks so guard sight rays ignore the guard itself and only care about world blockers/player.

Sketch:

```js
function steerToward(entity, target, speed) {
  const pos = entity.getPosition();
  const dir = new pc.Vec3().sub2(target, pos);
  dir.y = 0;

  if (dir.lengthSq() < 0.04) {
    entity.rigidbody.linearVelocity = pc.Vec3.ZERO;
    return true;
  }

  dir.normalize();
  entity.rigidbody.linearVelocity = new pc.Vec3(dir.x * speed, 0, dir.z * speed);
  entity.lookAt(pos.x + dir.x, pos.y, pos.z + dir.z);
  return false;
}

function updateGuard(guard, dt) {
  switch (guard.state) {
    case 'patrol': {
      const nodeId = guard.patrol[guard.patrolIndex];
      if (steerToward(guard.entity, navGraph.nodes[nodeId].p, guard.patrolSpeed)) {
        guard.patrolIndex = (guard.patrolIndex + 1) % guard.patrol.length;
      }
      if (canSpotPlayer(guard, player)) enterSpot(guard);
      break;
    }
    case 'chase': {
      const target = canSpotPlayer(guard, player)
        ? player.entity.getPosition()
        : nextGraphPathPoint(guard, guard.lastKnownPlayerPos);
      steerToward(guard.entity, target, guard.chaseSpeed);
      if (guard.entity.getPosition().distance(player.entity.getPosition()) < guard.attackRange) {
        enterAttack(guard);
      }
      break;
    }
  }
}
```

This is intentionally not sophisticated. The win condition is that guards do not run through shelf rows and can route around obvious showroom aisles. For three guards, a small A* implementation over tens of nodes is trivial and avoids adding a navmesh package before the game loop is proven fun.

## Spotting check recommendation

Use **distance + vision cone + physics raycast**. Do not use distance-only spotting except as a temporary debug mode; in a shelf maze it would let guards “see” through shelving, walls, and sofas, making the chase feel unfair. A raycast alone is also too generous because guards would spot the player behind themselves. A cone plus raycast is still simple and gives predictable stealth-ish behavior.

Run this check on a timer such as every 0.1–0.25 seconds per guard, not necessarily every animation frame.

```js
const tmpToPlayer = new pc.Vec3();
const tmpFlatForward = new pc.Vec3();
const tmpFlatToPlayer = new pc.Vec3();

function canSpotPlayer(guard, player) {
  const eye = guard.eye.getPosition();
  const playerEye = player.eye.getPosition();

  tmpToPlayer.sub2(playerEye, eye);
  const distance = tmpToPlayer.length();
  if (distance > guard.sightRange) return false;

  tmpFlatToPlayer.set(tmpToPlayer.x, 0, tmpToPlayer.z).normalize();
  tmpFlatForward.copy(guard.entity.forward);
  tmpFlatForward.y = 0;
  tmpFlatForward.normalize();

  const minDot = Math.cos(guard.fovRadians * 0.5);
  if (tmpFlatForward.dot(tmpFlatToPlayer) < minDot) return false;

  const hit = guard.app.systems.rigidbody.raycastFirst(eye, playerEye, {
    // Prefer collision masks in production; callback is fine for first pass.
    filterCallback: (entity) => entity !== guard.entity && entity !== guard.eye
  });

  return !!hit && (hit.entity === player.entity || hit.entity.tags.has('player'));
}
```

Recommended first-pass values:

- `sightRange`: 10-15 meters.
- `fovRadians`: 90-120 degrees.
- `attackRange`: 1.2-1.8 meters.
- `patrolSpeed`: slow enough to dodge.
- `chaseSpeed`: slightly faster than the player only when the guard has line of sight, otherwise equal/slower so the player can break contact.

## Migration path if guards get stuck

Move up in this order:

1. **Improve graph nodes first.** Add more aisle-center nodes, corner nodes, and one-way links around known choke points.
2. **Add simple local avoidance.** If a short forward ray hits a shelf/sofa, slow down and bias toward the next graph point rather than direct-charging into the obstacle.
3. **Adopt `recast-navigation` offline.** For a mostly static showroom, generate/load a navmesh and query paths with Detour instead of hand-authored graph paths.
4. **Adopt `@recast-navigation/playcanvas` runtime helpers.** If geometry is assembled dynamically in code, use `pcToSoloNavMesh` or `pcToTiledNavMesh` from PlayCanvas mesh instances. Use `pcToTileCache` only if temporary obstacles become important.
5. **Only then consider crowd simulation.** Three melee guards probably do not need Detour Crowd yet; staged reaction times and slightly different patrol paths may be enough.

## Final recommendation

For ticket #7, implement **manual waypoint graph + direct steering + raycast/cone spotting**. It is the lowest-risk route to a playable prototype and keeps attention on the fun loop: grab furniture, fire it, disable robots, escape. Keep `recast-navigation`/`@recast-navigation/playcanvas` documented as the credible upgrade path if hand-authored navigation becomes the bottleneck.
