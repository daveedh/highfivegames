/**
 * THROWAWAY: does killing a guard feel like a moment? Three feedback chains on
 * ?variant=A|B|C reuse the settled ammo prototype, not its stationary dummy falls.
 * Wreckage stays movable (chosen live); all other feedback is still a candidate.
 * npm run prototype:kill. Deliberately excluded from the production entry.
 */
import * as pc from 'playcanvas';
import { app, player, camera, items, targets, cfg, tiers, reset, visual, material,
  say, slider, el, cancelDraw, type Item } from './ammo-feel';
import './kill-feel.css';

const presets = [
  { key: 'A', name: 'Stagger and collapse', seconds: 1.35, chunks: 6,
    description: 'The impact drives it back. A leg gives way; its weight hits the floor.' },
  { key: 'B', name: 'Armour coming apart', seconds: 1.65, chunks: 8,
    description: 'Panels break loose in stages. The exposed frame takes a final step, then collapses.' },
  { key: 'C', name: 'Electrical failure', seconds: 1.9, chunks: 8,
    description: 'An arcing power fault locks the joints, flickers, then drops a dead machine.' }
];
const params = new URLSearchParams(location.search);
let index = Math.max(0, presets.findIndex(p => p.key === (params.get('variant') ?? 'A').toUpperCase()));
const tuning = { ...presets[index], volume: 0.55, stagger: 0.22 };
const feedback = { hitmarker: true, targetFlash: true, screenShake: true,
  hitStop: true, debris: true, tracer: true, sound: true };
let hunt = false;
let hearts = 3;
let hurtLeft = 0;
let shake = 0;
let stopUntil = 0;
let markerLeft = 0;
let clock = 0;
let audio: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let audioGeneration = 0;
const activeSounds = new Set<AudioScheduledSourceNode>();
const physics = app.systems.rigidbody!;
const steel = material(0.39, 0.43, 0.49);
const black = material(0.1, 0.12, 0.15);
const white = material(1, 0.95, 0.78);
const amber = material(0.95, 0.66, 0.1);
const angry = material(0.8, 0.14, 0.1);
const searching = material(0.9, 0.4, 0.08);
const blue = material(0.15, 0.4, 0.7);
const dead = material(0.21, 0.24, 0.28);
const spark = material(0.6, 0.86, 1);
spark.emissive = new pc.Color(0.6, 0.86, 1);
spark.update();

type State = 'patrol' | 'suspicious' | 'chase' | 'search' | 'dying' | 'down';
type Part = { entity: pc.Entity; home: pc.Vec3 };
type Guard = (typeof targets)[number] & {
  model: pc.Entity; parts: Part[]; state: State; yaw: number; waypoint: number;
  seeing: number; unseen: number; search: number; lastKnown: pc.Vec3;
  reaction: number; flash: number; deathTime: number; deathStyle: string;
  deathSeconds: number; deathChunks: number; emitted: number; grounded: boolean;
  direction: pc.Vec3; deathOrigin: pc.Vec3; heavy: boolean;
};
const guards: Guard[] = [-3, 0, 3].map((x, i) => {
  const entity = new pc.Entity(`guard ${i + 1}`);
  entity.addComponent('collision', { type: 'capsule', radius: 0.45, height: 2.4 });
  entity.addComponent('rigidbody', { type: 'kinematic', friction: 0.6 });
  app.root.addChild(entity);
  const home = new pc.Vec3(x, 1.2, 4 - i * 5);
  entity.rigidbody!.teleport(home);
  const model = new pc.Entity('articulated guard');
  entity.addChild(model);
  const parts: Part[] = [];
  const part = (name: string, size: number[], pos: number[], m = steel) => {
    const e = visual(model, 'box', size, pos, m);
    e.name = name;
    parts.push({ entity: e, home: e.getLocalPosition().clone() });
    return e;
  };
  part('chest', [0.72, 0.83, 0.42], [0, 0.22, 0]);
  part('head', [0.5, 0.42, 0.44], [0, 0.98, 0]);
  part('visor', [0.43, 0.09, 0.05], [0, 1, -0.24], blue);
  part('hips', [0.53, 0.24, 0.38], [0, -0.37, 0], black);
  for (const side of [-1, 1]) {
    part('arm', [0.19, 0.8, 0.23], [side * 0.5, 0.15, 0]);
    part('leg', [0.23, 0.65, 0.25], [side * 0.22, -0.8, 0]);
    part('foot', [0.29, 0.12, 0.44], [side * 0.22, -1.14, -0.08], black);
  }
  const guard: Guard = { entity, model, parts, home, hp: 4, fall: 0, shove: 0,
    state: 'patrol', yaw: 180, waypoint: 0, seeing: 0, unseen: 0, search: 0,
    lastKnown: home.clone(), reaction: 0, flash: 0, deathTime: 0, deathStyle: 'A',
    deathSeconds: 1, deathChunks: 0, emitted: 0, grounded: false,
    direction: new pc.Vec3(0, 0, -1), deathOrigin: home.clone(), heavy: false };
  targets.push(guard);
  entity.setEulerAngles(0, 180, 0);
  return guard;
});

