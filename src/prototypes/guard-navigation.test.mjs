import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GuardNavigation, wrapAngle } from './guard-navigation.ts';

test('angle differences survive repeated positive and negative full turns', () => {
  for (const turns of [-20, -4, -1, 0, 1, 4, 20]) {
    assert.equal(wrapAngle(33 + turns * 360), 33);
    assert.equal(wrapAngle(-33 + turns * 360), -33);
  }
  assert.equal(wrapAngle(-179 - 179), 2);
  assert.equal(wrapAngle(179 - -179), -2);
});

test('routes go around the wall with capsule clearance rather than through it', () => {
  const nav = new GuardNavigation(36, 60, [{ minX: 6.85, maxX: 7.15, minZ: -15.5, maxZ: -8.5 }]);
  const from = { x: 5, z: -12 }, to = { x: 9, z: -12 };
  assert.equal(nav.clear(from, to), false);
  const path = nav.route(from, to);
  assert.ok(path && path.length > 1);
  let previous = from;
  for (const point of path) {
    assert.ok(nav.clear(previous, point), JSON.stringify({ previous, point }));
    previous = point;
  }
  assert.deepEqual(path.at(-1), to);
  assert.ok(path.some(point => point.z > -7.95 || point.z < -16.05));
});

test('unreachable destinations report no route and open floor stays direct', () => {
  const nav = new GuardNavigation(12, 12, [{ minX: -0.2, maxX: 0.2, minZ: -6, maxZ: 6 }]);
  assert.equal(nav.route({ x: -3, z: 0 }, { x: 3, z: 0 }), null);
  assert.deepEqual(nav.route({ x: -3, z: 0 }, { x: -3, z: 3 }), [{ x: -3, z: 3 }]);
});
