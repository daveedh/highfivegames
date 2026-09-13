/**
 * THROWAWAY: does she sound bored, and does a caption read at a glance?
 *
 * Two jobs in one page, because both need the boys' ears and eyes in the same sitting:
 *   1. The PA running for real - zone-aware pool, a line every 25-40s, never interrupted,
 *      never overlapping, never the same line twice in a row, with the signage caption.
 *   2. Every word of copy in src/copy.ts, listed with a play button, so the forty product
 *      names and forty-eight lines can be vetoed one at a time.
 *
 * Deliberately not a 3D scene: the question is the voice and the caption, and putting a
 * showroom around it would only slow down the veto pass.
 *
 * Run: npm run prototype:pa
 */
import { paLines, products, zoneSigns, receipts, receiptHeader, receiptFooter, paAudioUrl } from '../copy.ts';
import type { ZoneId } from '../copy.ts';
import './pa-feel.css';

const zoneOrder: ZoneId[] = ['living', 'dining', 'bedrooms', 'kitchens', 'childrens', 'market'];
const tierLabel = { light: 'Light', medium: 'Medium', heavy: 'Heavy' };

/** Settled in #17: a line every 25-40s. Fast mode exists only so a playtest is not 40 minutes. */
const cadence = { minMs: 25_000, maxMs: 40_000 };
const fastCadence = { minMs: 4_000, maxMs: 7_000 };

let currentZone: ZoneId = 'living';
let running = false;
let fast = false;
let lastLineId = '';
let timer = 0;
let audio: HTMLAudioElement | null = null;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

const caption = el('div', 'pa-caption');
const captionText = el('span', 'pa-caption-text');
caption.append(el('span', 'pa-caption-icon', '\u25B6'), captionText);
document.body.append(caption);

/** One line at a time, always. A PA that talks over itself stops sounding like a PA. */
function play(id: string, text: string, url: string): void {
  audio?.pause();
  audio = new Audio(url);
  audio.play().catch(() => {
    /* Autoplay needs a gesture; the page has buttons, so this only fires before first click. */
  });
  captionText.textContent = text;
  caption.classList.add('is-visible');
  const hold = window.setTimeout(() => caption.classList.remove('is-visible'), 6_000);
  audio.addEventListener('ended', () => {
    window.clearTimeout(hold);
    window.setTimeout(() => caption.classList.remove('is-visible'), 1_200);
  });
  lastLineId = id;
}

function nextLine(): void {
  // Zone-aware: the store knows where its own departments are, it just has not noticed you.
  const pool = paLines.filter((l) => (l.zone === currentZone || l.zone === 'generic') && l.id !== lastLineId);
  const line = pool[Math.floor(Math.random() * pool.length)];
  play(line.id, line.text, paAudioUrl(line.id));
}

function schedule(): void {
  window.clearTimeout(timer);
  if (!running) return;
  const { minMs, maxMs } = fast ? fastCadence : cadence;
  const wait = minMs + Math.random() * (maxMs - minMs);
  timer = window.setTimeout(() => {
    nextLine();
    schedule();
  }, wait);
  nextDue = Date.now() + wait;
}

let nextDue = 0;
const status = el('span', 'pa-status', 'stopped');
window.setInterval(() => {
  if (!running) {
    status.textContent = 'stopped';
    return;
  }
  status.textContent = `next line in ${Math.max(0, Math.round((nextDue - Date.now()) / 1000))}s`;
}, 250);

// ---- controls -------------------------------------------------------------

const panel = el('div', 'pa-panel');
const controls = el('div', 'pa-controls');

const startBtn = el('button', 'pa-btn pa-btn-primary', 'Start the PA');
startBtn.addEventListener('click', () => {
  running = !running;
  startBtn.textContent = running ? 'Stop the PA' : 'Start the PA';
  if (running) {
    nextLine();
    schedule();
  } else {
    window.clearTimeout(timer);
  }
});

const fastBtn = el('button', 'pa-btn', 'Fast cadence: off');
fastBtn.addEventListener('click', () => {
  fast = !fast;
  fastBtn.textContent = `Fast cadence: ${fast ? 'on' : 'off'}`;
  schedule();
});

const nowBtn = el('button', 'pa-btn', 'Say something now');
nowBtn.addEventListener('click', () => {
  nextLine();
  schedule();
});

controls.append(startBtn, fastBtn, nowBtn, status);

const zoneRow = el('div', 'pa-zones');
zoneRow.append(el('span', 'pa-label', 'You are in:'));
for (const zone of zoneOrder) {
  const btn = el('button', `pa-zone${zone === currentZone ? ' is-active' : ''}`, zoneSigns[zone].name);
  btn.addEventListener('click', () => {
    currentZone = zone;
    zoneRow.querySelectorAll('.pa-zone').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
  });
  zoneRow.append(btn);
}

