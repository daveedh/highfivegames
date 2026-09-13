/**
 * Renders every PA line in src/copy.ts to a committed mp3.
 *
 * The store's voice is synthetic on purpose: a machine cannot corpse, so "bored" is free
 * and stays identical across forty-eight lines. Piper is a neural voice, not the flat
 * robot speechSynthesis gives you - see docs/research/pa-voice.md for why that was ruled out.
 *
 * The tannoy chain is baked in here rather than applied live in Web Audio: nothing needs to
 * change the effect at runtime, so the game just plays a file.
 *
 * Tools live in tools/ and are gitignored, so CI and the deploy never see them.
 *   npm run pa:setup     download piper, the voices and ffmpeg
 *   npm run pa:render    render everything that is missing
 *   npm run pa:render -- --force --voice jenny_dioco
 *   npm run pa:audition  render a few sample lines in every voice, for picking by ear
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { paLines } from '../src/copy.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const piper = join(root, 'tools', 'piper', 'piper.exe');
const ffmpeg = join(root, 'tools', 'ffmpeg', 'ffmpeg.exe');
const voicesDir = join(root, 'tools', 'voices');

/**
 * Bored is a render setting as well as a writing rule. A longer length_scale slows her down;
 * low noise and noise_w flatten the prosody so sentences stop lilting upward at the end.
 */
const delivery = { lengthScale: 1.18, noiseScale: 0.45, noiseW: 0.55, sentenceSilence: 0.35 };

/** Ceiling speaker: band-limited, squashed flat, a little room behind it. */
const tannoy = [
  'highpass=f=400',
  'lowpass=f=3500',
  'equalizer=f=1800:t=q:w=1.2:g=6',
  'acompressor=threshold=-28dB:ratio=6:attack=5:release=120',
  'aecho=0.8:0.85:40:0.12',
  'loudnorm=I=-16:TP=-1.5:LRA=11',
  'alimiter=limit=0.95'
].join(',');

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

function voicePath(voice) {
  const model = join(voicesDir, `en_GB-${voice}-medium.onnx`);
  if (!existsSync(model)) {
    throw new Error(`Missing voice ${voice}. Run: npm run pa:setup`);
  }
  return model;
}

function render(text, outMp3, voice) {
  const wav = `${outMp3}.wav`;
  execFileSync(piper, [
    '--model', voicePath(voice),
    '--output_file', wav,
    '--length_scale', String(delivery.lengthScale),
    '--noise_scale', String(delivery.noiseScale),
    '--noise_w', String(delivery.noiseW),
    '--sentence_silence', String(delivery.sentenceSilence)
  ], { input: text, stdio: ['pipe', 'ignore', 'ignore'] });

  execFileSync(ffmpeg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', wav,
    '-af', tannoy,
    '-ac', '1', '-ar', '22050', '-b:a', '48k',
    outMp3
  ]);
  rmSync(wav, { force: true });
}

for (const tool of [piper, ffmpeg]) {
  if (!existsSync(tool)) {
    console.error(`Missing ${tool}\nRun: npm run pa:setup`);
    process.exit(1);
  }
}

if (flag('audition')) {
  // Three lines that show the range: the signature one, a loaded one, and a flat one.
  const sampleIds = ['generic-1', 'bedrooms-4', 'generic-5'];
  const outDir = join(root, 'public', 'assets', 'audio', 'pa-audition');
  mkdirSync(outDir, { recursive: true });
  for (const voice of ['alba', 'jenny_dioco']) {
    for (const id of sampleIds) {
      const line = paLines.find((l) => l.id === id);
      render(line.text, join(outDir, `${voice}-${id}.mp3`), voice);
      console.log(`audition  ${voice.padEnd(12)} ${line.text}`);
    }
  }
  console.log('\nListen, then pick a voice.');
  process.exit(0);
}

const voice = value('voice', 'alba');
const outDir = join(root, 'public', 'assets', 'audio', 'pa');
mkdirSync(outDir, { recursive: true });

let rendered = 0;
let skipped = 0;
for (const line of paLines) {
  const out = join(outDir, `${line.id}.mp3`);
  if (existsSync(out) && !flag('force')) {
    skipped += 1;
    continue;
  }
  render(line.text, out, voice);
  rendered += 1;
  console.log(`${line.id.padEnd(12)} ${line.text}`);
}
console.log(`\n${rendered} rendered, ${skipped} already present, voice ${voice}.`);
