# PlayCanvas engine-only setup research

Ticket: #4, "Research: engine-only PlayCanvas project setup"  
Date: 2026-09-11

## Short recommendation

Use an engine-only TypeScript/Vite app, not the PlayCanvas Editor. The only runtime dependency needed for the proof of concept is `playcanvas`; use Vite for the hot-reload dev server and static production build. As of this research, npm reports `playcanvas@2.22.2` as latest, with ESM exports and bundled TypeScript declarations (`build/playcanvas.d.ts`) ([npm registry](https://registry.npmjs.org/playcanvas/latest)). The official PlayCanvas docs say the engine is published on npm, ships with full TypeScript declarations, and can be used directly without the Editor ([PlayCanvas Engine docs](https://developer.playcanvas.com/user-manual/engine/)).

The fastest path is either:

```bash
npm create playcanvas@latest highfivegames -- -f engine
```

or hand-create the small skeleton below. The official standalone docs recommend that `create-playcanvas` command for a Vite + TypeScript engine project ([standalone docs](https://developer.playcanvas.com/user-manual/engine/standalone/)), and npm reports `create-playcanvas@0.8.0` as latest ([npm registry](https://registry.npmjs.org/create-playcanvas/latest)). Because this repo already exists, I recommend copying the skeleton rather than scaffolding into a new directory.

## Verified package versions

| Package | Use | Version evidence | Recommendation |
| --- | --- | --- | --- |
| `playcanvas` | 3D engine runtime | npm latest is `2.22.2`; package is ESM and declares `types: build/playcanvas.d.ts` ([npm registry](https://registry.npmjs.org/playcanvas/latest)) | dependency: `^2.22.2` |
| `vite` | dev server, HMR, static production build | npm latest is `8.3.0`; package describes itself as a dev server/build tool and requires Node `^20.19.0 || >=22.12.0` ([npm registry](https://registry.npmjs.org/vite/latest)) | devDependency: `^8.3.0` |
| `typescript` | type checking | npm latest is `7.0.2` ([npm registry](https://registry.npmjs.org/typescript/latest)); official PlayCanvas template currently uses `~6.0.3` ([template package.json](https://raw.githubusercontent.com/playcanvas/create-playcanvas/main/templates/engine/base/package.json)) | devDependency: `~6.0.3` initially to match the official template; upgrade later if needed |
| `create-playcanvas` | optional scaffolder | npm latest is `0.8.0` ([npm registry](https://registry.npmjs.org/create-playcanvas/latest)) and official docs recommend it with `-f engine` ([standalone docs](https://developer.playcanvas.com/user-manual/engine/standalone/)) | do not add as a dependency |

The official current engine template also includes ESLint/Prettier scripts and pins `playcanvas: ^2.22.0`, `vite: ^8.2.2`, and `typescript: ~6.0.3` ([template package.json](https://raw.githubusercontent.com/playcanvas/create-playcanvas/main/templates/engine/base/package.json)). For a kids-and-dad POC, the minimal skeleton below omits linting until the first real code pass.

## Recommended repo layout

```text
highfivegames/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  public/
    assets/
      models/
      textures/
      audio/
  src/
    main.ts
    style.css
    vite-env.d.ts
```

Why this shape:

- The official PlayCanvas engine scaffold uses root `index.html`, `package.json`, `tsconfig.json`, and `src/main.ts` ([template package.json](https://raw.githubusercontent.com/playcanvas/create-playcanvas/main/templates/engine/base/package.json), [template tsconfig](https://raw.githubusercontent.com/playcanvas/create-playcanvas/main/templates/engine/base/tsconfig.json), [spinning-cube main.ts](https://raw.githubusercontent.com/playcanvas/create-playcanvas/main/templates/engine/spinning-cube/src/main.ts)).
- Put runtime-ready static files in `public/assets/...` so Vite copies them to the production build unchanged and code can refer to them with `import.meta.env.BASE_URL`.
- Use `vite.config.ts` with `base: './'` for a GitHub Pages build that also works when previewed from a subdirectory. If later deploying to a fixed project page at `https://daveedh.github.io/highfivegames/`, `base: '/highfivegames/'` is also valid.

## Copy-pasteable skeleton

### `package.json`

```json
{
  "name": "highfivegames",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "playcanvas": "^2.22.2"
  },
  "devDependencies": {
    "typescript": "~6.0.3",
    "vite": "^8.3.0"
  },
  "engines": {
    "node": ">=22.23.2"
  }
}
```

The Node engine matches the official `create-playcanvas` template's current requirement ([template package.json](https://raw.githubusercontent.com/playcanvas/create-playcanvas/main/templates/engine/base/package.json)). Vite itself requires Node `^20.19.0 || >=22.12.0` ([Vite npm metadata](https://registry.npmjs.org/vite/latest)).

### `vite.config.ts`

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173
  }
});
```

### `index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>High Five Games</title>
  </head>
  <body>
    <canvas id="application-canvas"></canvas>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

### `src/style.css`

```css
html,
body {
  margin: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #111827;
}

#application-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
```

### `src/vite-env.d.ts`

```ts
/// <reference types="vite/client" />
```

### `src/main.ts`

This intentionally uses `pc.Application` because it is the simplest API shown in the official standalone docs, but it uses the current `render` component instead of the deprecated `model` component.

```ts
import * as pc from 'playcanvas';
import './style.css';

const canvas = document.getElementById('application-canvas');

if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Expected #application-canvas to be a canvas element');
}

const app = new pc.Application(canvas);
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);
app.start();

const resize = () => app.resizeCanvas();
window.addEventListener('resize', resize);
app.on('destroy', () => window.removeEventListener('resize', resize));

const box = new pc.Entity('flat-pack-box');
box.addComponent('render', {
  type: 'box'
});
box.setLocalScale(1, 1, 1);
app.root.addChild(box);

const camera = new pc.Entity('camera');
camera.addComponent('camera', {
  clearColor: new pc.Color(0.08, 0.1, 0.16)
});
camera.setPosition(0, 1.25, 4);
camera.lookAt(0, 0, 0);
app.root.addChild(camera);

const light = new pc.Entity('sun');
light.addComponent('light', {
  type: 'directional',
  intensity: 2
});
light.setEulerAngles(45, 35, 0);
app.root.addChild(light);

app.on('update', (dt: number) => {
  box.rotate(0, 45 * dt, 0);
});
```

### `tsconfig.json`

This is a minimal version of the official template's TypeScript setup, which uses DOM libs, `moduleResolution: "bundler"`, and `strict: true` ([template tsconfig](https://raw.githubusercontent.com/playcanvas/create-playcanvas/main/templates/engine/base/tsconfig.json)).

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

## Bootstrapping choices: `Application` vs `AppBase`

There are two valid patterns in current first-party sources:

1. **Simple `pc.Application(canvas)`**: official standalone docs show importing `playcanvas`, finding a canvas, constructing `new pc.Application(canvas)`, setting fill mode/resolution, and calling `app.start()` ([standalone docs](https://developer.playcanvas.com/user-manual/engine/standalone/)). This is the best first POC pattern.
2. **Explicit `AppBase` + `createGraphicsDevice`**: the current official `create-playcanvas` spinning-cube template imports `AppBase`, `AppOptions`, component systems, resource handlers, and `createGraphicsDevice`, then calls `app.init(createOptions)` before `app.start()` ([template main.ts](https://raw.githubusercontent.com/playcanvas/create-playcanvas/main/templates/engine/spinning-cube/src/main.ts)). This is more verbose but gives explicit control over component systems and asset handlers.

Recommendation: start with `pc.Application` for speed. If bundle size, WebGPU device options, or explicit system registration becomes important, migrate to the official `AppBase` pattern.

## Assets without the Editor

Engine-only projects do not get the Editor asset registry or server import pipeline. Assets are normal static files served by Vite/GitHub Pages, then registered or loaded in code.

### Simple URL load

The engine's `AssetRegistry.loadFromUrl(url, type, callback)` is documented in source as a way to "load and create an asset" and its example loads a texture URL then reads `asset.resource` ([asset-registry source](https://raw.githubusercontent.com/playcanvas/engine/main/src/framework/asset/asset-registry.js)).

```ts
const textureUrl = `${import.meta.env.BASE_URL}assets/textures/cardboard.png`;

app.assets.loadFromUrl(textureUrl, 'texture', (error, asset) => {
  if (error || !asset) {
    console.error('Failed to load texture', error);
    return;
  }

  const material = new pc.StandardMaterial();
  material.diffuseMap = asset.resource as pc.Texture;
  material.update();

  const render = box.render;
  if (render) {
    render.material = material;
  }
});
```

### Explicit asset objects and GLB models

The `Asset` constructor accepts a name, type, file object, data, and options; valid asset types include `container`, `texture`, `audio`, `json`, `shader`, `sprite`, `render`, `template`, and more, and file details must at least include a `url` ([asset source](https://raw.githubusercontent.com/playcanvas/engine/main/src/framework/asset/asset.js)). The official GLB loader example creates a `container` asset with a `.glb` URL, loads it with `AssetListLoader`, then instantiates it with `instantiateRenderEntity({})` ([GLB example](https://raw.githubusercontent.com/playcanvas/engine/main/examples/src/examples/loaders/glb.example.mjs)).

```ts
const crate = new pc.Asset('crate', 'container', {
  url: `${import.meta.env.BASE_URL}assets/models/crate.glb`
});

app.assets.add(crate);
app.assets.load(crate);

crate.on('load', () => {
  const entity = crate.resource.instantiateRenderEntity({}) as pc.Entity;
  entity.setPosition(0, 0, -2);
  app.root.addChild(entity);
});

crate.on('error', (error: unknown) => {
  console.error('Failed to load crate.glb', error);
});
```

For the POC, prefer runtime-ready assets: `.glb` for models, `.png`/`.jpg`/`.webp` for textures, and common browser audio formats. Put them in `public/assets/...` and reference them with `import.meta.env.BASE_URL`.

## TypeScript usability

TypeScript is usable directly. The official engine docs state the npm package ships with full TypeScript declarations ([engine docs](https://developer.playcanvas.com/user-manual/engine/)), and the npm package metadata confirms `types: build/playcanvas.d.ts` ([npm registry](https://registry.npmjs.org/playcanvas/latest)). The official standalone TypeScript example uses DOM casts and typed update deltas ([standalone docs](https://developer.playcanvas.com/user-manual/engine/standalone/)), and the official template uses strict TypeScript settings with bundler resolution ([template tsconfig](https://raw.githubusercontent.com/playcanvas/create-playcanvas/main/templates/engine/base/tsconfig.json)).

Expected rough edges:

- Some PlayCanvas entity components are added dynamically, so TypeScript may require null checks or casts around `entity.render`, `asset.resource`, and component-specific fields.
- Examples in the engine repo are often `.mjs` with JSDoc rather than `.ts`; they still map cleanly to TypeScript imports.

## Static production build and GitHub Pages

`vite build` outputs static files to `dist/`. That is enough for GitHub Pages. PlayCanvas's self-hosting docs describe PlayCanvas apps as static files that can be hosted on providers including GitHub Pages; for Editor-published builds they note `.nojekyll` may be needed because some exported file names start with underscores ([self-hosting docs](https://developer.playcanvas.com/user-manual/editor/publishing/web/self-hosting/)). For this Vite engine-only setup, `.nojekyll` is usually harmless and can be added later if generated asset names need it.

## Editor-only or Editor-provided capabilities that may bite later

Skipping the Editor is fine, but the project must replace several Editor conveniences:

- **Visual scene building**: the Editor provides transform gizmos, hierarchy, inspector, and drag/drop assets into the scene ([Editor docs](https://developer.playcanvas.com/user-manual/editor/)). Engine-only means all scene setup is code or custom tooling.
- **Cloud autosave, collaboration, and PlayCanvas version control**: the Editor provides cloud autosave, real-time collaboration, checkpoints, branches, merging, and history ([Editor docs](https://developer.playcanvas.com/user-manual/editor/)). Engine-only should rely on Git/GitHub and normal code review instead.
- **Asset import pipeline**: the Editor server converts source assets to runtime formats; docs call out FBX needing conversion before it can be loaded at runtime, while PNG can be used immediately ([asset import pipeline](https://raw.githubusercontent.com/playcanvas/developer-site/main/docs/user-manual/editor/assets/import-pipeline/index.md)). Engine-only should standardize on `.glb` and web-ready textures/audio or add a separate asset conversion pipeline.
- **Import options**: Editor import settings include preload defaults, power-of-two texture conversion, atlas creation, GLB conversion, hierarchy import, mesh compression/Draco, and generated render/template/material folders ([asset import pipeline](https://raw.githubusercontent.com/playcanvas/developer-site/main/docs/user-manual/editor/assets/import-pipeline/index.md)). Engine-only projects must handle these choices manually.
- **Asset management UI**: the Editor Assets Panel handles create/upload/delete/inspect/edit, folders, search/filter, drag/drop, cross-project copy/paste, and reference checking ([Assets Panel docs](https://developer.playcanvas.com/user-manual/editor/interface/assets/)). Engine-only needs repo conventions and maybe a simple manifest later.

## Deprecated/v1 API warnings

- Avoid the `model` component in new code. The standalone docs' simple cube snippet still shows `box.addComponent('model', ...)`, but the PlayCanvas docs mark the Model component as deprecated and replaced by the Render component ([standalone docs](https://developer.playcanvas.com/user-manual/engine/standalone/), [Model legacy docs](https://raw.githubusercontent.com/playcanvas/developer-site/main/docs/user-manual/editor/scenes/components/model.md)). Use `box.addComponent('render', { type: 'box' })` instead, as the official current starter does ([template main.ts](https://raw.githubusercontent.com/playcanvas/create-playcanvas/main/templates/engine/spinning-cube/src/main.ts)).
- Engine v2 removed WebGL1 support and now supports WebGL2 plus WebGPU beta; older examples that assume WebGL1 compatibility are not safe for a new project ([migration docs](https://raw.githubusercontent.com/playcanvas/developer-site/main/docs/user-manual/engine/migrations.md)).
- Engine v2 removed legacy scripts, `AudioSourceComponent`, `BasicMaterial`, and many deprecated compatibility functions; use current docs/examples and the debug engine when adapting older snippets ([migration docs](https://raw.githubusercontent.com/playcanvas/developer-site/main/docs/user-manual/engine/migrations.md)).

## Bottom line

For this repo's fast proof of concept, create the Vite skeleton above, keep all initial scene/gameplay in `src/main.ts` and later split into modules (`player`, `guards`, `projectiles`, `level`), store web-ready assets under `public/assets`, and avoid Editor-era examples that use `model` or legacy scripts. This gives a hot-reload dev loop now and a static `dist/` build for GitHub Pages.