// 24 pieces + three corpses + 12 active throwables + player = 40 dynamic bodies.
type Fragment = { entity: pc.Entity };
const fragments: Fragment[] = [];
const sparks: { entity: pc.Entity; velocity: pc.Vec3; life: number }[] = [];
const trails: { entity: pc.Entity; previous: pc.Vec3; line: pc.Entity }[] = [];
const MAX_FRAGMENTS = 24;
function scatter(at: pc.Vec3, count: number, direction: pc.Vec3): void {
  if (!feedback.debris) return;
  for (let i = 0; i < count && fragments.length < MAX_FRAGMENTS; i++) {
    const size = 0.18 + Math.random() * 0.18;
    const e = new pc.Entity('movable guard wreckage');
    visual(e, 'box', [size * 1.6, size * 0.45, size], [0, 0, 0], i % 3 ? steel : black);
    e.addComponent('collision', { type: 'box', halfExtents: new pc.Vec3(size * 0.8, size * 0.225, size * 0.5) });
    e.addComponent('rigidbody', { type: 'dynamic', mass: 0.45, friction: 0.7,
      restitution: 0.3, linearDamping: 0.15, angularDamping: 0.25 });
    app.root.addChild(e);
    e.rigidbody!.teleport(at);
    e.rigidbody!.body.setCcdMotionThreshold(0.01);
    e.rigidbody!.body.setCcdSweptSphereRadius(size * 0.2);
    e.rigidbody!.linearVelocity = new pc.Vec3((Math.random() - 0.5) * 3 + direction.x * 2,
      1.5 + Math.random() * 2.4, (Math.random() - 0.5) * 3 + direction.z * 2);
    e.rigidbody!.angularVelocity = new pc.Vec3(Math.random() * 5, Math.random() * 4, Math.random() * 5);
    fragments.push({ entity: e });
  }
}
function arc(at: pc.Vec3, amount: number): void {
  for (let i = 0; i < amount && sparks.length < 48; i++) {
    const entity = visual(app.root, 'box', [0.035, 0.035, 0.16], [at.x, at.y, at.z], spark);
    sparks.push({ entity, life: 0.12 + Math.random() * 0.18,
      velocity: new pc.Vec3((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6) });
  }
}
function silence(): void {
  audioGeneration++;
  for (const source of activeSounds) source.stop();
  activeSounds.clear();
}
async function sound(kind: 'hit' | 'failure' | 'floor' | 'shot', style = tuning.key): Promise<void> {
  if (!feedback.sound) return;
  const generation = audioGeneration;
  try {
    audio ??= new AudioContext();
    await audio.resume();
    if (generation !== audioGeneration || !feedback.sound) return;
    if (audio.state !== 'running') throw new Error(`Audio engine is ${audio.state}`);
    const start = audio.currentTime;
    if (!noise) {
      noise = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    const duration = kind === 'failure' ? 0.65 : kind === 'floor' ? 0.38 : kind === 'hit' ? 0.2 : 0.12;
    const out = audio.createGain();
    out.gain.value = tuning.volume * (kind === 'shot' ? 0.3 : 0.65);
    out.connect(audio.destination);
    const source = audio.createBufferSource();
    source.buffer = noise;
    const filter = audio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.65;
    filter.frequency.value = kind === 'floor' ? 700 : style === 'C' ? 2300 : 1500;
    const envelope = audio.createGain();
    envelope.gain.setValueAtTime(0.001, start);
    envelope.gain.exponentialRampToValueAtTime(0.65, start + 0.004);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + duration);
    source.connect(filter).connect(envelope).connect(out);
    const body = audio.createOscillator();
    body.type = kind === 'failure' && style === 'C' ? 'sawtooth' : 'triangle';
    body.frequency.setValueAtTime(kind === 'floor' ? 360 : kind === 'failure' ? 950 : 750, start);
    body.frequency.exponentialRampToValueAtTime(kind === 'floor' ? 140 : 220, start + duration);
    const bodyGain = audio.createGain();
    bodyGain.gain.setValueAtTime(0.001, start);
    bodyGain.gain.exponentialRampToValueAtTime(0.28, start + 0.008);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    body.connect(bodyGain).connect(out);
    activeSounds.add(source);
    activeSounds.add(body);
    source.onended = () => { activeSounds.delete(source); source.disconnect(); filter.disconnect(); envelope.disconnect(); };
    body.onended = () => { activeSounds.delete(body); body.disconnect(); bodyGain.disconnect(); out.disconnect(); };
    source.start(start);
    body.start(start);
    source.stop(start + duration + 0.02);
    body.stop(start + duration + 0.03);
    el('kill-audio').textContent = 'Synthesized metal / motor / impact. Audibility is for you to judge, not the API.';
  } catch (error) {
    console.error('Kill prototype audio unavailable', error);
    el('kill-audio').textContent = `Audio unavailable: ${error instanceof Error ? error.message : String(error)}`;
    say('Sound unavailable. Check the audio status in tuning.');
  }
}
function damage(item: Item, other: pc.Entity): void {
  const g = guards.find(guard => guard.entity === other && guard.hp > 0);
  if (!g || !item.armed || item.struck.has(other)) return;
  item.struck.add(other);
  g.hp = Math.max(0, g.hp - tiers[item.tier].damage);
  g.state = g.hp ? 'chase' : 'dying';
  g.unseen = 0;
  g.lastKnown.copy(player.getPosition());
  g.reaction = tuning.stagger;
  g.flash = 0.13;
  g.direction.copy(g.entity.getPosition()).sub(item.entity.getPosition());
  g.direction.y = 0;
  if (g.direction.lengthSq() < 0.01) g.direction.copy(camera.forward);
  g.direction.normalize();
  g.heavy = item.tier === 'heavy';
  if (feedback.screenShake) shake = Math.min(0.18, shake + (g.hp ? 0.1 : 0.15));
  if (feedback.hitStop) stopUntil = performance.now() + (g.hp ? 45 : 75);
  if (feedback.hitmarker) {
    markerLeft = g.hp ? 0.18 : 0.38;
    el('kill-marker').classList.toggle('kill', !g.hp);
  }
  if (feedback.debris) arc(item.entity.getPosition().clone(), 4);
  void sound('hit');
  if (!g.hp) {
    g.deathTime = 0;
    g.deathOrigin.copy(g.entity.getPosition());
    g.deathStyle = tuning.key;
    g.deathSeconds = tuning.seconds;
    g.deathChunks = tuning.chunks;
    // Collision returns as a dynamic corpse when the animation finishes.
    g.entity.collision!.enabled = false;
    void sound('failure', g.deathStyle);
  }
  say(`${item.name}: ${g.hp ? `${g.hp}/4 guard health` : 'lethal hit'}${g.heavy ? ' / Heavy knockdown' : ''}`);
}
app.on('prototype:hit', damage);
app.on('prototype:fired', (item: Item) => {
  if (feedback.screenShake) shake = Math.min(0.18, shake + 0.05);
  void sound('shot');
  const existing = trails.find(t => t.entity === item.entity);
  if (existing) existing.previous.copy(item.entity.getPosition());
  else {
    const line = visual(app.root, 'box', [0.015, 0.015, 0.01], [0, 0, 0], amber);
    line.enabled = false;
    trails.push({ entity: item.entity, previous: item.entity.getPosition().clone(), line });
  }
});
function clearEffects(): void {
  for (const f of fragments) f.entity.destroy();
  for (const s of sparks) s.entity.destroy();
  for (const t of trails) t.line.destroy();
  fragments.length = sparks.length = trails.length = 0;
  shake = stopUntil = markerLeft = 0;
  app.timeScale = 1;
  silence();
}
function resetGuards(): void {
  clearEffects();
  hearts = 3;
  hurtLeft = 0;
  for (const g of guards) {
    g.hp = 4;
    g.state = 'patrol';
    g.yaw = 180;
    g.waypoint = 0;
    g.seeing = g.unseen = g.search = g.reaction = g.flash = g.deathTime = g.emitted = 0;
    g.grounded = false;
    g.entity.rigidbody!.type = 'kinematic';
    g.entity.collision!.enabled = true;
    g.entity.rigidbody!.teleport(g.home, new pc.Quat().setFromEulerAngles(0, 180, 0));
    g.model.setLocalPosition(0, 0, 0);
    g.model.setLocalEulerAngles(0, 0, 0);
    for (const part of g.parts) {
      part.entity.enabled = true;
      part.entity.setLocalPosition(part.home);
      part.entity.setLocalEulerAngles(0, 0, 0);
    }
  }
}
app.on('prototype:reset', resetGuards);
function obstruction(g: Guard, from: pc.Vec3, to: pc.Vec3): pc.RaycastResult | undefined {
  return physics.raycastAll(from, to).filter(h => h.entity !== g.entity)
    .sort((a, b) => a.hitFraction - b.hitFraction)[0];
}
function move(g: Guard, target: pc.Vec3, speed: number, dt: number): number {
  const position = g.entity.getPosition().clone();
  const direction = target.clone().sub(position);
  direction.y = 0;
  const distance = direction.length();
  if (distance < 0.05) return distance;
  direction.normalize();
  const yaw = Math.atan2(-direction.x, -direction.z) * pc.math.RAD_TO_DEG;
  const delta = ((yaw - g.yaw + 540) % 360) - 180;
  g.yaw += pc.math.clamp(delta, -400 * dt, 400 * dt);
  let clear = false;
  for (const angle of [0, 55, -55]) {
    const dir = new pc.Quat().setFromEulerAngles(0, angle, 0).transformVector(direction);
    const from = new pc.Vec3(position.x, 0.6, position.z);
    const wall = obstruction(g, from, from.clone().add(dir.clone().mulScalar(1.1)));
    if (wall && wall.entity !== player) continue;
    position.add(dir.mulScalar(Math.min(distance, speed * dt)));
    clear = true;
    break;
  }
  if (clear) g.entity.rigidbody!.teleport(position);
  g.entity.setEulerAngles(0, g.yaw, 0);
  return distance;
}
function tickGuard(g: Guard, dt: number): void {
  g.flash = Math.max(0, g.flash - dt);
  g.reaction = Math.max(0, g.reaction - dt);
  const colour = g.hp === 0 ? dead : g.state === 'chase' ? angry :
    g.state === 'suspicious' ? amber : g.state === 'search' ? searching : steel;
  for (const p of g.parts) {
    p.entity.render!.material = feedback.targetFlash && g.flash > 0 ? white :
      p.entity.name === 'visor' ? (g.hp === 0 ? black : blue) : colour;
  }
  if (g.state === 'down') return;
  if (g.state === 'dying') {
    g.deathTime += dt;
    const t = Math.min(1, g.deathTime / g.deathSeconds);
    const collapse = pc.math.smoothstep(0.3, 0.95, t);
    const backward = g.heavy ? 1.5 : 0.7;
    const position = g.deathOrigin.clone().add(g.direction.clone().mulScalar(backward * pc.math.smoothstep(0, 0.6, t)));
    // Keep the parent/collider unscaled. Only the articulated model pitches.
    g.entity.setPosition(position.x, 1.2 - collapse * 0.92, position.z);
    const relative = new pc.Quat().setFromEulerAngles(0, -g.yaw, 0).transformVector(g.direction);
    const pitch = -relative.z * 88 * collapse;
    const roll = relative.x * 88 * collapse;
    const fault = g.deathStyle === 'C' && t < 0.65 ? Math.sin(t * 110) * 7 * Math.sin(Math.PI * t) : 0;
    g.model.setLocalEulerAngles(pitch + fault, 0, roll + fault * 0.4);
    for (const p of g.parts) {
      const leg = p.entity.name === 'leg';
      p.entity.setLocalEulerAngles(leg ? Math.sin(t * Math.PI) * (p.home.x < 0 ? 45 : -25) : 0, 0,
        p.entity.name === 'arm' ? Math.sin(t * Math.PI) * Math.sign(p.home.x) * 28 : 0);
      if (g.deathStyle === 'B' && p.entity.name === 'arm' && t > 0.28) p.entity.enabled = false;
      if (g.deathStyle === 'B' && p.entity.name === 'head' && t > 0.65) p.entity.enabled = false;
    }
    if (g.deathStyle === 'C' && t < 0.65 && Math.floor(g.deathTime * 20) !== Math.floor((g.deathTime - dt) * 20)) {
      arc(g.entity.getPosition().clone().add(new pc.Vec3(0, 0.65, 0)), 3);
    }
    const wanted = Math.floor(g.deathChunks * (g.deathStyle === 'B' ? t : pc.math.smoothstep(0.5, 0.95, t)));
    if (wanted > g.emitted) {
      scatter(g.entity.getPosition().clone(), wanted - g.emitted, g.direction);
      g.emitted = wanted;
    }
    if (t >= 0.87 && !g.grounded) {
      g.grounded = true;
      void sound('floor', g.deathStyle);
      if (feedback.screenShake) shake = Math.max(shake, 0.06);
    }
    if (t === 1) {
      g.state = 'down';
      const rotation = g.model.getRotation().clone();
      g.model.setLocalEulerAngles(0, 0, 0);
      g.entity.collision!.enabled = true;
      g.entity.rigidbody!.type = 'dynamic';
      g.entity.rigidbody!.mass = 12;
      g.entity.rigidbody!.linearDamping = 0.3;
      g.entity.rigidbody!.angularDamping = 0.5;
      g.entity.rigidbody!.teleport(new pc.Vec3(position.x, 0.5, position.z), rotation);
      g.entity.rigidbody!.linearVelocity = g.direction.clone().mulScalar(0.5);
      g.entity.rigidbody!.angularVelocity = pc.Vec3.ZERO;
    }
    return;
  }
  g.model.setLocalEulerAngles(g.reaction > 0 ? -12 * g.reaction / Math.max(0.01, tuning.stagger) : 0, 0, 0);
  if (!hunt || hearts === 0 || g.reaction > 0) return;
  const eye = g.entity.getPosition().clone().add(new pc.Vec3(0, 0.8, 0));
  const toPlayer = player.getPosition().clone().sub(eye);
  const distance = Math.hypot(toPlayer.x, toPlayer.z);
  const desiredYaw = Math.atan2(-toPlayer.x, -toPlayer.z) * pc.math.RAD_TO_DEG;
  const inCone = Math.abs(((desiredYaw - g.yaw + 540) % 360) - 180) <= 65;
  const hit = obstruction(g, eye, camera.getPosition());
  const visible = distance < 22 && inCone && (!hit || hit.entity === player);
  if (visible) {
    g.seeing += dt;
    g.unseen = 0;
    g.lastKnown.copy(player.getPosition());
    if (g.state !== 'chase') g.state = g.seeing >= 0.15 ? 'chase' : 'suspicious';
  } else {
    g.seeing = 0;
    g.unseen += dt;
    if (g.state === 'suspicious') g.state = 'patrol';
    if (g.state === 'chase' && g.unseen > 5) { g.state = 'search'; g.search = 10; }
  }
  if (g.state === 'chase') {
    move(g, g.lastKnown, 7, dt);
    if (distance < 1.7 && visible && hurtLeft === 0) {
      hearts--;
      hurtLeft = 0.9;
      const push = player.getPosition().clone().sub(g.entity.getPosition()).normalize().mulScalar(620);
      player.rigidbody!.applyImpulse(push);
      say(hearts ? `Guard hit you. ${hearts}/3 hearts.` : 'Three hits. Press Esc, then Reset playtest.');
      if (!hearts) { cancelDraw(); document.exitPointerLock(); }
    }
  } else if (g.state === 'search') {
    g.search -= dt;
    if (move(g, g.lastKnown, 4.2, dt) < 1) {
      g.yaw += 140 * dt;
      g.entity.setEulerAngles(0, g.yaw, 0);
    }
    if (g.search <= 0) g.state = 'patrol';
  } else if (g.state === 'patrol') {
    const destination = g.home.clone().add(new pc.Vec3(g.waypoint % 2 ? 1 : -1, 0, g.waypoint < 2 ? 2 : -2));
    if (move(g, destination, 3, dt) < 0.5) g.waypoint = (g.waypoint + 1) % 4;
  }
  for (const p of g.parts) {
    if (p.entity.name === 'leg' || p.entity.name === 'arm') {
      p.entity.setLocalEulerAngles(Math.sin(clock * (g.state === 'chase' ? 13 : 7)) * 20 * Math.sign(p.home.x), 0, 0);
    }
  }
}

el('readout').innerHTML = `<h1>THROWAWAY: make the kill land</h1><div id="state"></div>
  <div id="kill-state"></div><p class="instructions">Start with one Light hit, then finish with a Heavy.
  Compare A / B / C. Esc opens the six feedback switches. Reset restores the same test.</p>
  <p class="instructions dim">Wreckage stays movable: walk into it to kick it. Stand-still targets first;
  enable hunting when ready. This is not the final showroom.</p>`;
el('panel').innerHTML = `<h2>Kill feedback candidates</h2><p id="kill-blurb"></p>
  <div id="kill-toggles"></div><div id="kill-knobs"></div>
  <label><input id="hunt" type="checkbox"> Guards hunt (three hearts)</label>
  <h2>Sound effects</h2><p id="kill-audio">Candidate source: synthesized. No voice, joke sting, or victory jingle.</p>
  <button id="audition-hit">Hear impact</button> <button id="audition-death">Hear failure</button>
  <button id="audition-floor">Hear floor impact</button>
  <label>Empty pouch<select id="empty-mode"><option value="text">Message only</option>
  <option value="click">Dry-fire click</option><option value="click-message">Click + message</option></select></label>
  <p class="note">Active: <b id="empty-mode-active"></b></p>
  <button id="reset">Reset playtest</button> <button id="copy-kill">Show / copy settings</button>
  <pre id="kill-settings" hidden></pre>`;
const marker = document.createElement('div');
marker.id = 'kill-marker';
marker.textContent = '\u00d7';
el('proto-ui').appendChild(marker);
el('click-to-play').innerHTML = `<div><h1>Make the kill land.</h1><p>Click the showroom to play.</p>
  <p>WASD / Shift / Space<br>E grab / hold left mouse, release to fire<br>Right mouse cancels / Esc tunes</p>
  <p>Start at the yellow shelf, grab a Light and a Heavy, then face the three guards in the centre aisle.</p>
  <p>A: stagger and collapse<br>B: armour coming apart<br>C: electrical failure</p>
  <p class="dim">Arrows compare. Switching resets the playtest. None is a winner yet.</p></div>`;
const labels: Record<keyof typeof feedback, string> = {
  hitmarker: 'Hitmarker', targetFlash: 'Target flash', screenShake: 'Screen shake',
  hitStop: 'Hit stop (45 / 75 ms)', debris: 'Lasting debris', tracer: 'Shot tracer', sound: 'Sound effects'
};
for (const key of Object.keys(feedback) as (keyof typeof feedback)[]) {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = feedback[key];
  input.dataset.feedback = key;
  input.onchange = () => {
    feedback[key] = input.checked;
    if (key === 'sound' && !input.checked) silence();
    if (key === 'screenShake' && !input.checked) shake = 0;
    if (key === 'hitStop' && !input.checked) { stopUntil = 0; app.timeScale = 1; }
  };
  label.append(input, labels[key]);
  el('kill-toggles').appendChild(label);
}
const huntInput = el('hunt');
if (huntInput instanceof HTMLInputElement) huntInput.onchange = () => {
  hunt = huntInput.checked;
  say(hunt ? 'Hunting enabled. Escape with corners, not speed.' : 'Guards hold position for feedback comparison.');
};
function refresh(): void {
  el('variant').textContent = `${tuning.key} - ${tuning.name}`;
  el('kill-blurb').textContent = tuning.description;
  el('kill-knobs').replaceChildren();
  slider(el('kill-knobs'), 'Death duration (seconds)', tuning.seconds, 0.6, 2.5, 0.05, v => { tuning.seconds = v; });
  slider(el('kill-knobs'), 'Movable pieces per kill', tuning.chunks, 0, 8, 1, v => { tuning.chunks = v; });
  slider(el('kill-knobs'), 'Nonlethal stagger (seconds)', tuning.stagger, 0.05, 0.45, 0.01, v => { tuning.stagger = v; });
  slider(el('kill-knobs'), 'Effects volume', tuning.volume, 0, 1, 0.05, v => { tuning.volume = v; });
  const empty = el('empty-mode');
  if (empty instanceof HTMLSelectElement) {
    empty.value = cfg.empty;
    el('empty-mode-active').textContent = cfg.empty;
    empty.onchange = () => { cfg.empty = empty.value; el('empty-mode-active').textContent = cfg.empty; };
  }
}
function switchVariant(delta: number): void {
  index = (index + delta + presets.length) % presets.length;
  Object.assign(tuning, presets[index]);
  const url = new URL(location.href);
  url.searchParams.set('variant', tuning.key);
  history.replaceState(null, '', url);
  reset();
  refresh();
  say(`${tuning.name}. Test reset; feedback switches and empty-pouch choice preserved.`);
}
app.on('prototype:variant', switchVariant);
el('audition-hit').onclick = () => { void sound('hit'); };
el('audition-death').onclick = () => { void sound('failure'); };
el('audition-floor').onclick = () => { void sound('floor'); };
el('reset').onclick = reset;
const settings = () => ({ question: 'Does killing a guard feel like a moment?', candidate: tuning,
  feedback, hunt, empty: cfg.empty, wreckage: 'movable parts and corpses',
  budget: { fragments: MAX_FRAGMENTS, corpses: 3, activeThrowables: 12, player: 1, total: 40 } });
el('copy-kill').onclick = async () => {
  const text = JSON.stringify(settings(), null, 2);
  el('kill-settings').hidden = false;
  el('kill-settings').textContent = text;
  try { await navigator.clipboard.writeText(text); say('Candidate settings copied.'); }
  catch (error) { console.warn('Clipboard unavailable', error); say('Select the settings text in the panel.'); }
};
window.addEventListener('blur', silence);
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === null) { stopUntil = 0; app.timeScale = 1; }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) silence(); });
let hudTime = 0;
app.on('update', (rawDt: number) => {
  if (document.hidden || !app.autoRender) return;
  const stopped = performance.now() < stopUntil;
  app.timeScale = stopped ? 0 : 1;
  const dt = stopped ? 0 : Math.min(rawDt, 0.05);
  clock += dt;
  hurtLeft = Math.max(0, hurtLeft - dt);
  markerLeft = Math.max(0, markerLeft - dt);
  marker.style.opacity = feedback.hitmarker && markerLeft > 0 ? '1' : '0';
  shake *= Math.exp(-dt * 18);
  if (feedback.screenShake && shake > 0.001) {
    camera.translateLocal((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0);
  }
  for (const g of guards) tickGuard(g, dt);
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life -= dt;
    s.entity.translate(s.velocity.clone().mulScalar(dt));
    if (s.life <= 0) { s.entity.destroy(); sparks.splice(i, 1); }
  }
  for (const t of trails) {
    const item = items.find(i => i.entity === t.entity)!;
    const p = t.entity.getPosition().clone();
    const delta = p.clone().sub(t.previous);
    const length = delta.length();
    t.line.enabled = feedback.tracer && item.state === 'world' && item.armed && length > 0.03 && length < 5;
    if (t.line.enabled) {
      t.line.setPosition(p.clone().add(t.previous).mulScalar(0.5));
      t.line.setRotation(new pc.Quat().setFromDirections(pc.Vec3.FORWARD, delta.normalize()));
      t.line.setLocalScale(0.018, 0.018, length);
    }
    t.previous.copy(p);
  }
  hudTime += dt;
  if (hudTime > 0.1) {
    hudTime = 0;
    const dynamic = 1 + fragments.length + guards.filter(g => g.entity.rigidbody!.type === 'dynamic').length +
      items.filter(i => i.entity.enabled && i.entity.rigidbody!.type === 'dynamic').length;
    el('kill-state').textContent = `${tuning.key}: ${guards.map(g => `${g.hp}/4 ${g.state}`).join(' | ')}
${hunt ? `Hearts ${hearts}/3` : 'Hunting OFF'} | dynamic bodies ${dynamic}/40
Movable pieces ${fragments.length}/${MAX_FRAGMENTS} | ${guards.filter(g => g.state === 'down').length}/3 down`;
  }
});
refresh();
resetGuards();
export { guards, feedback, tuning, fragments, sparks, settings };
