import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

let browser;
before(async () => {
  browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    headless: true,
    args: ['--enable-unsafe-swiftshader']
  });
});
after(async () => { await browser?.close(); });

async function scene(run, hunt = false) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(`${process.env.PLAYTEST_URL || 'http://127.0.0.1:5173'}/prototype-kill.html`);
    await page.waitForSelector('#kill-state');
    await page.evaluate(async hunt => {
      // Use the loaded URLs, including Vite's HMR timestamps, to avoid a second scene.
      window.ammo = await import(performance.getEntriesByType('resource')
        .find(resource => resource.name.includes('/src/prototypes/ammo-feel.ts')).name);
      window.combat = await import(document.querySelector('script[src*="kill-feel"]').src);
      window.setHunt = enabled => {
        const input = document.getElementById('hunt');
        input.checked = enabled;
        input.dispatchEvent(new Event('change'));
      };
      setHunt(hunt);
      window.pose = (x, z, target) => {
        ammo.player.rigidbody.teleport(x, 0.9, z);
        ammo.player.rigidbody.linearVelocity = ammo.player.getPosition().clone().set(0, 0, 0);
        const offset = target.clone().sub(ammo.camera.getPosition());
        const angles = ammo.player.script.scripts[0]._angles;
        angles.set(Math.atan2(offset.y, Math.hypot(offset.x, offset.z)) * 180 / Math.PI,
          Math.atan2(-offset.x, -offset.z) * 180 / Math.PI, 0);
        ammo.camera.setLocalEulerAngles(angles);
      };
    }, hunt);
    await page.mouse.click(700, 450);
    await page.waitForFunction(() => document.pointerLockElement !== null);
    await run(page);
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
}

async function approach(page, id, kind) {
  await page.evaluate(({ id, kind }) => {
    const station = combat.checkouts.stations.find(s => s.id === id);
    const position = (kind === 'box' ? station.pack : station.checkout).getPosition();
    pose(position.x, position.z + 1.7, position);
  }, { id, kind });
}

async function collect(page, tier, index = 0) {
  await page.evaluate(({ tier, index }) => {
    const position = ammo.items.filter(item => item.tier === tier)[index].entity.getPosition();
    pose(position.x, position.z + 1.7, position);
  }, { tier, index });
  await page.keyboard.press('KeyE');
}