// ---- the audition ---------------------------------------------------------

const audition = el('section', 'pa-section');
audition.append(el('h2', '', 'Which voice?'));
audition.append(el('p', 'pa-note', 'Same three lines, same tannoy treatment, two different readers. Pick by ear.'));
const auditionIds = ['generic-1', 'bedrooms-4', 'generic-5'];
for (const voice of ['alba', 'jenny_dioco']) {
  const row = el('div', 'pa-row');
  row.append(el('span', 'pa-voice-name', voice === 'alba' ? 'Voice A - alba' : 'Voice B - jenny'));
  for (const id of auditionIds) {
    const line = paLines.find((l) => l.id === id)!;
    const btn = el('button', 'pa-btn pa-btn-small', line.text.split(' ').slice(0, 3).join(' ') + '\u2026');
    btn.addEventListener('click', () => play(`audition-${voice}-${id}`, line.text, `assets/audio/pa-audition/${voice}-${id}.mp3`));
    row.append(btn);
  }
  audition.append(row);
}

// ---- the copy, for vetoing ------------------------------------------------

const linesSection = el('section', 'pa-section');
linesSection.append(el('h2', '', `The PA lines (${paLines.length})`));
linesSection.append(el('p', 'pa-note', 'Loaded lines are about merchandise, breakage or safety. Plain lines are real store ambience, and they are what make the loaded ones read as coincidence.'));
for (const zone of [...zoneOrder, 'generic' as const]) {
  const group = el('div', 'pa-group');
  group.append(el('h3', '', zone === 'generic' ? 'ANYWHERE' : zoneSigns[zone].name));
  for (const line of paLines.filter((l) => l.zone === zone)) {
    const row = el('div', 'pa-row pa-line-row');
    const btn = el('button', 'pa-btn pa-btn-play', '\u25B6');
    btn.addEventListener('click', () => play(line.id, line.text, paAudioUrl(line.id)));
    row.append(btn, el('span', `pa-tag ${line.loaded ? 'is-loaded' : ''}`, line.loaded ? 'loaded' : 'plain'), el('span', 'pa-line-text', line.text));
    group.append(row);
  }
  linesSection.append(group);
}

const productSection = el('section', 'pa-section');
productSection.append(el('h2', '', `The shelf cards (${products.length})`));
productSection.append(el('p', 'pa-note', 'Name, price and descriptor, exactly as they read on the shelf edge. The descriptor is where the weight tier hides.'));
for (const zone of zoneOrder) {
  const group = el('div', 'pa-group');
  const sign = zoneSigns[zone];
  const heading = el('h3', '', sign.name);
  heading.append(el('span', 'pa-next', ` \u2192 ${sign.next}`));
  group.append(heading);
  if (sign.subtitle) group.append(el('p', 'pa-subtitle', sign.subtitle));
  for (const p of products.filter((x) => x.zone === zone)) {
    const card = el('div', 'pa-card');
    card.append(el('span', 'pa-card-name', p.name));
    card.append(el('span', 'pa-card-price', p.price.toFixed(2)));
    card.append(el('span', `pa-card-tier is-${p.tier}`, tierLabel[p.tier]));
    card.append(el('span', 'pa-card-desc', p.descriptor));
    group.append(card);
  }
  productSection.append(group);
}

const receiptSection = el('section', 'pa-section');
receiptSection.append(el('h2', '', 'The receipts'));
receiptSection.append(el('p', 'pa-note', 'The only place an upgrade is explained. Printed at the self-checkout, per #20.'));
for (const receipt of Object.values(receipts)) {
  const slip = el('div', 'pa-receipt');
  slip.append(el('div', 'pa-receipt-head', receiptHeader));
  const item = el('div', 'pa-receipt-line');
  item.append(el('span', '', receipt.item), el('span', '', receipt.price.toFixed(2)));
  slip.append(item);
  slip.append(el('div', 'pa-receipt-desc', receipt.explanation));
  const total = el('div', 'pa-receipt-line pa-receipt-total');
  total.append(el('span', '', receiptFooter[0]), el('span', '', receiptFooter[1]));
  slip.append(total);
  for (const foot of receiptFooter.slice(2)) slip.append(el('div', 'pa-receipt-desc', foot));
  receiptSection.append(slip);
}

panel.append(el('h1', '', 'FLATP\u00c4K SKR\u00c4PBO \u2014 the store\u2019s voice'));
panel.append(controls, zoneRow, audition, linesSection, productSection, receiptSection);
document.body.append(panel);
