/**
 * Fetches the PA rendering toolchain into tools/ (gitignored): Piper, two en_GB voices and
 * ffmpeg. About 380MB, none of which belongs in the repo or in CI - the rendered mp3s are
 * committed instead, so the deploy never needs any of this.
 *
 * Windows only for now, which is what the playtest machine runs. The download URLs below
 * are the only platform-specific part if that ever changes.
 *
 *   npm run pa:setup
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, rmSync, renameSync, cpSync, createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tools = join(root, 'tools');

const PIPER = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip';
const FFMPEG = 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip';
const VOICES = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB';
const voiceNames = ['alba', 'jenny_dioco'];

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

mkdirSync(tools, { recursive: true });

if (existsSync(join(tools, 'piper', 'piper.exe'))) {
  console.log('piper    already present');
} else {
  console.log('piper    downloading...');
  const zip = join(tools, 'piper.zip');
  await download(PIPER, zip);
  execFileSync('tar', ['-xf', zip, '-C', tools]);
  rmSync(zip, { force: true });
  console.log('piper    ok');
}

if (existsSync(join(tools, 'ffmpeg', 'ffmpeg.exe'))) {
  console.log('ffmpeg   already present');
} else {
  console.log('ffmpeg   downloading...');
  const zip = join(tools, 'ffmpeg.zip');
  await download(FFMPEG, zip);
  execFileSync('tar', ['-xf', zip, '-C', tools]);
  const extracted = join(tools, 'ffmpeg-master-latest-win64-gpl');
  mkdirSync(join(tools, 'ffmpeg'), { recursive: true });
  cpSync(join(extracted, 'bin', 'ffmpeg.exe'), join(tools, 'ffmpeg', 'ffmpeg.exe'));
  rmSync(extracted, { recursive: true, force: true });
  rmSync(zip, { force: true });
  console.log('ffmpeg   ok');
}

const voicesDir = join(tools, 'voices');
mkdirSync(voicesDir, { recursive: true });
for (const voice of voiceNames) {
  for (const ext of ['onnx', 'onnx.json']) {
    const file = `en_GB-${voice}-medium.${ext}`;
    const dest = join(voicesDir, file);
    if (existsSync(dest)) {
      console.log(`voice    ${file} already present`);
      continue;
    }
    console.log(`voice    ${file} downloading...`);
    const tmp = `${dest}.part`;
    await download(`${VOICES}/${voice}/medium/${file}`, tmp);
    renameSync(tmp, dest);
  }
}

console.log('\nReady. Next: npm run pa:render');
