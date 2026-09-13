# Store PA voice: how to make the announcements

Research ticket: none (ad hoc request)  
Date: 2026-09-12

## Verdict

Use **pre-rendered audio files committed to `public/`**, generated either by a locally-run open-weights TTS (Piper or Kokoro) or recorded from a real human, then processed once, offline, into a "tannoy" bandpassed mono file. Play them through **raw Web Audio** on the sound context PlayCanvas already owns, and ship a **text caption** with every line.

Do **not** build the PA on the browser's `speechSynthesis`. It is the cheapest thing to write and the most expensive thing to art-direct: the voice inventory is whatever the player's operating system happens to have installed, so the same code sounds like a different character on every machine, and the API gives us no audio stream we can filter, duck, or mix. The creative requirement here — "a person who has not noticed anything is happening" — is a *performance* requirement, and performance has to be baked, not sampled from the user's OS.

## Options compared

| Option | Build cost | Bundle cost | Sounds like a bored human? | Consistent across machines? | Recommendation |
| --- | --- | --- | --- | --- | --- |
| **Web Speech `speechSynthesis`** | Lowest: ~30 lines. No assets. | Zero bytes. | Unreliable. Depends entirely on the installed voice. Default Windows/Android voices are exactly the robotic register we are told is wrong. | **No.** Voice list is per-device. | Debug/placeholder only, or an accessibility fallback. |
| **Pre-rendered TTS files (Piper / Kokoro, run locally)** | Medium: one offline generate-and-process script, run by hand. | ~9–24 KB per 3 s line (see sizing below). 40 lines ≈ 0.4–1 MB. | Yes, with voice choice + rate tuning. Neural TTS at a slow rate reads deadpan very well. | **Yes**, byte-identical everywhere. | **Default choice.** |
| **Recorded human voice (Dad/kids) + offline processing** | Medium: recording session, a little Audacity work per line. | Same as above. | Best of all, and free character work. Risk: a kid corpsing mid-take is a re-record, not a parameter change. | Yes. | **Best quality; pick it if the recording session is fun rather than a chore.** Mix and match with TTS per line. |
| **Paid cloud TTS (ElevenLabs etc.)** | Low-medium, plus an account and licence homework. | Same as above. | Very good. | Yes. | Only if the free/open options are auditioned and rejected. Licence caveats below. |

## 1. Web Speech API `speechSynthesis`

### Does it work on a static GitHub Pages site?

Yes. `speechSynthesis` is a pure client-side API; nothing about it needs a backend, and the whole Web Speech spec is a browser API layered over the platform's own synthesis engine. Note that the *voices themselves* may be remote: `SpeechSynthesisVoice.localService` exists specifically "to allow differentiation in the case that some voice options are provided by a remote service; it is possible that remote voices might have extra latency, bandwidth or cost associated with them". ([MDN: `localService`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService)) Chrome's default English voices are network-backed Google voices, so a PA built this way can go silent on a flaky connection even though our own hosting is static.

### Cross-browser support

MDN's compatibility data for `SpeechSynthesis` records support from Chrome 33, Edge 14, Firefox 49, Safari 7, Opera 21, Firefox for Android 62, and Samsung Internet 3.0 — but **`webview_android: false`** (tracked as [crbug 40417848](https://crbug.com/40417848)) and **`opera_android: false`**. ([mdn/browser-compat-data `api/SpeechSynthesis.json`](https://github.com/mdn/browser-compat-data/blob/main/api/SpeechSynthesis.json)) Practically: fine on desktop Chrome/Edge/Firefox/Safari and on mobile Safari/Chrome, absent in Android WebView wrappers.

### Does it need a user gesture?

Yes, in Chrome, and it fails *quietly into an error event* rather than throwing. Blink gates `speak()` behind the document's autoplay policy:

```cpp
if (!IsAllowedToStartByAutoplay()) {
  Deprecation::CountDeprecation(
      GetSupplementable(), WebFeature::kTextToSpeech_SpeakDisallowedByAutoplay);
  FireErrorEvent(utterance, 0 /* char_index */,
                 V8SpeechSynthesisErrorCode::Enum::kNotAllowed);
  return;
}
// ...
bool SpeechSynthesis::IsAllowedToStartByAutoplay() const {
  // ...
  if (AutoplayPolicy::GetAutoplayPolicyForDocument(*document) !=
      AutoplayPolicy::Type::kDocumentUserActivationRequired) {
    return true;
  }
  return AutoplayPolicy::IsDocumentAllowedToPlay(*document);
}
```

([Chromium `third_party/blink/renderer/modules/speech/speech_synthesis.cc`](https://chromium.googlesource.com/chromium/src/+/main/third_party/blink/renderer/modules/speech/speech_synthesis.cc)) The `not-allowed` value is a documented `SpeechSynthesisErrorEvent.error` code. ([MDN: `SpeechSynthesisErrorEvent.error`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisErrorEvent/error)) This is the same class of restriction as the general autoplay policy: audible playback started without user interaction is generally blocked. ([MDN: Autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)) For us this is *not* a real blocker — our game already requires a click to enter pointer lock — but it means the PA must never fire before that first click.

### Voice selection and the `getVoices()` quirk

`getVoices()` "returns a list of `SpeechSynthesisVoice` objects representing all the available voices **on the current device**". ([MDN: `getVoices()`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices)) MDN's own sample carries the warning inline:

```js
// in Google Chrome the voices are not ready on page load
if ("onvoiceschanged" in synth) {
  synth.onvoiceschanged = loadVoices;
} else {
  loadVoices();
}
```

([MDN: `SpeechSynthesisUtterance`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance)) So the first synchronous call commonly returns `[]`, and you must re-read on `voiceschanged`.

**This is the killer point for our creative brief.** There is no standard voice that we can request by name and rely on. The voice list is a property of the player's machine: macOS ships the Apple system voices, Windows ships Microsoft's, Chrome adds network Google voices, Linux may ship only eSpeak. Code that picks `voices[0]`, or filters by `lang === "en-GB"` and takes the first hit, will produce a different performer per computer — and on a bare Windows/Linux box will land squarely on the robotic register the brief rules out. We can select by `voice.name`, but any specific name is a gamble on that machine having it, and `voice-unavailable` / `language-unavailable` are documented error codes for exactly that failure. ([MDN: `SpeechSynthesisErrorEvent.error`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisErrorEvent/error))

### Can rate/pitch be tuned toward "calm"?

Partly. `rate` ranges 0.1–10 (default 1) and `pitch` ranges 0–2 (default 1), and MDN notes that "some speech synthesis engines or voices may constrain the minimum and maximum rates further". ([MDN: `rate`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/rate), [MDN: `pitch`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/pitch)) Something like `rate = 0.85, pitch = 0.95` genuinely does read more bored. But this is a two-knob mixing desk on top of an instrument we did not choose, and the knobs behave differently per engine.

### Interaction with Web Audio / game audio

This is the second structural problem. Scanning the Web Speech spec's `SpeechSynthesis` interface, there is **no output stream, `AudioNode`, `MediaStreamTrack`, or destination selector** — `speak()`, `cancel()`, `pause()`, `resume()`, `getVoices()`, and the utterance's `volume`/`rate`/`pitch`/`voice`/`lang` are the whole surface. ([Web Speech API spec](https://webaudio.github.io/web-speech-api/)) Consequences:

- We cannot run the tannoy bandpass/compression chain over it. The PA would be clean studio speech sitting on top of a filtered game mix — wrong texture, and the exact opposite of the brief.
- We cannot duck the rest of the mix against it by routing, only by manually ramping our own gain nodes on `start`/`end` events.
- Playback lives outside the `AudioContext` the game already runs (`ammo-feel.ts:581-640` creates one directly), so it is not suspended/resumed with the rest of the audio.

### Other known gotchas

- Utterances **queue**; `speak()` "adds an utterance to the utterance queue; it will be spoken when any other utterances queued before it have been spoken". ([MDN: `speak()`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/speak)) For a PA that interrupts itself, you must `cancel()` first — MDN's own rate example does exactly `if (synth.speaking) synth.cancel();`.
- `cancel()` fires `canceled`/`interrupted` error events, so error handlers must not treat those as failures.
- Widely reported (but **not verified here from a primary source**): long utterances cut off after ~15 seconds in desktop Chrome unless periodically `pause()`/`resume()`d, and a page unload can leave speech running. Our lines are short, so this is mostly moot — flagging it rather than asserting it.

**Where `speechSynthesis` still earns its place:** as a zero-asset placeholder while lines are being written, and optionally as an accessibility "read the caption aloud" toggle. Not as the shipped PA.

## 2. Pre-rendered audio files

### Sizing: what does 20–40 lines actually cost?

These are **arithmetic estimates from target bitrates, not measured encodes** (no `ffmpeg` on this machine at time of writing). Speech, mono, one ~3-second line:

| Encoding | Bitrate | ~3 s line | 20 lines | 40 lines |
| --- | --- | --- | --- | --- |
| Opus (WebM/Ogg), mono speech | 24 kbps | ~9 KB | ~180 KB | ~360 KB |
| Opus, comfortable | 32 kbps | ~12 KB | ~240 KB | ~480 KB |
| MP3, mono | 64 kbps | ~24 KB | ~480 KB | ~960 KB |
| MP3, mono, lean | 48 kbps | ~18 KB | ~360 KB | ~720 KB |

Opus is specified for 6–510 kbps and is explicitly good at "low-complexity audio such as speech". ([MDN: Audio codec guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs)) Even the worst row here is under 1 MB, against a GitHub Pages recommended source-repo limit of 1 GB, a published-site limit of 1 GB, and a *soft* 100 GB/month bandwidth limit. ([GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)) **Bundle size is a non-issue at this scale.** Since the PA is bandpassed to a tannoy anyway, we are throwing away the top and bottom of the spectrum before encoding, so low bitrates cost us nothing audible.

**Codec caveat:** MDN records Opus support in Chrome 33 / Edge 14 / Firefox 15 / Opera 20 / Safari 11, but adds that "Safari supports Opus in the `<audio>` element **only when packaged in a CAF file**, and only on macOS High Sierra (10.13) or iOS 11". ([MDN: Audio codec guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats/Audio_codecs)) I have **not verified** whether Safari's `decodeAudioData()` (which is the path PlayCanvas/Web Audio actually uses, not `<audio>`) accepts Ogg/WebM Opus. Given that uncertainty and the trivial size difference, **ship MP3** for safety, or ship MP3 with Opus as a progressive enhancement.

### Free/cheap sources of a natural, non-robotic English voice

**Piper** — a "fast and local neural text-to-speech engine". Run it on a laptop, no account, no per-character cost, no network at runtime. ([piper1-gpl README](https://github.com/OHF-Voice/piper1-gpl)) Licence picture, which needs care:

- The current engine repo `OHF-Voice/piper1-gpl` is **GPL-3.0** (per the GitHub API licence field for that repo); the older `rhasspy/piper` repo was **MIT** and now redirects to the new one. The GPL applies to distributing *the engine*, which we would not do — we run it offline and commit only WAV/MP3 output. I am **not a lawyer**; flagged as my reading, not a verified legal conclusion.
- The **voice models** are the part whose licence actually travels with the audio. `rhasspy/piper-voices` on Hugging Face is tagged `license: mit`, and each voice ships a `MODEL_CARD` naming its training dataset and licence. ([piper-voices](https://huggingface.co/rhasspy/piper-voices))
  - `en_GB/alba/medium`: dataset <https://datashare.ed.ac.uk/handle/10283/3270>, licence **CC BY 4.0**. ([MODEL_CARD](https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_GB/alba/medium/MODEL_CARD)) → usable in a public hobby game with attribution. **This is the cleanest licence story of the voices I checked.**
  - `en_US/lessac/medium`: Blizzard 2013 Lessac dataset, licence at the CSTR project page — **not read in full here**, so treat as unverified.
  - `en_GB/jenny_dioco/medium`: model card says only "License: See URL", i.e. deliberately unresolved. Avoid unless someone reads the dataset terms.

**Kokoro-82M** — "an open-weight TTS model with 82 million parameters… With Apache-licensed weights, Kokoro can be deployed anywhere from production environments to personal projects", and the model page explicitly states "This is an Apache-licensed model… We welcome the deployment of the model in real use cases." ([Kokoro-82M model card](https://huggingface.co/hexgrad/Kokoro-82M)) 54 voices across 8 languages in v1.0. **Apache-2.0 on the weights is the most permissive verified licence found**, and quality is generally a step above Piper. Costs a Python/Colab run.

**Amazon Polly** — the AWS Service Terms say plainly: "**The output that you generate using AI Services is Your Content**", and Polly is listed as an AI Service. ([AWS Service Terms §50.1–50.2](https://aws.amazon.com/service-terms/)) That is a clear, verified statement that generated audio is ours to ship. Note §50.3: AWS may use content processed by Polly to improve the service unless you opt out — irrelevant for "Please do not throw the merchandise", but worth knowing. Free-tier character allowances exist but **I did not verify current figures**; check the Polly pricing page before relying on them.

**ElevenLabs** — best-sounding of the lot, and the licence is the one to be careful with. The Terms of Service state: "if you access or use our Services free of charge (such a user, a '**Free User**'), you may only use the Services for **non-commercial purposes**; (ii) if you access or use our Services through a paid subscription plan… you may use the Services for commercial purposes". ([ElevenLabs Terms of Service](https://elevenlabs.io/terms-of-use), Use Restrictions) A free, non-monetised hobby game on GitHub Pages is plausibly non-commercial, but "plausibly" is doing work there, and I could **not locate an explicit attribution clause** in the ToS text (the widely-repeated "free tier requires attribution" claim is **unverified** — it may live in a help-centre article rather than the ToS). If we use ElevenLabs, take the cheapest paid month, generate the lines, cancel, and keep the receipt.

**Google Cloud Text-to-Speech / Azure Speech** — both have free tiers and good neural voices, but their pricing/terms pages are JavaScript-rendered and I could not extract a quotable ownership clause. **Unverified; not recommended over Polly**, whose terms are quotable.

**Not recommended:** eSpeak-NG (the classic robot — wrong brief), Coqui XTTS (the model weights are under a non-commercial licence last I knew — **unverified**, and the project is archived).

## 3. Recording a real human

**Yes, this is a credible cheap path — arguably the best one.** The brief is a *performance* note, and a bored adult reading "Please do not throw the merchandise" flatly, in one take, on a phone, in a quiet room, beats any amount of TTS parameter tuning. The whole point of the tannoy chain is that it destroys fidelity anyway: once you've bandpassed to roughly 400 Hz–3.5 kHz and squashed the dynamics, a phone voice memo and a studio mic converge.

Capture options, cheapest first:

1. **Phone voice memo**, held slightly off-axis about a hand's width away, in a room with soft furnishings. Export, trim in Audacity (free, open source — <https://www.audacityteam.org/>).
2. **Browser capture** via `MediaRecorder` + `getUserMedia`, if we ever want an in-repo recording page. ([MDN: `MediaRecorder`](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)) Adds a permission prompt and no real quality win over a phone. Not worth it for a one-off session.

**Direction notes for the session** (the actual hard part): no rising intonation, no emphasis on the noun, a beat of silence before and after, read it like the fourteenth time today. Record three takes of each line and pick the flattest. A single dull two-note PA chime in front of each line does more for the "store PA" read than any processing.

### The tannoy chain in Web Audio terms

Apply this **offline, once, per line**, and commit the processed file — that keeps runtime cost at zero and makes the result identical everywhere. The same graph is what you'd build live, so prototype it live and then bake it.

```ts
// ctx: the AudioContext the game already owns.
// source -> highpass -> lowpass -> peaking (presence) -> compressor -> drive -> reverb mix -> out
function buildTannoyChain(ctx: AudioContext) {
  const input = ctx.createGain();

  // 1. Bandpass, built as highpass + lowpass so each edge is tunable
  //    independently. (A single `bandpass` biquad also works; two shelves
  //    give more control over the skirt.)
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';          // kill chest/body
  hp.frequency.value = 400;
  hp.Q.value = 0.7;

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';           // kill air/sibilance sparkle
  lp.frequency.value = 3500;
  lp.Q.value = 0.7;

  // 2. Presence bump: the honky midrange resonance of a cheap ceiling horn.
  const horn = ctx.createBiquadFilter();
  horn.type = 'peaking';
  horn.frequency.value = 1800;
  horn.Q.value = 1.4;
  horn.gain.value = 6;           // dB

  // 3. Compression: flattens the delivery, which reads as "bored" and also
  //    keeps it audible on tinny monitor speakers.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -28;    // dB
  comp.knee.value = 6;
  comp.ratio.value = 6;
  comp.attack.value = 0.004;     // seconds
  comp.release.value = 0.18;

  // 4. Optional: a whisper of drive for amp grit. Keep it subtle.
  const drive = ctx.createWaveShaper();
  drive.curve = makeSoftClipCurve(1.6);
  drive.oversample = '2x';

  // 5. Reverb: small, short, mostly dry. A big hall reads as "cathedral",
  //    not "showroom". ~0.6-1.2 s impulse, wet around 12-18%.
  const convolver = ctx.createConvolver();   // convolver.buffer = <impulse>
  const wet = ctx.createGain();  wet.gain.value = 0.15;
  const dry = ctx.createGain();  dry.gain.value = 0.85;

  const out = ctx.createGain();
  out.gain.value = 0.9;

  input.connect(hp); hp.connect(lp); lp.connect(horn);
  horn.connect(comp); comp.connect(drive);
  drive.connect(dry); dry.connect(out);
  drive.connect(convolver); convolver.connect(wet); wet.connect(out);

  return { input, out };
}
```

Why each node is the right one, from the specs:

- `BiquadFilterNode` `highpass`/`lowpass` are "standard second-order resonant" filters with 12 dB/octave rolloff; `bandpass` attenuates outside the range with `Q` controlling band width; `peaking` boosts/attenuates inside a range with `frequency` as the middle and `gain` in dB. ([MDN: `BiquadFilterNode.type`](https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode/type))
- `DynamicsCompressorNode` "lowers the volume of the loudest parts of a signal", with `threshold` (dB above which compression starts), `knee` (dB of smooth transition), `ratio` (dB of input change per 1 dB of output change), `attack` and `release` (seconds to reduce/increase gain by 10 dB). ([MDN: `DynamicsCompressorNode`](https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode))
- `ConvolverNode` "performs a Linear Convolution on a given `AudioBuffer`, often used to achieve a reverb effect", taking a mono/stereo/4-channel impulse response. ([MDN: `ConvolverNode`](https://developer.mozilla.org/en-US/docs/Web/API/ConvolverNode)) We'd need a short impulse-response WAV; if we don't want to source one, substitute two short `DelayNode` taps with feedback — cheaper and nobody will notice through a bandpass.
- `WaveShaperNode` applies a shaping curve for non-linear distortion. ([MDN: `WaveShaperNode`](https://developer.mozilla.org/en-US/docs/Web/API/WaveShaperNode))

**The equivalent offline path in Audacity**, if we'd rather not code it: High-Pass Filter 400 Hz → Low-Pass Filter 3500 Hz → Filter Curve/Bass and Treble for the presence bump → Compressor → Reverb (small room, low wet) → Amplify/Normalize → Export as mono MP3. Same result, no code, and easy for a kid to do.

**Reference-target note:** mix and audition on the small tinny monitor speakers, not headphones. A chain tuned on headphones will disappear on the target; a chain tuned on the target will sound harsh on headphones, which is the correct trade here.

## 4. PlayCanvas `sound` component vs raw Web Audio

**Recommendation: raw Web Audio, on PlayCanvas's `AudioContext`.**

Reasoning, from the engine source:

- The PA is store-wide and non-positional, so none of the `sound` component's positional machinery (`refDistance`, `maxDistance`, `distanceModel`, `rollOffFactor`) applies — those properties are documented as "Positional only". ([PlayCanvas sound component docs](https://developer.playcanvas.com/user-manual/editor/scenes/components/sound/)) Positional *would* be easy if we ever wanted it (`entity.addComponent('sound', { positional: true })`, plus an entity carrying an `AudioListenerComponent`; see [`src/framework/components/sound/component.js`](https://github.com/playcanvas/engine/blob/main/src/framework/components/sound/component.js)) — for instance if a specific ceiling speaker should be louder near the checkout. Not needed now.
- The component's real value for us is slot management, asset loading, `play`/`pause`/`resume`/`stop`/`end` events, and — the interesting one — `SoundInstance.setExternalNodes(firstNode, lastNode)`, which splices an external Web Audio graph into the signal path: "source → inputNode → connectorNode → [firstNode → … → lastNode] → speakers", with the documented example building `createWaveShaper()` and `createBiquadFilter()` off `app.systems.sound.context`. ([`src/platform/sound/instance.js`](https://github.com/playcanvas/engine/blob/main/src/platform/sound/instance.js), `setExternalNodes`) So if we *did* want the tannoy chain live at runtime, the component supports it cleanly.
- **Either way, use `app.soundManager.context` as the one `AudioContext`.** `SoundManager` lazily creates the context and, if its state is not `running`, registers unlock listeners for `['click', 'touchstart', 'mousedown']` to resume it — i.e. it already solves the autoplay-unlock problem for us. It also exposes a global `volume` in [0, 1] that all `SoundInstance`s scale against, plus `suspend()`/`resume()`. ([`src/platform/sound/manager.js`](https://github.com/playcanvas/engine/blob/main/src/platform/sound/manager.js)) Today `ammo-feel.ts:581-640` constructs its own `new AudioContext()`; consolidating onto the manager's context is a small cleanup that buys us one unlock path, one master volume, and one suspend.

So: `fetch()` → `decodeAudioData()` → `AudioBufferSourceNode` → a shared `paBus` gain → destination, all on `app.soundManager.context`. About fifteen lines, no asset-registry ceremony, and it is trivially easy to duck the rest of the mix by ramping other buses while `paBus` is active. Reach for the `sound` component only when we want positional PA speakers or slot-based asset management.

Asset-pipeline note: PlayCanvas loads audio through `AudioHandler` → `AudioParser` into a `Sound` resource ([`src/framework/handlers/audio.js`](https://github.com/playcanvas/engine/blob/main/src/framework/handlers/audio.js)), and the Editor docs list the supported audio asset types ([PlayCanvas audio asset docs](https://developer.playcanvas.com/user-manual/editor/assets/inspectors/audio/)). With Vite, putting the files under `public/audio/pa/` keeps URLs stable and avoids hashing surprises.

## 5. Captions

Do this regardless of which audio option wins. On tinny monitor speakers, bandpassed, with a store ambience under it, the words *will* be lost — and half the joke is in the words.

**Recommended: a plain DOM caption line driven from the same data as the audio.** Keep lines in one table so text and audio cannot drift:

```ts
type PaLine = { id: string; text: string; file: string; durationMs: number };

const PA_LINES: PaLine[] = [
  { id: 'no-throwing', text: 'Please do not throw the merchandise.',
    file: 'audio/pa/no-throwing.mp3', durationMs: 3100 },
  // ...
];
```

Render the caption into a styled overlay element for `durationMs` (or on the buffer source's `ended` event, which is exact). Style it like a subtitle: high contrast, generous size, bottom-centre, safe margins — it should read fine on a laptop screen at arm's length.

Mark the container as an ARIA live region so assistive technology announces new lines without moving focus. ([MDN: ARIA live regions](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions))

```html
<div id="pa-caption" aria-live="polite" aria-atomic="true"></div>
```

Use `aria-live="polite"`, not `assertive` — the PA is ambient flavour, not an alert.

**Alternatives considered:** WebVTT via `<track>` on an `<audio>` element is the standards-blessed route, but it forces the PA onto media elements instead of Web Audio (losing the shared context, the bus, and the ducking) and buys us nothing for one-line-at-a-time captions. Rendering captions into the 3D scene as a texture is more diegetic (an LED display board over the checkout!) but costs real work — a nice stretch goal, not the first implementation.

**Bonus:** because captions exist, the game gets a free accessibility win, a free "PA lines seen" collectible list if we ever want one, and a lightweight debug mode where captions display without audio.

## Recommendation

**Default: pre-rendered audio files, processed offline, played through raw Web Audio on `app.soundManager.context`, with a DOM caption for every line.**

Concretely, in the order I'd do it:

1. Write the lines into a `PA_LINES` table with captions **first**, and wire the caption overlay with `speechSynthesis` as a throwaway placeholder so the timing and comedy can be playtested today.
2. Book twenty minutes with Dad and a phone. Record every line flat, three takes each. This is the highest quality-per-effort step available and it is the one most likely to make the kids laugh.
3. Fall back to **Kokoro-82M** (Apache-2.0 weights, verified) or **Piper with the `en_GB/alba` voice** (CC BY 4.0 dataset, verified — credit it in the README) for any line that the recording session doesn't cover, or if the session doesn't happen.
4. Process everything through the bandpass → presence → compressor → small-reverb chain, offline, auditioned on the actual small monitor speakers. Export mono MP3 at 48–64 kbps into `public/audio/pa/`. Budget well under 1 MB for 40 lines.
5. Delete the `speechSynthesis` placeholder, or demote it to an accessibility "speak the caption" toggle.

**When the alternative wins:**

- **`speechSynthesis` wins** if the PA needs to say something *dynamic* that cannot be pre-written — the player's own name, a live score, a procedurally generated product name. Pre-rendered clips cannot do that, and no amount of clip-splicing will sound natural. If that requirement appears, accept the machine-dependent voice, or split the difference: pre-render the fixed carrier phrase and let TTS say only the variable word.
- **Paid cloud TTS (ElevenLabs/Polly) wins** if we end up wanting many dozens of lines, frequent rewrites, or several distinct PA characters, and nobody wants to re-record every time a line changes. Polly has the cleanest verifiable terms ("The output that you generate using AI Services is Your Content"); ElevenLabs sounds the best but its free tier is explicitly non-commercial only, so budget for one paid month rather than arguing about whether a hobby game counts.
- **PlayCanvas's `sound` component wins** over raw Web Audio the moment we want the PA to come from specific ceiling speakers in the showroom, since positional falloff, the listener, and slot management all come for free.

### Flagged as unverified

- Whether Safari's `decodeAudioData()` accepts Ogg/WebM Opus (MDN's Opus/CAF caveat is about `<audio>`). Mitigated by defaulting to MP3.
- The ~15-second Chrome `speechSynthesis` cutoff and the `pause()`/`resume()` workaround — widely reported, no primary source read.
- Current Amazon Polly, Google Cloud TTS, and Azure Speech free-tier character allowances; Google/Azure content-ownership terms (pages are JS-rendered).
- Whether ElevenLabs' free tier carries an attribution requirement (not found in the ToS text).
- Full terms of the Blizzard 2013 Lessac dataset behind the `en_US/lessac` Piper voice.
- All file sizes in this document are arithmetic from target bitrates, not measured encodes.
