import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Upgrades, CHECKOUT_SECONDS } from './upgrades.ts';

function claim(upgrades, id) {
  assert.equal(upgrades.pickUp(id), true);
  assert.equal(upgrades.deposit(id), true);
  assert.equal(upgrades.process(id, CHECKOUT_SECONDS, true), true);
}

test('pickup fills both hands but neither pickup nor deposit activates an upgrade', () => {
  const upgrades = new Upgrades();
  assert.equal(upgrades.pickUp('band'), true);
  assert.equal(upgrades.carrying, 'band');
  assert.equal(upgrades.pickUp('pouch'), false);
  assert.equal(upgrades.deposit('pouch'), false);
  assert.equal(upgrades.shotSpeed(1, 1), 48);
  assert.equal(upgrades.deposit('band'), true);
  assert.equal(upgrades.carrying, null);
  assert.equal(upgrades.shotSpeed(1, 1), 48);
  assert.equal(upgrades.capacity, 5);
});

test('checkout holds its box and fractional progress through repeated interruptions', () => {
  const upgrades = new Upgrades();
  upgrades.pickUp('band');
  upgrades.deposit('band');
  assert.equal(upgrades.process('band', 1.25, true), false);
  for (let i = 0; i < 10; i++) upgrades.process('band', 10, false);
  assert.equal(upgrades.state('band'), 'processing');
  assert.equal(upgrades.progress('band'), 1.25 / 3);
  assert.equal(upgrades.pickUp('band'), false);
  assert.equal(upgrades.process('band', 1.7, true), false);
  assert.equal(upgrades.process('band', 0.051, true), true);
  assert.equal(upgrades.process('band', 3, true), false);
  assert.equal(upgrades.progress('band'), 1);
  assert.equal(upgrades.pickUp('band'), false);
});

test('Band changes full pulls only, for every weight tier', () => {
  const upgrades = new Upgrades();
  const tiers = [1.15, 1, 0.55];
  const partial = [0, 0.1, 0.5, 0.75, 0.999];
  const before = tiers.map(speed => partial.map(pull => upgrades.shotSpeed(pull, speed)));
  claim(upgrades, 'band');
  for (const [index, speed] of tiers.entries()) {
    assert.deepEqual(partial.map(pull => upgrades.shotSpeed(pull, speed)), before[index]);
    assert.equal(upgrades.shotSpeed(1, speed), 62 * speed);
  }
  assert.equal(upgrades.capacity, 5);
});

test('Bigger Pouch adds exactly three slots and stacks with the Band in either order', () => {
  for (const order of [['band', 'pouch'], ['pouch', 'band']]) {
    const upgrades = new Upgrades();
    assert.ok(3 + 3 > upgrades.capacity);
    for (const id of order) claim(upgrades, id);
    assert.equal(upgrades.capacity, 8);
    assert.ok(3 + 3 <= upgrades.capacity);
    assert.ok(3 + 3 + 3 > upgrades.capacity);
    assert.equal(upgrades.shotSpeed(1, 1), 62);
  }
});

test('reset restores boxes, checkout progress, capacity and shot speed', () => {
  const upgrades = new Upgrades();
  claim(upgrades, 'pouch');
  upgrades.pickUp('band');
  upgrades.deposit('band');
  upgrades.process('band', 1, true);
  upgrades.reset();
  for (const id of ['band', 'pouch']) {
    assert.equal(upgrades.state(id), 'world');
    assert.equal(upgrades.progress(id), 0);
  }
  assert.equal(upgrades.carrying, null);
  assert.equal(upgrades.capacity, 5);
  assert.equal(upgrades.shotSpeed(1, 1), 48);
});

test('invalid elapsed time fails explicitly rather than corrupting checkout progress', () => {
  const upgrades = new Upgrades();
  for (const dt of [-1, NaN, Infinity]) {
    assert.throws(() => upgrades.process('band', dt, true), RangeError);
  }
});