test('carrying, pause/resume, receipts, eight slots, and reset use the real scene', async () => {
  await scene(async page => {
    await collect(page, 'light');
    await page.mouse.down();
    await approach(page, 'band', 'box');
    await page.keyboard.press('KeyE');
    assert.equal(await page.evaluate(() => ammo.upgrades.carrying), 'band');
    await page.mouse.up();
    await page.mouse.down();
    await page.waitForTimeout(850);
    await page.mouse.up();
    await page.evaluate(() => ammo.fire());
    assert.equal(await page.evaluate(() => ammo.queue.length), 1);
    assert.equal(await page.evaluate(() => ammo.app.root.findByName('sling').enabled), false);
    await approach(page, 'band', 'checkout');
    await page.keyboard.press('KeyE');
    assert.equal(await page.evaluate(() => ammo.upgrades.shotSpeed(1, 1)), 48);
    await page.waitForFunction(() => ammo.upgrades.progress('band') > 0.2);
    await page.evaluate(() => pose(0, 20, ammo.player.getPosition()));
    const progress = await page.evaluate(() => ammo.upgrades.progress('band'));
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => ammo.upgrades.progress('band')), progress);
    await approach(page, 'band', 'checkout');
    await page.waitForFunction(progress => ammo.upgrades.progress('band') > progress + 0.05, progress);
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForFunction(() => !document.pointerLockElement);
    const unlocked = await page.evaluate(() => ammo.upgrades.progress('band'));
    await page.waitForTimeout(350);
    assert.equal(await page.evaluate(() => ammo.upgrades.progress('band')), unlocked);
    await page.mouse.click(700, 450);
    await page.waitForFunction(() => ammo.upgrades.state('band') === 'claimed');
    assert.equal(await page.evaluate(() => ammo.upgrades.shotSpeed(1, 1)), 62);
    assert.equal(await page.evaluate(() => ammo.upgrades.shotSpeed(0.5, 1)), 31);
    await page.waitForFunction(() => ammo.app.root.findByName('band-left').getLocalScale().x === 0.012 * 1.8);
    const receipt = await page.locator('.upgrade-receipt').first().innerText();
    assert.match(receipt, /SPÄNN replacement band 0\.00/);
    assert.match(receipt, /Full pull now travels further\. A half pull is unchanged\./);
    assert.match(receipt, /TOTAL\n0\.00\nNo payment was taken\./);
    await approach(page, 'pouch', 'box');
    await page.keyboard.press('KeyE');
    assert.equal(await page.evaluate(() => ammo.upgrades.capacity), 5);
    await approach(page, 'pouch', 'checkout');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => ammo.upgrades.state('pouch') === 'claimed');
    await page.waitForFunction(() => document.querySelectorAll('#ammo-slots i').length === 8);
    await collect(page, 'heavy', 0);
    await collect(page, 'heavy', 1);
    assert.equal(await page.evaluate(() => ammo.queue.filter(item => item.tier === 'heavy').length), 2);
    await collect(page, 'heavy', 2);
    assert.equal(await page.evaluate(() => ammo.queue.length), 3);
    await page.evaluate(() => ammo.reset());
    await page.waitForFunction(() => document.querySelectorAll('#ammo-slots i').length === 5);
    assert.deepEqual(await page.evaluate(() => ['band', 'pouch'].map(id => ammo.upgrades.state(id))), ['world', 'world']);
    assert.equal(await page.locator('.upgrade-receipt:visible').count(), 0);
  });
});

test('a real guard hit pauses the checkout without losing its box', async () => {
  await scene(async page => {
    await approach(page, 'band', 'box');
    await page.keyboard.press('KeyE');
    await approach(page, 'band', 'checkout');
    await page.keyboard.press('KeyE');
    await page.waitForFunction(() => ammo.upgrades.progress('band') > 0.1);
    await page.evaluate(() => {
      setHunt(true);
      const guard = combat.guards[0], p = ammo.player.getPosition();
      guard.entity.rigidbody.teleport(p.x + 1.15, 1.2, p.z);
      guard.yaw = 90; guard.state = 'chase';
    });
    await page.waitForFunction(() => document.getElementById('kill-state').textContent.includes('Hearts 2/3'));
    await page.evaluate(() => {
      setHunt(false);
      combat.guards[0].entity.rigidbody.teleport(combat.guards[0].home);
    });
    await approach(page, 'band', 'checkout');
    const held = await page.evaluate(() => ammo.upgrades.progress('band'));
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => ammo.upgrades.progress('band')), held);
    await page.waitForFunction(() => ammo.upgrades.state('band') === 'claimed');
  });
});

test('three hits end all interaction and provide a working restart', async () => {
  await scene(async page => {
    await page.evaluate(() => {
      const attack = () => {
        const p = ammo.player.getPosition(), guard = combat.guards[0];
        guard.entity.rigidbody.teleport(p.x + 1.15, 1.2, p.z);
        guard.yaw = 90; guard.state = 'chase';
      };
      ammo.app.on('update', attack);
    });
    await page.waitForFunction(() => document.getElementById('kill-state').textContent.includes('Hearts 0/3'));
    assert.match(await page.locator('#click-to-play').innerText(), /Three hits\. Run over\./);
    await page.evaluate(() => ammo.grab());
    assert.match(await page.locator('#ammo-message').innerText(), /Restart/);
    await page.locator('#restart-run').click();
    await page.waitForFunction(() => document.getElementById('kill-state').textContent.includes('Hearts 3/3'));
    assert.equal(await page.evaluate(() => ammo.interaction.blockedReason()), '');
  }, true);
});

