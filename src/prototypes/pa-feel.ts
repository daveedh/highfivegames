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

/**
 * The veto list. Two boys going through eighty-eight pieces of copy will not remember which
 * ones they hated, so the page remembers for them and exports a list to paste back.
 */
type Veto = { label: string; note: string };
const VETO_KEY = 'skrapbo-veto';
const vetoes: Record<string, Veto> = JSON.parse(localStorage.getItem(VETO_KEY) ?? '{}');
/** Every row's repaint, so clearing can update the page without a reload. */
const painters: (() => void)[] = [];
const saveVetoes = (): void => {
  localStorage.setItem(VETO_KEY, JSON.stringify(vetoes));
  updateVetoBar();
};

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

/**
 * One veto control per piece of copy. Clicking crosses the row out and opens a note field,
 * because "this one is rubbish" is far more useful with two words of why attached.
 */
function vetoControl(id: string, label: string, row: HTMLElement): HTMLElement {
  const wrap = el('span', 'pa-veto-wrap');
  const btn = el('button', 'pa-veto', '\u2717');
  btn.title = 'Veto this one';
  const note = el('input', 'pa-veto-note');
  note.placeholder = 'why? (optional)';
  note.addEventListener('input', () => {
    if (vetoes[id]) {
      vetoes[id].note = note.value;
      saveVetoes();
    }
  });

  const paint = (): void => {
    const vetoed = Boolean(vetoes[id]);
    row.classList.toggle('is-vetoed', vetoed);
    btn.classList.toggle('is-vetoed', vetoed);
    note.style.display = vetoed ? '' : 'none';
    note.value = vetoes[id]?.note ?? '';
  };

  btn.addEventListener('click', () => {
    if (vetoes[id]) delete vetoes[id];
    else vetoes[id] = { label, note: '' };
    saveVetoes();
    paint();
  });

  paint();
  painters.push(paint);
  wrap.append(btn, note);
  return wrap;
}

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
    row.append(vetoControl(`line:${line.id}`, line.text, row));
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
  heading.append(vetoControl(`sign:${zone}`, `${sign.name} sign${sign.subtitle ? ` / ${sign.subtitle}` : ''}`, heading));
  group.append(heading);
  if (sign.subtitle) group.append(el('p', 'pa-subtitle', sign.subtitle));
  for (const p of products.filter((x) => x.zone === zone)) {
    const card = el('div', 'pa-card');
    card.append(vetoControl(`product:${p.id}`, `${p.name} - ${p.descriptor}`, card));
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
  const slipWrap = el('div', 'pa-receipt-wrap');
  slipWrap.append(slip, vetoControl(`receipt:${receipt.upgradeId}`, `${receipt.item} - ${receipt.explanation}`, slipWrap));
  receiptSection.append(slipWrap);
}

panel.append(el('h1', '', 'FLATP\u00c4K SKR\u00c4PBO \u2014 the store\u2019s voice'));
panel.append(controls, zoneRow, audition, linesSection, productSection, receiptSection);
document.body.append(panel);

// ---- the veto bar ---------------------------------------------------------

const VOICE_KEY = 'skrapbo-voice';
let chosenVoice = localStorage.getItem(VOICE_KEY) ?? 'undecided';

const vetoBar = el('div', 'pa-veto-bar');
const vetoCount = el('span', 'pa-veto-count');
const voicePick = el('span', 'pa-voice-pick');
voicePick.append(el('span', 'pa-label', 'Voice:'));
for (const [key, label] of [['alba', 'A - alba'], ['jenny_dioco', 'B - jenny']] as const) {
  const btn = el('button', `pa-btn pa-btn-small${chosenVoice === key ? ' is-chosen' : ''}`, label);
  btn.addEventListener('click', () => {
    chosenVoice = key;
    localStorage.setItem(VOICE_KEY, key);
    voicePick.querySelectorAll('button').forEach((b) => b.classList.remove('is-chosen'));
    btn.classList.add('is-chosen');
  });
  voicePick.append(btn);
}

const copyBtn = el('button', 'pa-btn pa-btn-primary', 'Copy the veto list');
copyBtn.addEventListener('click', async () => {
  const text = exportVetoes();
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = 'Copied - paste it to me';
  } catch {
    // Clipboard can be blocked; showing the text is always available as a fallback.
    dump.value = text;
    dump.style.display = '';
    dump.select();
    copyBtn.textContent = 'Select it all and copy';
  }
  window.setTimeout(() => (copyBtn.textContent = 'Copy the veto list'), 4_000);
});

/**
 * Two-step rather than a confirm() dialog: dialogs are suppressed in some embedded
 * browser panels, which silently ate the first version of this button. Repaints in place
 * rather than reloading, for the same reason - never depend on the host allowing something.
 */
const clearBtn = el('button', 'pa-btn', 'Clear');
let clearArmed = 0;
clearBtn.addEventListener('click', () => {
  if (Date.now() > clearArmed) {
    clearArmed = Date.now() + 4_000;
    clearBtn.textContent = 'Click again to clear';
    clearBtn.classList.add('is-armed');
    window.setTimeout(() => {
      if (clearArmed === 0) return;
      clearArmed = 0;
      clearBtn.textContent = 'Clear';
      clearBtn.classList.remove('is-armed');
    }, 4_000);
    return;
  }
  for (const key of Object.keys(vetoes)) delete vetoes[key];
  saveVetoes();
  for (const paint of painters) paint();
  clearArmed = 0;
  clearBtn.textContent = 'Cleared';
  clearBtn.classList.remove('is-armed');
  dump.style.display = 'none';
  window.setTimeout(() => (clearBtn.textContent = 'Clear'), 2_000);
});

const dump = el('textarea', 'pa-dump');
dump.style.display = 'none';
dump.rows = 8;

vetoBar.append(vetoCount, voicePick, copyBtn, clearBtn);
document.body.append(vetoBar, dump);

function exportVetoes(): string {
  const groups: Record<string, string> = {
    line: 'PA lines',
    product: 'Shelf cards',
    sign: 'Zone signs',
    receipt: 'Receipts'
  };
  const out = [`VETO LIST - Flatpak Skrapbo copy`, ``, `Voice: ${chosenVoice}`, ``];
  for (const [prefix, heading] of Object.entries(groups)) {
    const hits = Object.entries(vetoes).filter(([key]) => key.startsWith(`${prefix}:`));
    if (!hits.length) continue;
    out.push(`${heading} (${hits.length}):`);
    for (const [key, veto] of hits) {
      const id = key.slice(prefix.length + 1);
      out.push(`- ${id}: "${veto.label}"${veto.note ? ` -- ${veto.note}` : ''}`);
    }
    out.push('');
  }
  if (out.length === 4) out.push('Nothing vetoed. It is all fine, apparently.');
  return out.join('\n');
}

function updateVetoBar(): void {
  const n = Object.keys(vetoes).length;
  vetoCount.textContent = n === 0 ? 'Nothing vetoed yet' : `${n} vetoed`;
}

updateVetoBar();
