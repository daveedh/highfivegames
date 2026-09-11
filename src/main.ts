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

const greyBox = (shade: number): pc.StandardMaterial => {
  const material = new pc.StandardMaterial();
  material.diffuse = new pc.Color(shade, shade, shade);
  material.update();
  return material;
};

const floorMaterial = greyBox(0.45);
const wallMaterial = greyBox(0.65);
const propMaterial = greyBox(0.85);

const ROOM_WIDTH = 12;
const ROOM_DEPTH = 8;
const WALL_HEIGHT = 3;
const WALL_THICKNESS = 0.25;

const addBox = (
  name: string,
  material: pc.StandardMaterial,
  position: pc.Vec3,
  scale: pc.Vec3
): pc.Entity => {
  const entity = new pc.Entity(name);
  entity.addComponent('render', { type: 'box', material });
  entity.setPosition(position);
  entity.setLocalScale(scale);
  app.root.addChild(entity);
  return entity;
};

addBox(
  'floor',
  floorMaterial,
  new pc.Vec3(0, -WALL_THICKNESS / 2, 0),
  new pc.Vec3(ROOM_WIDTH, WALL_THICKNESS, ROOM_DEPTH)
);

const halfWidth = ROOM_WIDTH / 2;
const halfDepth = ROOM_DEPTH / 2;
const wallY = WALL_HEIGHT / 2;

addBox(
  'wall-north',
  wallMaterial,
  new pc.Vec3(0, wallY, -halfDepth),
  new pc.Vec3(ROOM_WIDTH, WALL_HEIGHT, WALL_THICKNESS)
);
addBox(
  'wall-south',
  wallMaterial,
  new pc.Vec3(0, wallY, halfDepth),
  new pc.Vec3(ROOM_WIDTH, WALL_HEIGHT, WALL_THICKNESS)
);
addBox(
  'wall-west',
  wallMaterial,
  new pc.Vec3(-halfWidth, wallY, 0),
  new pc.Vec3(WALL_THICKNESS, WALL_HEIGHT, ROOM_DEPTH)
);
addBox(
  'wall-east',
  wallMaterial,
  new pc.Vec3(halfWidth, wallY, 0),
  new pc.Vec3(WALL_THICKNESS, WALL_HEIGHT, ROOM_DEPTH)
);

const flatPackBox = addBox(
  'flat-pack-box',
  propMaterial,
  new pc.Vec3(0, 0.5, 0),
  new pc.Vec3(1.4, 1, 0.4)
);

const camera = new pc.Entity('camera');
camera.addComponent('camera', {
  clearColor: new pc.Color(0.08, 0.1, 0.16),
  fov: 60
});
app.root.addChild(camera);

const sun = new pc.Entity('sun');
sun.addComponent('light', {
  type: 'directional',
  intensity: 1.6,
  castShadows: true,
  shadowBias: 0.2,
  normalOffsetBias: 0.05
});
sun.setEulerAngles(50, 35, 0);
app.root.addChild(sun);

const fill = new pc.Entity('fill-light');
fill.addComponent('light', {
  type: 'directional',
  intensity: 0.4
});
fill.setEulerAngles(-20, -140, 0);
app.root.addChild(fill);

// Placeholder camera move: a slow orbit, so the grey room reads as 3D until the
// first-person controller lands.
const ORBIT_RADIUS = 4.5;
const EYE_HEIGHT = 1.7;
let orbitAngle = 0;

app.on('update', (dt: number) => {
  orbitAngle += dt * 0.15;
  camera.setPosition(
    Math.sin(orbitAngle) * ORBIT_RADIUS,
    EYE_HEIGHT,
    Math.cos(orbitAngle) * ORBIT_RADIUS
  );
  camera.lookAt(0, 0.9, 0);

  flatPackBox.rotate(0, 20 * dt, 0);
});
