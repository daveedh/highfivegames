import * as pc from 'playcanvas';
import { receipts, receiptHeader, receiptFooter } from '../copy';
import type { UpgradeId } from '../upgrades';
import { app, camera, player, upgrades, interaction, box, ray, visual, material, cancelDraw, say, el } from './ammo-feel';
import './upgrade-checkouts.css';

const names: Record<UpgradeId, string> = { band: 'The Band', pouch: 'Bigger Pouch' };
const locations: { id: UpgradeId; home: [number, number, number]; checkout: [number, number, number] }[] = [
  { id: 'band', home: [-11.5, 0.95, -8.5], checkout: [-5.6, 0.7, -9] },
  { id: 'pouch', home: [12, 0.95, 5.5], checkout: [6, 0.7, 5.5] }
];
const REACH = 2.6;

export function installCheckouts(options: { interrupted: () => boolean; soundEnabled: () => boolean }) {
  const cardboard = material(0.65, 0.5, 0.32);
  const tape = material(0.85, 0.73, 0.48);
  const blue = material(0.12, 0.3, 0.58);
  const paper = material(0.97, 0.96, 0.91);
  const carried = new pc.Entity('carried flat-pack');
  camera.addChild(carried);
  carried.setLocalPosition(0, -0.36, -0.8);
  visual(carried, 'box', [0.68, 0.17, 0.42], [0, 0, 0], cardboard);
  visual(carried, 'box', [0.1, 0.175, 0.425], [0, 0, 0], tape);
  carried.enabled = false;

  function print(parent: pc.Entity, lines: string[], width: number, height: number, y: number, z: number): pc.Entity {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 768;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Receipt printing requires a 2D canvas');
    ctx.fillStyle = '#f7f5e8';
    ctx.fillRect(0, 0, 768, 768);
    ctx.fillStyle = '#17212a';
    ctx.font = '26px monospace';
    lines.forEach((line, i) => ctx.fillText(line, 28, 70 + i * 58, 712));
    const texture = new pc.Texture(app.graphicsDevice, { mipmaps: true });
    texture.setSource(canvas);
    const ink = new pc.StandardMaterial();
    ink.diffuseMap = texture;
    ink.emissiveMap = texture;
    ink.emissive = new pc.Color(0.45, 0.45, 0.45);
    ink.cull = pc.CULLFACE_NONE;
    ink.update();
    const sheet = visual(parent, 'plane', [width, 1, height], [0, y, z], ink);
    sheet.setLocalEulerAngles(90, 0, 0);
    return sheet;
  }

  const slips = document.createElement('section');
  slips.id = 'upgrade-receipts';
  slips.setAttribute('aria-label', 'Self-checkout receipts');
  el('proto-ui').appendChild(slips);
  const status = document.createElement('div');
  status.id = 'checkout-status';
  status.setAttribute('role', 'status');
  el('proto-ui').appendChild(status);

  const stations = locations.map(({ id, home, checkout }) => {
    // Display boxes and self-checkouts are static. The carried model and paper have
    // no body: they consume zero of combat's 40 reserved dynamic-body slots.
    box(`${names[id]} display`, [home[0], 0.4, home[2]], [1.2, 0.8, 0.8]);
    const pack = box(`${names[id]} flat-pack`, home, [0.8, 0.25, 0.5], cardboard);
    visual(pack, 'box', [0.1, 0.255, 0.505], [0, 0, 0], tape);
    print(pack, [names[id]], 0.7, 0.2, 0, 0.257);
    const checkoutEntity = box(`${names[id]} self-checkout`, checkout, [1.3, 1.4, 0.9], blue);
    visual(checkoutEntity, 'box', [1.4, 0.07, 1], [0, 0.72, 0], paper);
    print(checkoutEntity, ['SELF-CHECKOUT', names[id]], 1.1, 0.55, 0.22, 0.46);
    const copy = receipts[id];
    const worldReceipt = print(checkoutEntity,
      [receiptHeader, '', copy.item, copy.price.toFixed(2), copy.explanation, '', ...receiptFooter],
      0.68, 0.85, -0.22, 0.48);
    worldReceipt.enabled = false;
    const slip = document.createElement('article');
    slip.className = 'upgrade-receipt';
    slip.hidden = true;
    const header = document.createElement('h2');
    header.textContent = receiptHeader;
    const item = document.createElement('p');
    item.textContent = `${copy.item}    ${copy.price.toFixed(2)}`;
    const explanation = document.createElement('p');
    explanation.textContent = copy.explanation;
    const footer = document.createElement('p');
    footer.textContent = receiptFooter.join('\n');
    slip.append(header, item, explanation, footer);
    slips.appendChild(slip);
    return { id, home: new pc.Vec3(...home), pack, checkout: checkoutEntity, worldReceipt, slip, printedAt: -Infinity };
  });

  type Station = (typeof stations)[number];
  function inReach(entity: pc.Entity, aiming: boolean): boolean {
    const origin = camera.getPosition();
    const offset = entity.getPosition().clone().sub(origin);
    if (offset.length() > REACH) return false;
    if (aiming && offset.clone().normalize().dot(camera.forward) < Math.cos(25 * pc.math.DEG_TO_RAD)) return false;
    return ray(origin, entity.getPosition())?.entity === entity;
  }
  function focus(): { station: Station; kind: 'box' | 'checkout' } | undefined {
    for (const station of stations) {
      if (inReach(station.checkout, true)) return { station, kind: 'checkout' };
      if (upgrades.state(station.id) === 'world' && inReach(station.pack, true)) return { station, kind: 'box' };
    }
  }
  function attended(station: Station): boolean {
    return document.pointerLockElement !== null && document.hasFocus() && !document.hidden &&
      !options.interrupted() && inReach(station.checkout, false);
  }

  let audio: AudioContext | null = null;
  let audioAttempt = 0;
  let chatterTime = 0;
  let clock = 0;
  const sounds = new Set<OscillatorNode>();
  function silence(): void {
    for (const sound of sounds) sound.stop();
    sounds.clear();
    chatterTime = 0;
  }
  async function enableAudio(): Promise<void> {
    if (!options.soundEnabled()) return;
    const attempt = ++audioAttempt;
    try {
      audio ??= new AudioContext();
      await audio.resume();
      if (attempt !== audioAttempt) return;
      if (audio.state !== 'running') throw new Error(`Audio engine is ${audio.state}`);
    } catch (error) {
      console.error('Self-checkout audio unavailable', error);
      say('Self-checkout sound unavailable in this browser.');
    }
  }
  function chatter(dt: number): void {
    if (!audio || audio.state !== 'running' || !options.soundEnabled()) { silence(); return; }
    chatterTime -= dt;
    if (chatterTime > 0) return;
    chatterTime = 0.085;
    const motor = audio.createOscillator();
    motor.type = 'square';
    motor.frequency.value = Math.floor(clock * 12) % 3 ? 760 : 1150;
    const volume = audio.createGain();
    volume.gain.setValueAtTime(0.035, audio.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.055);
    motor.connect(volume).connect(audio.destination);
    motor.onended = () => { sounds.delete(motor); motor.disconnect(); volume.disconnect(); };
    sounds.add(motor);
    motor.start();
    motor.stop(audio.currentTime + 0.06);
  }

  interaction.tryInteract = () => {
    const target = focus();
    if (!target) return false;
    const { station, kind } = target;
    if (options.interrupted()) { say('Self-checkout interrupted. The box is safe.'); return true; }
    if (kind === 'box') {
      if (!upgrades.pickUp(station.id)) { say('Both hands full. Carry the box to its self-checkout.'); return true; }
      cancelDraw();
      station.pack.enabled = false;
      carried.enabled = true;
      say(`${names[station.id]}: carry the box to its self-checkout. Both hands full.`);
    } else if (upgrades.deposit(station.id)) {
      station.pack.enabled = true;
      station.pack.rigidbody!.teleport(station.checkout.getPosition().clone().add(new pc.Vec3(0, 0.9, 0)));
      carried.enabled = false;
      cancelDraw();
      say('Processing. Stay beside the self-checkout.');
    } else if (upgrades.state(station.id) === 'claimed') {
      station.printedAt = clock;
      say('Receipt printed.');
    } else {
      say(upgrades.state(station.id) === 'processing' ? 'Processing resumes when you return.' :
        `This self-checkout takes ${names[station.id]}.`);
    }
    void enableAudio();
    return true;
  };
  interaction.hint = () => {
    const target = focus();
    if (target) {
      const { station, kind } = target;
      if (kind === 'box') return `${names[station.id]}\nE - carry box`;
      if (upgrades.state(station.id) === 'claimed') return 'E - read receipt';
      if (upgrades.carrying === station.id) return 'E - place box in self-checkout';
      return `${names[station.id]} self-checkout`;
    }
    return upgrades.carrying ? `${names[upgrades.carrying]} / both hands full` : '';
  };
  function reset(): void {
    audioAttempt++;
    silence();
    carried.enabled = false;
    status.textContent = '';
    for (const station of stations) {
      station.pack.enabled = true;
      station.pack.rigidbody!.teleport(station.home, pc.Quat.IDENTITY);
      station.worldReceipt.enabled = false;
      station.slip.hidden = true;
      station.printedAt = -Infinity;
    }
  }
  app.on('prototype:reset', reset);
  window.addEventListener('blur', silence);
  document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement) silence(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) silence(); });

  function tick(dt: number): void {
    clock += dt;
    carried.enabled = upgrades.carrying !== null;
    let working = false;
    let message = '';
    for (const station of stations) {
      const running = attended(station) && dt > 0;
      if (upgrades.state(station.id) === 'processing') {
        working ||= running;
        if (upgrades.process(station.id, dt, running)) {
          station.pack.enabled = false;
          station.worldReceipt.enabled = true;
          station.printedAt = clock;
        } else if (player.getPosition().distance(station.checkout.getPosition()) < 6) {
          message = `${names[station.id]}: ${Math.floor(upgrades.progress(station.id) * 100)}% / ${running ? 'processing' : 'paused - box held'}`;
        }
      }
      station.slip.hidden = upgrades.state(station.id) !== 'claimed' ||
        !(clock - station.printedAt < 12 || inReach(station.checkout, true));
    }
    if (working) chatter(dt);
    else silence();
    status.textContent = message;
  }
  return { tick, reset, stations };
}