test('three chasing guards cannot squeeze the player through any wall or a corner', async () => {
  await scene(async page => {
    for (const [x, z, dx, dz] of [[14.4, 20, 1, 0], [-14.4, 20, -1, 0],
      [0, 23.4, 0, 1], [0, -23.4, 0, -1], [14.4, 23.4, 1, 1]]) {
      await page.evaluate(([x, z, dx, dz]) => {
        ammo.reset();
        ammo.player.rigidbody.teleport(x, 0.9, z);
        for (const [i, guard] of combat.guards.entries()) {
          guard.entity.rigidbody.teleport(x - dx * (0.9 + i * 0.12), 1.2, z - dz * (0.9 + i * 0.12));
          guard.state = 'chase';
          guard.yaw = Math.atan2(-dx, -dz) * 180 / Math.PI;
          guard.lastKnown.copy(ammo.player.getPosition());
        }
        window.extent = { maxX: 0, maxZ: 0, minY: Infinity };
        if (window.sample) ammo.app.off('update', sample);
        window.sample = () => {
          const p = ammo.player.getPosition();
          extent.maxX = Math.max(extent.maxX, Math.abs(p.x));
          extent.maxZ = Math.max(extent.maxZ, Math.abs(p.z));
          extent.minY = Math.min(extent.minY, p.y);
        };
        ammo.app.on('update', sample);
      }, [x, z, dx, dz]);
      if (!await page.evaluate(() => !!document.pointerLockElement)) await page.mouse.click(700, 450);
      await page.waitForTimeout(2500);
      const bounds = await page.evaluate(() => extent);
      assert.ok(bounds.maxX < 15 && bounds.maxZ < 24 && bounds.minY > 0.3, JSON.stringify(bounds));
    }
  }, true);
});

test('the upgraded Heavy clears 38 metres in actual Ammo physics, even at the old 1.6 arc', async () => {
  await scene(async page => {
    const ranges = [];
    for (const upgraded of [false, true]) {
      await page.evaluate(async upgraded => {
        ammo.reset();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (upgraded) {
          ammo.upgrades.pickUp('band');
          ammo.upgrades.deposit('band');
          ammo.upgrades.process('band', 3, true);
        }
        for (const guard of combat.guards) guard.entity.enabled = false;
      }, upgraded);
      await collect(page, 'heavy');
      await page.evaluate(() => {
        pose(-4, 20, ammo.player.getPosition());
        ammo.player.script.scripts[0]._angles.set(45, 0, 0);
        ammo.camera.setLocalEulerAngles(45, 0, 0);
        ammo.app.systems.rigidbody.gravity.set(0, -25.6, 0);
        window.landing = null;
        window.crossed38 = false;
        const item = ammo.queue[0];
        item.entity.collision.once('collisionstart', result => {
          landing = { other: result.other.name, distance: 20 - item.entity.getPosition().z };
        });
        const sample = () => {
          const p = item.entity.getPosition();
          if (item.state === 'world' && p.z < -18 && p.y > 0.5) crossed38 = true;
          if (landing) ammo.app.off('update', sample);
        };
        ammo.app.on('update', sample);
      });
      await page.mouse.down();
      await page.waitForFunction(() => document.getElementById('draw-fill').style.width === '100%');
      await page.mouse.up();
      await page.waitForFunction(() => landing !== null);
      ranges.push(await page.evaluate(() => ({ ...landing, crossed38 })));
    }
    assert.equal(ranges[0].other, 'floor');
    assert.ok(ranges[0].distance < 38, JSON.stringify(ranges));
    assert.ok(ranges[1].distance > 38, JSON.stringify(ranges));
    assert.equal(ranges[1].crossed38, true);
  });
});
