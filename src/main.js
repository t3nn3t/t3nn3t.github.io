import * as THREE from 'three';

const canvas = document.querySelector('#scene');
const hero = document.querySelector('#hero');
const gameUi = document.querySelector('#game-ui');
const startButton = document.querySelector('#start-drive');
const restartButton = document.querySelector('#restart');
const speedValue = document.querySelector('#speed-value');
const gearValue = document.querySelector('#gear-value');
const routeFill = document.querySelector('#route-fill');
const routePercent = document.querySelector('#route-percent');
const timerValue = document.querySelector('#timer-value');
const driftHud = document.querySelector('#drift-hud');
const driftScore = document.querySelector('#drift-score');
const surfaceHud = document.querySelector('#surface-hud');
const countdownElement = document.querySelector('#countdown');
const finishScreen = document.querySelector('#finish-screen');
const finishTime = document.querySelector('#finish-time');
const finishEmail = document.querySelector('#finish-email');
const startAgainButton = document.querySelector('#start-again');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const palette = {
  cream: 0xfff8e7,
  ink: 0x151515,
  road: 0x252832,
  roadEdge: 0xe4dcc4,
  earth: 0xa55f46,
  earthLight: 0xc67a59,
  orange: 0xff5d35,
  acid: 0xd9ff59,
  blue: 0x536d9f,
  sky: 0x7588b1,
  pink: 0xef7f9c,
  teal: 0x4b9b90,
  yellow: 0xffce58,
  charcoal: 0x343640,
};

const ROAD_HALF_WIDTH = 5.6;
const TRACK_SAMPLE_COUNT = 720;
const MAX_SPEED = 38;
const DRIFT_BOOST_SCALE = 1.25;

const scene = new THREE.Scene();
scene.background = new THREE.Color(palette.sky);
scene.fog = new THREE.Fog(palette.sky, 72, 190);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 360);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;

function resizeRenderer() {
  const scale = innerWidth < 760 ? 0.64 : 0.76;
  renderer.setPixelRatio(1);
  renderer.setSize(Math.max(1, Math.floor(innerWidth * scale)), Math.max(1, Math.floor(innerHeight * scale)), false);
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}

resizeRenderer();

const hemisphere = new THREE.HemisphereLight(0xc9d6f5, 0x6e3c2f, 3.5);
const sunLight = new THREE.DirectionalLight(0xffdfad, 4.6);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.left = -38;
sunLight.shadow.camera.right = 38;
sunLight.shadow.camera.top = 38;
sunLight.shadow.camera.bottom = -24;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 130;
scene.add(hemisphere, sunLight, sunLight.target);

const sun = new THREE.Mesh(
  new THREE.CircleGeometry(10, 24),
  new THREE.MeshBasicMaterial({ color: 0xffd28d, fog: false, depthTest: false }),
);
sun.position.set(38, 23, -125);
sun.renderOrder = -1;
camera.add(sun);

function flatMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: options.roughness ?? 0.86,
    metalness: options.metalness ?? 0,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
  });
}

function box(width, height, depth, color, x = 0, y = height / 2, z = 0, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), flatMaterial(color, options));
  mesh.position.set(x, y, z);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

function taperedBox(width, height, depth, color, x, y, z, options = {}) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const positions = geometry.attributes.position;
  const topScale = options.topScale ?? 0.72;
  const topDepthScale = options.topDepthScale ?? 0.78;
  for (let index = 0; index < positions.count; index += 1) {
    if (positions.getY(index) > 0) {
      positions.setX(index, positions.getX(index) * topScale);
      positions.setZ(index, positions.getZ(index) * topDepthScale);
    }
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, flatMaterial(color, options));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylinder(radiusTop, radiusBottom, height, segments, color, x = 0, y = height / 2, z = 0, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    flatMaterial(color, options),
  );
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createTextTexture(title, subtitle = '', background = '#fff8e7', foreground = '#151515') {
  const signCanvas = document.createElement('canvas');
  signCanvas.width = 768;
  signCanvas.height = 320;
  const context = signCanvas.getContext('2d');
  context.fillStyle = background;
  context.fillRect(0, 0, signCanvas.width, signCanvas.height);
  context.strokeStyle = foreground;
  context.lineWidth = 18;
  context.strokeRect(9, 9, signCanvas.width - 18, signCanvas.height - 18);
  context.fillStyle = foreground;
  context.font = '800 88px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(title.toUpperCase(), signCanvas.width / 2, subtitle ? 126 : 160, 690);
  if (subtitle) {
    context.font = '600 35px monospace';
    context.fillText(subtitle.toUpperCase(), signCanvas.width / 2, 232, 680);
  }
  const texture = new THREE.CanvasTexture(signCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

function createSign(title, subtitle, options = {}) {
  const group = new THREE.Group();
  const width = options.width ?? 4.8;
  const height = options.height ?? 1.9;
  const signY = options.signY ?? 3.1;
  const background = options.background ?? '#fff8e7';
  const foreground = options.foreground ?? '#151515';
  const backingColor = options.backingColor ?? palette.cream;
  const postsColor = options.postsColor ?? palette.ink;
  group.add(
    box(width, height, 0.18, backingColor, 0, signY, 0),
    box(0.14, signY - 0.15, 0.14, postsColor, -width * 0.32, (signY - 0.15) / 2, 0.02),
    box(0.14, signY - 0.15, 0.14, postsColor, width * 0.32, (signY - 0.15) / 2, 0.02),
  );
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.12, height - 0.12),
    new THREE.MeshBasicMaterial({ map: createTextTexture(title, subtitle, background, foreground) }),
  );
  face.position.set(0, signY, 0.1);
  group.add(face);
  return group;
}

function createPortfolioBillboard() {
  const group = new THREE.Group();
  const width = 9.4;
  const height = 4.25;
  const signY = 5.15;

  const billboardCanvas = document.createElement('canvas');
  billboardCanvas.width = 1024;
  billboardCanvas.height = 512;
  const context = billboardCanvas.getContext('2d');
  context.fillStyle = '#111936';
  context.fillRect(0, 0, billboardCanvas.width, billboardCanvas.height);
  context.fillStyle = '#43e7ff';
  context.fillRect(0, 0, billboardCanvas.width, 76);
  context.fillStyle = '#090b18';
  context.font = '800 34px monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('CAREER MILESTONE', billboardCanvas.width / 2, 39);
  context.fillStyle = '#fff6d3';
  context.font = '900 80px Arial, sans-serif';
  context.fillText('FOUNDED BLUESIDE', billboardCanvas.width / 2, 165, 920);
  context.fillStyle = '#bafc4f';
  context.font = '700 43px monospace';
  context.fillText('BOOTSTRAPPED LEGAL TECH', billboardCanvas.width / 2, 264, 900);
  context.fillStyle = '#ffe45c';
  context.font = '900 88px Arial, sans-serif';
  context.fillText('$0  →  $50K ARR', billboardCanvas.width / 2, 390, 900);
  context.strokeStyle = '#ff5a3d';
  context.lineWidth = 18;
  context.strokeRect(9, 9, billboardCanvas.width - 18, billboardCanvas.height - 18);

  const texture = new THREE.CanvasTexture(billboardCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.NearestFilter;

  group.add(
    box(width + 0.55, height + 0.55, 0.34, palette.orange, 0, signY, 0),
    box(width, height, 0.18, palette.charcoal, 0, signY, 0.2),
    box(0.32, signY - 0.4, 0.32, palette.cream, -width * 0.3, (signY - 0.4) / 2, -0.06),
    box(0.32, signY - 0.4, 0.32, palette.cream, width * 0.3, (signY - 0.4) / 2, -0.06),
  );

  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width - 0.16, height - 0.16),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  face.position.set(0, signY, 0.39);
  group.add(face);

  const bulbs = [];
  const bulbMaterial = flatMaterial(palette.yellow, {
    emissive: palette.yellow,
    emissiveIntensity: 1.4,
    roughness: 0.42,
  });
  for (let index = 0; index < 9; index += 1) {
    [-1, 1].forEach((edge) => {
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.105, 6, 4), bulbMaterial.clone());
      bulb.position.set(-width * 0.42 + index * width * 0.105, signY + edge * (height * 0.55), 0.46);
      bulb.castShadow = false;
      bulb.userData.phase = index + (edge > 0 ? 0 : 4);
      bulbs.push(bulb);
      group.add(bulb);
    });
  }
  group.userData.billboardBulbs = bulbs;
  return group;
}

const trackControlPoints = [
  new THREE.Vector3(0, 0, 42),
  new THREE.Vector3(0, 0, 4),
  new THREE.Vector3(-12, 0, -45),
  new THREE.Vector3(-48, 0, -102),
  new THREE.Vector3(-24, 0, -160),
  new THREE.Vector3(28, 0, -216),
  new THREE.Vector3(62, 0, -278),
  new THREE.Vector3(24, 0, -340),
  new THREE.Vector3(-38, 0, -396),
  new THREE.Vector3(-72, 0, -462),
  new THREE.Vector3(-34, 0, -528),
  new THREE.Vector3(30, 0, -590),
  new THREE.Vector3(66, 0, -654),
  new THREE.Vector3(28, 0, -720),
  new THREE.Vector3(-34, 0, -790),
  new THREE.Vector3(-58, 0, -858),
  new THREE.Vector3(-12, 0, -930),
  new THREE.Vector3(44, 0, -1002),
];

const trackCurve = new THREE.CatmullRomCurve3(trackControlPoints, false, 'catmullrom', 0.28);
const trackLength = trackCurve.getLength();
const FINISH_T = 0.982;
const finishPoint = trackCurve.getPointAt(FINISH_T);
const finishTangent = trackCurve.getTangentAt(FINISH_T).normalize();
const finishRight = trackRight(finishTangent);
const trackSamples = [];
const trackTangents = [];

for (let index = 0; index <= TRACK_SAMPLE_COUNT; index += 1) {
  const t = index / TRACK_SAMPLE_COUNT;
  trackSamples.push(trackCurve.getPointAt(t));
  trackTangents.push(trackCurve.getTangentAt(t).normalize());
}

function trackRight(tangent) {
  return new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
}

function createTrackStrip(leftOffset, rightOffset, color, y) {
  const positions = [];
  const indices = [];
  for (let index = 0; index <= TRACK_SAMPLE_COUNT; index += 1) {
    const point = trackSamples[index];
    const right = trackRight(trackTangents[index]);
    const leftPoint = point.clone().addScaledVector(right, leftOffset);
    const rightPoint = point.clone().addScaledVector(right, rightOffset);
    positions.push(leftPoint.x, y, leftPoint.z, rightPoint.x, y, rightPoint.z);
    if (index < TRACK_SAMPLE_COUNT) {
      const offset = index * 2;
      indices.push(offset, offset + 1, offset + 2, offset + 2, offset + 1, offset + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, flatMaterial(color, { roughness: 0.94 }));
  mesh.receiveShadow = true;
  return mesh;
}

function headingFromTangent(tangent) {
  return Math.atan2(-tangent.x, -tangent.z);
}

function placeAtTrack(object, t, side = 0, distance = 0, faceRoad = true) {
  const point = trackCurve.getPointAt(t);
  const tangent = trackCurve.getTangentAt(t).normalize();
  const right = trackRight(tangent);
  object.position.copy(point).addScaledVector(right, side * distance);
  if (faceRoad && side !== 0) {
    const towardRoad = right.multiplyScalar(-side);
    object.rotation.y = Math.atan2(towardRoad.x, towardRoad.z);
  } else {
    object.rotation.y = headingFromTangent(tangent);
  }
  scene.add(object);
  return object;
}

function addLandscape() {
  const ground = box(620, 0.3, 1200, palette.earth, 0, -0.22, -480, { castShadow: false });
  ground.receiveShadow = true;
  scene.add(ground);
  scene.add(
    createTrackStrip(-ROAD_HALF_WIDTH, ROAD_HALF_WIDTH, palette.road, 0.04),
    createTrackStrip(-ROAD_HALF_WIDTH - 0.7, -ROAD_HALF_WIDTH, palette.roadEdge, 0.055),
    createTrackStrip(ROAD_HALF_WIDTH, ROAD_HALF_WIDTH + 0.7, palette.roadEdge, 0.055),
    createTrackStrip(-ROAD_HALF_WIDTH - 1.15, -ROAD_HALF_WIDTH - 0.7, palette.earthLight, 0.02),
    createTrackStrip(ROAD_HALF_WIDTH + 0.7, ROAD_HALF_WIDTH + 1.15, palette.earthLight, 0.02),
  );

  for (let index = 5; index < TRACK_SAMPLE_COUNT - 4; index += 8) {
    const point = trackSamples[index];
    const tangent = trackTangents[index];
    const dash = box(0.17, 0.035, 3.6, palette.cream, point.x, 0.09, point.z, { castShadow: false });
    dash.rotation.y = headingFromTangent(tangent);
    scene.add(dash);
  }

  const mountainMaterial = flatMaterial(0x805047, { roughness: 1 });
  for (let index = 0; index < 54; index += 1) {
    const side = index % 2 ? 1 : -1;
    const z = 50 - index * 21;
    const x = side * (120 + (index % 5) * 28);
    const mountain = new THREE.Mesh(
      new THREE.ConeGeometry(18 + (index % 4) * 5, 30 + (index % 6) * 7, 5),
      mountainMaterial,
    );
    mountain.position.set(x, 8 + (index % 3) * 2, z);
    mountain.scale.z = 1.65;
    mountain.receiveShadow = true;
    scene.add(mountain);
  }

  for (let index = 0; index < 62; index += 1) {
    const t = 0.02 + (index / 62) * 0.95;
    const side = index % 2 ? 1 : -1;
    const point = trackCurve.getPointAt(t);
    const right = trackRight(trackCurve.getTangentAt(t));
    const cactus = new THREE.Group();
    cactus.add(cylinder(0.15, 0.23, 1.8 + (index % 3) * 0.45, 6, 0x46634a));
    const arm = cylinder(0.1, 0.13, 0.75, 6, 0x46634a, side * 0.26, 1.05, 0);
    arm.rotation.z = side * Math.PI / 2;
    cactus.add(arm);
    cactus.position.copy(point).addScaledVector(right, side * (11 + (index % 5) * 4));
    cactus.rotation.y = index * 0.73;
    scene.add(cactus);
  }
}

function createArch(title, subtitle, color = '#d9ff59') {
  const group = new THREE.Group();
  group.add(
    box(0.48, 6.5, 0.48, palette.cream, -7, 3.25, 0),
    box(0.48, 6.5, 0.48, palette.cream, 7, 3.25, 0),
    box(14.5, 0.45, 0.48, palette.cream, 0, 6.2, 0),
  );
  const sign = createSign(title, subtitle, { width: 6.7, height: 1.55, signY: 7.5, background: color });
  sign.children.slice(1, 3).forEach((post) => { post.visible = false; });
  group.add(sign);
  return group;
}

function createBlueSide() {
  const group = new THREE.Group();
  group.add(
    box(7.4, 5.2, 5.4, 0x243a64, 0, 2.6, -0.4),
    box(8, 0.42, 5.8, palette.acid, 0, 5.25, -0.4),
    box(1.2, 2.2, 0.08, 0x141924, 0, 1.1, 2.33),
  );
  [-2.4, -0.8, 0.8, 2.4].forEach((x) => group.add(box(0.9, 0.9, 0.07, 0x85bde1, x, 3.5, 2.33)));
  const sign = createSign('BLUESIDE', 'LEGAL TECH', { width: 5.8, height: 1.65, signY: 7, background: '#d9ff59' });
  group.add(sign);
  return group;
}

function createDonutShop() {
  const group = new THREE.Group();
  group.add(
    box(6.5, 3.5, 4.8, 0xf3d39c, 0, 1.75, -0.2),
    box(7.1, 0.42, 5.2, palette.pink, 0, 3.55, -0.2),
    box(2.5, 2.15, 0.08, 0x39495c, 0, 1.4, 2.23),
  );
  const donut = new THREE.Mesh(new THREE.TorusGeometry(1.65, 0.58, 6, 14), flatMaterial(palette.pink));
  donut.position.set(0, 6.05, 0);
  donut.castShadow = true;
  group.add(donut);
  group.userData.donut = donut;
  return group;
}

function createResearchLab() {
  const group = new THREE.Group();
  group.add(box(6.8, 2.7, 5.2, 0xd9d4c7, 0, 1.35, -0.3));
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(2.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x6cb1bd, roughness: 0.28, flatShading: true, transparent: true, opacity: 0.8 }),
  );
  dome.position.y = 2.75;
  dome.castShadow = true;
  group.add(dome, createSign('RESEARCH', 'UNIVERSITY OF BATH', { width: 5.6, height: 1.6, signY: 6.1 }));
  return group;
}

function createTower() {
  const group = new THREE.Group();
  group.add(box(6, 12.5, 4.8, palette.charcoal, 0, 6.25, -0.5));
  for (let row = 0; row < 6; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      group.add(box(0.75, 0.62, 0.07, row % 2 ? 0xffd279 : 0x86b4cc, -1.6 + column * 1.6, 3 + row * 1.55, 1.93));
    }
  }
  group.add(createSign('UBS', 'WEALTH TECH', { width: 4.6, height: 1.55, signY: 8.6, background: '#d9ff59' }));
  return group;
}

function createCamp() {
  const group = new THREE.Group();
  [palette.orange, palette.teal, palette.yellow].forEach((color, index) => {
    const tent = new THREE.Mesh(new THREE.ConeGeometry(1.65, 2.5, 4), flatMaterial(color));
    tent.position.set(-2.7 + index * 2.7, 1.25, -0.5 + (index % 2) * 1.4);
    tent.rotation.y = Math.PI / 4;
    tent.scale.z = 1.3;
    tent.castShadow = true;
    group.add(tent);
  });
  const fire = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.2, 5), flatMaterial(palette.orange, { emissive: palette.orange, emissiveIntensity: 1.1 }));
  fire.position.set(0, 0.7, 3.3);
  group.add(fire, createSign('BUILDERS.', 'FOUNDER CAMP', { width: 5.7, height: 1.6, signY: 5.2, background: '#ff5d35', foreground: '#fff8e7', backingColor: palette.orange }));
  return group;
}

function createGarage() {
  const group = new THREE.Group();
  group.add(
    box(7.2, 4.8, 5.4, 0x3f5561, 0, 2.4, -0.4),
    box(5.5, 3.4, 0.09, 0x151922, 0, 1.72, 2.34),
    box(7.8, 0.42, 5.8, palette.yellow, 0, 4.9, -0.4),
  );
  group.add(createSign('COAGENT', 'AGENT WORKFLOWS', { width: 5.8, height: 1.6, signY: 6.8, background: '#d9ff59' }));
  return group;
}

function addWorldObjects() {
  placeAtTrack(createArch('START', 'SHIFT TO DRIFT'), 0.018, 0, 0, false);
  placeAtTrack(createPortfolioBillboard(), 0.082, 1, 11.5);
  placeAtTrack(createBlueSide(), 0.13, 1, 15);
  placeAtTrack(createDonutShop(), 0.27, -1, 15);
  placeAtTrack(createResearchLab(), 0.42, 1, 15);
  placeAtTrack(createTower(), 0.57, -1, 17);
  placeAtTrack(createCamp(), 0.71, 1, 16);
  placeAtTrack(createGarage(), 0.84, -1, 16);
  placeAtTrack(createArch('FINISH', 'CLOCK STOPS HERE', '#ff5d35'), FINISH_T, 0, 0, false);

  const turns = [0.1, 0.2, 0.34, 0.49, 0.63, 0.77, 0.91];
  turns.forEach((t, index) => {
    const tangentBefore = trackCurve.getTangentAt(Math.max(0, t - 0.018));
    const tangentAfter = trackCurve.getTangentAt(Math.min(1, t + 0.018));
    const cross = tangentBefore.x * tangentAfter.z - tangentBefore.z * tangentAfter.x;
    const direction = cross > 0 ? '<<<' : '>>>';
    placeAtTrack(createSign(direction, 'DRIFT ZONE', {
      width: 4.3,
      height: 1.5,
      signY: 2.5,
      background: index % 2 ? '#ff5d35' : '#d9ff59',
      foreground: index % 2 ? '#fff8e7' : '#151515',
      backingColor: index % 2 ? palette.orange : palette.acid,
    }), t, cross > 0 ? 1 : -1, 9.5);
  });
}

function createCar() {
  const car = new THREE.Group();
  car.add(
    taperedBox(3.25, 0.7, 4.55, palette.orange, 0, 0.74, 0, { topScale: 0.9, topDepthScale: 0.96, roughness: 0.62 }),
    taperedBox(2.95, 0.42, 1.45, 0xe94d2c, 0, 1.12, -1.43, { topScale: 0.86, topDepthScale: 0.72, roughness: 0.58 }),
    taperedBox(3.08, 0.28, 1.1, 0xe94d2c, 0, 1.14, 1.48, { topScale: 0.94, topDepthScale: 0.9 }),
    taperedBox(2.25, 0.92, 2.05, 0x26354b, 0, 1.55, 0.05, { topScale: 0.7, topDepthScale: 0.64, roughness: 0.25, metalness: 0.08 }),
  );

  const rearGlass = box(1.92, 0.7, 0.07, 0x18212e, 0, 1.56, 1.02, { emissive: 0x26384a, emissiveIntensity: 0.22, castShadow: false });
  rearGlass.rotation.x = -0.26;
  car.add(rearGlass);
  for (let index = 0; index < 6; index += 1) {
    const louver = box(2.02, 0.065, 0.11, 0x101216, 0, 1.3 + index * 0.12, 1.1 + index * 0.028, { castShadow: false });
    louver.rotation.x = -0.26;
    car.add(louver);
  }

  car.add(
    box(2.92, 0.54, 0.13, 0x121419, 0, 0.86, 2.25),
    box(3.02, 0.18, 0.18, 0x191b20, 0, 0.48, 2.32),
    box(0.68, 0.22, 0.08, palette.yellow, 0, 0.59, 2.43, { castShadow: false }),
  );

  const brakeLights = [];
  [-1.03, -0.62, 0.62, 1.03].forEach((x) => {
    const light = box(0.3, 0.27, 0.08, 0xff3030, x, 0.95, 2.36, { emissive: 0xff2020, emissiveIntensity: 1.25, castShadow: false });
    brakeLights.push(light.material);
    car.add(light);
  });

  [-0.72, 0.72].forEach((x) => {
    const exhaust = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.42, 10),
      flatMaterial(0x787b80, { metalness: 0.72, roughness: 0.3 }),
    );
    exhaust.position.set(x, 0.39, 2.38);
    exhaust.rotation.x = Math.PI / 2;
    car.add(exhaust);
  });

  const boostFlames = [];
  [-0.72, 0.72].forEach((x) => {
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.18, 0.8, 5),
      flatMaterial(palette.acid, { emissive: palette.orange, emissiveIntensity: 2.8, roughness: 0.45 }),
    );
    flame.position.set(x, 0.39, 2.88);
    flame.rotation.x = Math.PI / 2;
    flame.visible = false;
    car.add(flame);
    boostFlames.push(flame);
  });

  [-1.72, 1.72].forEach((x) => car.add(box(0.32, 0.18, 0.5, palette.orange, x, 1.36, 0.3)));

  const wheels = [];
  const frontPivots = [];
  [-1.55, 1.55].forEach((x) => {
    [-1.28, 1.34].forEach((z) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.55, z);
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.38, 10), flatMaterial(0x111115));
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      pivot.add(wheel);
      car.add(pivot);
      wheels.push(wheel);
      if (z < 0) frontPivots.push(pivot);
    });
  });

  car.userData.wheels = wheels;
  car.userData.frontPivots = frontPivots;
  car.userData.brakeLights = brakeLights;
  car.userData.boostFlames = boostFlames;
  car.scale.setScalar(0.86);
  scene.add(car);
  return car;
}

addLandscape();
addWorldObjects();
const car = createCar();

const smokeParticles = Array.from({ length: 36 }, () => {
  const particle = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.28, 0),
    new THREE.MeshBasicMaterial({ color: 0xd8d3c7, transparent: true, opacity: 0, depthWrite: false }),
  );
  particle.visible = false;
  particle.userData.life = 0;
  particle.userData.velocity = new THREE.Vector3();
  scene.add(particle);
  return particle;
});
let smokeCursor = 0;

const skidMarks = Array.from({ length: 180 }, () => {
  const mark = box(0.17, 0.018, 1.35, 0x191919, 0, 0.072, 0, { castShadow: false, receiveShadow: false });
  mark.visible = false;
  scene.add(mark);
  return mark;
});
let skidCursor = 0;

const input = {
  keys: new Set(),
  touch: new Set(),
};

const state = {
  started: false,
  countdown: 0,
  countdownLabel: '',
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  heading: 0,
  yawVelocity: 0,
  driftBlend: 0,
  steerVisual: 0,
  braking: false,
  drifting: false,
  onRoad: true,
  nearestIndex: 0,
  roadDistance: 0,
  progress: 0,
  driftChain: 0,
  driftTime: 0,
  driftMultiplier: 1,
  driftGrace: 0,
  driftDisplay: 0,
  smokeTimer: 0,
  skidTimer: 0,
  handbrakeDown: false,
  boostTimer: 0,
  boostPower: 0,
  timerRunning: false,
  runTime: 0,
  finalTime: 0,
  finished: false,
  finishSide: -1,
};

function nearestTrackInfo(position) {
  let nearestIndex = 0;
  let nearestDistanceSquared = Infinity;
  for (let index = 0; index < trackSamples.length; index += 1) {
    const sample = trackSamples[index];
    const dx = position.x - sample.x;
    const dz = position.z - sample.z;
    const distanceSquared = dx * dx + dz * dz;
    if (distanceSquared < nearestDistanceSquared) {
      nearestDistanceSquared = distanceSquared;
      nearestIndex = index;
    }
  }
  return {
    index: nearestIndex,
    distance: Math.sqrt(nearestDistanceSquared),
    point: trackSamples[nearestIndex],
    tangent: trackTangents[nearestIndex],
  };
}

function forwardVector() {
  return new THREE.Vector3(-Math.sin(state.heading), 0, -Math.cos(state.heading));
}

function rightVector() {
  return new THREE.Vector3(Math.cos(state.heading), 0, -Math.sin(state.heading));
}

function resetCar(snapCamera = false, toStart = false) {
  const index = toStart || !state.started
    ? Math.floor(TRACK_SAMPLE_COUNT * 0.008)
    : state.nearestIndex;
  const point = trackSamples[index];
  const tangent = trackTangents[index];
  state.position.copy(point);
  state.position.y = 0.06;
  state.velocity.set(0, 0, 0);
  state.heading = headingFromTangent(tangent);
  state.yawVelocity = 0;
  state.driftBlend = 0;
  state.steerVisual = 0;
  state.braking = false;
  state.drifting = false;
  state.nearestIndex = index;
  state.roadDistance = 0;
  state.progress = index / TRACK_SAMPLE_COUNT;
  state.driftChain = 0;
  state.driftTime = 0;
  state.driftMultiplier = 1;
  state.driftGrace = 0;
  state.driftDisplay = 0;
  state.handbrakeDown = false;
  state.boostTimer = 0;
  state.boostPower = 0;
  state.finishSide = state.position.clone().sub(finishPoint).dot(finishTangent);
  car.position.copy(state.position);
  car.rotation.set(0, state.heading, 0);
  const forward = forwardVector();
  if (snapCamera) {
    camera.position.copy(state.position).addScaledVector(forward, -12).add(new THREE.Vector3(0, 5.8, 0));
    camera.lookAt(state.position.clone().addScaledVector(forward, 8).add(new THREE.Vector3(0, 1.1, 0)));
  }
}

function controlActive(control) {
  if (input.touch.has(control)) return true;
  if (control === 'throttle') return input.keys.has('w') || input.keys.has('arrowup');
  if (control === 'brake') return input.keys.has('s') || input.keys.has('arrowdown');
  if (control === 'left') return input.keys.has('a') || input.keys.has('arrowleft');
  if (control === 'right') return input.keys.has('d') || input.keys.has('arrowright');
  if (control === 'drift') return input.keys.has('shift');
  return false;
}

function showCountdownLabel(label) {
  if (label === state.countdownLabel) return;
  state.countdownLabel = label;
  countdownElement.textContent = label;
  countdownElement.classList.remove('is-visible');
  void countdownElement.offsetWidth;
  if (label) countdownElement.classList.add('is-visible');
}

function startDrive() {
  input.keys.clear();
  input.touch.clear();
  state.started = true;
  state.finished = false;
  state.timerRunning = false;
  state.runTime = 0;
  state.finalTime = 0;
  state.countdown = 2.15;
  resetCar(true, true);
  hero.classList.add('is-hidden');
  document.body.classList.add('is-playing');
  gameUi.classList.add('is-active');
  gameUi.setAttribute('aria-hidden', 'false');
  finishScreen.classList.remove('is-active');
  finishScreen.setAttribute('aria-hidden', 'true');
  showCountdownLabel('3');
}

function restartRun() {
  if (!state.started) {
    restartExperience();
    return;
  }
  startDrive();
}

function restartExperience() {
  state.started = false;
  state.finished = false;
  state.timerRunning = false;
  state.runTime = 0;
  state.finalTime = 0;
  state.countdown = 0;
  input.keys.clear();
  input.touch.clear();
  resetCar(true, true);
  hero.classList.remove('is-hidden');
  document.body.classList.remove('is-playing');
  gameUi.classList.remove('is-active');
  gameUi.setAttribute('aria-hidden', 'true');
  finishScreen.classList.remove('is-active');
  finishScreen.setAttribute('aria-hidden', 'true');
  showCountdownLabel('');
  document.body.classList.remove('is-drifting');
  document.body.classList.remove('is-boosting');
}

function spawnSmoke() {
  const right = rightVector();
  const forward = forwardVector();
  [-1, 1].forEach((side) => {
    const particle = smokeParticles[smokeCursor % smokeParticles.length];
    smokeCursor += 1;
    particle.visible = true;
    particle.userData.life = 1;
    particle.material.opacity = 0.52;
    particle.scale.setScalar(0.55 + Math.random() * 0.35);
    particle.position.copy(state.position)
      .addScaledVector(right, side * 1.15)
      .addScaledVector(forward, -1.35);
    particle.position.y = 0.42;
    particle.userData.velocity.copy(state.velocity).multiplyScalar(0.08);
    particle.userData.velocity.x += (Math.random() - 0.5) * 0.8;
    particle.userData.velocity.y = 0.7 + Math.random() * 0.5;
    particle.userData.velocity.z += (Math.random() - 0.5) * 0.8;
  });
}

function spawnSkidMarks() {
  const right = rightVector();
  const forward = forwardVector();
  const velocityHeading = state.velocity.lengthSq() > 0.1
    ? Math.atan2(-state.velocity.x, -state.velocity.z)
    : state.heading;
  [-1, 1].forEach((side) => {
    const mark = skidMarks[skidCursor % skidMarks.length];
    skidCursor += 1;
    mark.visible = true;
    mark.position.copy(state.position)
      .addScaledVector(right, side * 1.1)
      .addScaledVector(forward, -1.2);
    mark.position.y = 0.075;
    mark.rotation.set(0, velocityHeading, 0);
  });
}

function updateParticles(delta) {
  smokeParticles.forEach((particle) => {
    if (!particle.visible) return;
    particle.userData.life -= delta * 0.72;
    if (particle.userData.life <= 0) {
      particle.visible = false;
      return;
    }
    particle.position.addScaledVector(particle.userData.velocity, delta);
    particle.scale.multiplyScalar(1 + delta * 0.75);
    particle.material.opacity = particle.userData.life * 0.46;
  });
}

function updateCountdown(delta) {
  if (state.countdown <= 0) return;
  const waitingForGo = state.countdown > 0.62;
  state.countdown = Math.max(0, state.countdown - delta);
  if (state.countdown > 1.62) showCountdownLabel('3');
  else if (state.countdown > 1.12) showCountdownLabel('2');
  else if (state.countdown > 0.62) showCountdownLabel('1');
  else if (state.countdown > 0.12) showCountdownLabel('GO');
  else showCountdownLabel('');
  if (waitingForGo && state.countdown <= 0.62 && !state.finished) state.timerRunning = true;
}

function formatRaceTime(milliseconds) {
  const totalMilliseconds = Math.max(0, Math.floor(milliseconds));
  const minutes = Math.floor(totalMilliseconds / 60000);
  const seconds = Math.floor((totalMilliseconds % 60000) / 1000);
  const millis = totalMilliseconds % 1000;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function updateRaceClock(delta) {
  if (state.timerRunning && !state.finished) state.runTime += delta * 1000;
}

function finishRun() {
  state.finished = true;
  state.timerRunning = false;
  state.finalTime = state.runTime;
  state.progress = 1;
  state.velocity.set(0, 0, 0);
  state.boostTimer = 0;
  input.keys.clear();
  input.touch.clear();

  const formattedTime = formatRaceTime(state.finalTime);
  finishTime.textContent = formattedTime;
  const subject = `Interested in having a chat — ${formattedTime} lap`;
  const body = `Hi Jake,\n\nI'm interested in having a chat.\n\nI also clocked a ${formattedTime} on Jake's Road, which surely earns me pole position in your inbox.\n\nBest,`;
  finishEmail.href = `mailto:jaketennet@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  finishScreen.classList.add('is-active');
  finishScreen.setAttribute('aria-hidden', 'false');
}

function updatePhysics(delta) {
  if (!state.started || state.countdown > 0.62 || state.finished) return;

  const throttle = controlActive('throttle');
  const brake = controlActive('brake');
  const handbrake = controlActive('drift');
  const releasedHandbrake = state.handbrakeDown && !handbrake;
  state.handbrakeDown = handbrake;
  const steerInput = Number(controlActive('right')) - Number(controlActive('left'));
  let forward = forwardVector();
  let right = rightVector();
  let longitudinalSpeed = state.velocity.dot(forward);
  let lateralSpeed = state.velocity.dot(right);
  const absoluteSpeed = state.velocity.length();
  const speedRatio = THREE.MathUtils.clamp(Math.abs(longitudinalSpeed) / MAX_SPEED, 0, 1);
  const offRoad = !state.onRoad;
  const velocityHeading = absoluteSpeed > 0.5
    ? Math.atan2(-state.velocity.x, -state.velocity.z)
    : state.heading;
  const slipAngle = Math.atan2(
    Math.sin(state.heading - velocityHeading),
    Math.cos(state.heading - velocityHeading),
  );
  const driftIntent = handbrake
    && Math.abs(longitudinalSpeed) > 6.2
    && (steerInput !== 0 || state.driftBlend > 0.18);
  const enteringDrift = driftIntent && state.driftBlend < 0.08;

  if (releasedHandbrake && state.driftTime > 0.35 && state.driftChain > 8) {
    const boostLevel = THREE.MathUtils.clamp(state.driftTime / 3, 0, 1);
    state.boostTimer = (0.62 + boostLevel * 0.88) * DRIFT_BOOST_SCALE;
    state.boostPower = (12 + boostLevel * 6) * DRIFT_BOOST_SCALE;
  }

  state.driftBlend = THREE.MathUtils.damp(
    state.driftBlend,
    driftIntent ? 1 : 0,
    driftIntent ? 10 : 2.4,
    delta,
  );

  if (Math.abs(longitudinalSpeed) > 0.7) {
    const direction = Math.sign(longitudinalSpeed);
    const normalSteeringRate = THREE.MathUtils.lerp(0.34, 0.76, Math.min(speedRatio * 1.3, 1));
    const normalYawTarget = (-steerInput * normalSteeringRate * direction) - slipAngle * 1.65;
    const driftSteeringRate = THREE.MathUtils.lerp(1.25, 1.62, speedRatio);
    const driftYawTarget = (-steerInput * driftSteeringRate * direction) - slipAngle * 0.12;
    const yawTarget = THREE.MathUtils.lerp(normalYawTarget, driftYawTarget, state.driftBlend);

    if (enteringDrift) state.yawVelocity -= steerInput * 0.82 * direction;
    state.yawVelocity = THREE.MathUtils.damp(
      state.yawVelocity,
      yawTarget,
      THREE.MathUtils.lerp(7.5, 3.1, state.driftBlend),
      delta,
    );
    state.heading += state.yawVelocity * delta;
  } else {
    state.yawVelocity = THREE.MathUtils.damp(state.yawVelocity, 0, 8, delta);
  }

  forward = forwardVector();
  right = rightVector();
  longitudinalSpeed = state.velocity.dot(forward);
  lateralSpeed = state.velocity.dot(right);

  if (throttle) {
    const acceleration = offRoad ? 13.5 : 17.5;
    const driveDirection = forward.clone();
    if (state.driftBlend > 0.08 && absoluteSpeed > 1) {
      driveDirection.lerp(state.velocity.clone().normalize(), state.driftBlend * 0.38).normalize();
    }
    state.velocity.addScaledVector(driveDirection, acceleration * delta);
  }

  if (state.boostTimer > 0) {
    const boostDirection = absoluteSpeed > 1
      ? state.velocity.clone().normalize().lerp(forward, 0.35).normalize()
      : forward;
    state.velocity.addScaledVector(boostDirection, state.boostPower * (offRoad ? 0.55 : 1) * delta);
    state.boostTimer = Math.max(0, state.boostTimer - delta);
  }

  if (brake) {
    if (longitudinalSpeed > 1.5) state.velocity.addScaledVector(forward, -30 * delta);
    else state.velocity.addScaledVector(forward, -11 * delta);
  }

  const lateralGrip = offRoad
    ? THREE.MathUtils.lerp(4.2, 0.78, state.driftBlend)
    : THREE.MathUtils.lerp(11.5, 0.42, state.driftBlend);
  const lateralCorrection = THREE.MathUtils.clamp(lateralGrip * delta, 0, 1);
  state.velocity.addScaledVector(right, -lateralSpeed * lateralCorrection);

  const drag = offRoad
    ? state.driftBlend > 0.12 ? 0.42 : 0.62
    : state.driftBlend > 0.12
      ? throttle ? 0.12 : 0.28
      : throttle ? 0.1 : 0.32;
  state.velocity.multiplyScalar(Math.exp(-drag * delta));

  const speedLimit = offRoad
    ? 30 + (state.boostTimer > 0 ? 3 * DRIFT_BOOST_SCALE : 0)
    : MAX_SPEED + (state.boostTimer > 0 ? 6 * DRIFT_BOOST_SCALE : 0);
  if (state.velocity.length() > speedLimit) state.velocity.setLength(speedLimit);
  state.position.addScaledVector(state.velocity, delta);
  state.position.y = 0.06;

  const nearest = nearestTrackInfo(state.position);
  state.nearestIndex = nearest.index;
  state.roadDistance = nearest.distance;
  state.onRoad = nearest.distance <= ROAD_HALF_WIDTH + 1.1;
  state.progress = nearest.index / TRACK_SAMPLE_COUNT;

  if (nearest.distance > 72) {
    resetCar(false);
    return;
  }

  const finishOffset = state.position.clone().sub(finishPoint);
  const currentFinishSide = finishOffset.dot(finishTangent);
  const insideFinishGate = Math.abs(finishOffset.dot(finishRight)) <= ROAD_HALF_WIDTH + 0.9;
  const movingForward = state.velocity.dot(finishTangent) > 0;
  const crossedFinish = state.finishSide < 0 && currentFinishSide >= 0 && insideFinishGate && movingForward;
  state.finishSide = currentFinishSide;
  if (crossedFinish) {
    finishRun();
    return;
  }

  forward = forwardVector();
  right = rightVector();
  longitudinalSpeed = state.velocity.dot(forward);
  lateralSpeed = state.velocity.dot(right);
  const slipDegrees = THREE.MathUtils.radToDeg(Math.atan2(Math.abs(lateralSpeed), Math.max(Math.abs(longitudinalSpeed), 0.1)));
  state.drifting = state.driftBlend > 0.18 && Math.abs(longitudinalSpeed) > 6.2 && slipDegrees > 4.5;
  state.braking = brake && longitudinalSpeed > 0.5;
  state.steerVisual = THREE.MathUtils.damp(state.steerVisual, steerInput, 9, delta);

  if (state.drifting) {
    state.driftGrace = 1.05;
    state.driftDisplay = 1.2;
    state.driftTime += delta;
    state.driftMultiplier = Math.min(5, 1 + Math.floor(state.driftTime / 1.15) * 0.5);
    state.driftChain += Math.abs(lateralSpeed) * Math.abs(longitudinalSpeed) * 0.54 * state.driftMultiplier * delta;
    state.smokeTimer -= delta;
    state.skidTimer -= delta;
    if (state.smokeTimer <= 0) {
      spawnSmoke();
      state.smokeTimer = 0.055;
    }
    if (state.skidTimer <= 0) {
      spawnSkidMarks();
      state.skidTimer = 0.045;
    }
  } else if (state.driftChain > 0) {
    state.driftGrace -= delta;
    state.driftDisplay = Math.max(0, state.driftDisplay - delta);
    if (state.boostTimer <= 0) {
      state.driftChain = 0;
      state.driftTime = 0;
      state.driftMultiplier = 1;
    }
  }
}

function updateCar(delta, elapsed) {
  const speed = state.velocity.length();
  const forward = forwardVector();
  car.position.copy(state.position);
  const attractIdle = !state.started && !reducedMotion ? Math.sin(elapsed * 3.2) * 0.022 : 0;
  car.position.y += attractIdle;
  const terrainBump = !state.onRoad && !reducedMotion ? Math.sin(elapsed * 25) * Math.min(speed / 30, 1) * 0.055 : 0;
  car.position.y += terrainBump;
  car.rotation.y = state.heading;
  car.rotation.z = -state.steerVisual * Math.min(speed / 30, 1) * (state.drifting ? 0.09 : 0.045);
  car.rotation.x = state.braking ? -0.025 : controlActive('throttle') ? 0.012 : 0;
  car.userData.wheels.forEach((wheel) => { wheel.rotation.x -= state.velocity.dot(forward) * delta * 1.9; });
  car.userData.frontPivots.forEach((pivot) => { pivot.rotation.y = -state.steerVisual * 0.34; });
  car.userData.brakeLights.forEach((material) => {
    material.emissiveIntensity = state.started
      ? (state.braking ? 4 : 1.25)
      : 1.8 + Math.sin(elapsed * 2.4) * 0.45;
  });
  car.userData.boostFlames.forEach((flame, index) => {
    flame.visible = state.boostTimer > 0;
    flame.scale.y = 0.8 + Math.sin(elapsed * 42 + index) * 0.24;
  });

  sunLight.position.copy(state.position).add(new THREE.Vector3(-34, 58, 30));
  sunLight.target.position.copy(state.position);
  sunLight.target.updateMatrixWorld();
}

function updateCamera(delta) {
  const forward = forwardVector();
  const speed = state.velocity.length();
  const velocityDirection = state.velocity.lengthSq() > 1
    ? state.velocity.clone().normalize()
    : forward.clone();
  const chaseDirection = forward.clone().lerp(velocityDirection, state.drifting ? 0.3 : 0.08).normalize();
  const desiredPosition = state.position.clone()
    .addScaledVector(chaseDirection, -THREE.MathUtils.lerp(11.5, 15.5, Math.min(speed / MAX_SPEED, 1)))
    .add(new THREE.Vector3(0, THREE.MathUtils.lerp(5.6, 7.2, Math.min(speed / MAX_SPEED, 1)), 0));
  const smoothing = state.drifting ? 4.2 : 6.4;
  camera.position.lerp(desiredPosition, 1 - Math.exp(-smoothing * delta));
  const lookTarget = state.position.clone()
    .addScaledVector(chaseDirection, 10 + speed * 0.16)
    .add(new THREE.Vector3(0, 0.85, 0));
  camera.lookAt(lookTarget);
  camera.rotation.z += -state.steerVisual * (state.drifting ? 0.024 : 0.009);
  const targetFov = 58 + Math.min(speed / MAX_SPEED, 1) * 11 + (state.drifting ? 3 : 0) + (state.boostTimer > 0 ? 4 : 0);
  camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 5, delta);
  camera.updateProjectionMatrix();
}

function updateUi() {
  const speedMph = Math.round(state.velocity.length() * 3.55);
  speedValue.textContent = String(speedMph).padStart(3, '0');
  const forward = forwardVector();
  const longitudinal = state.velocity.dot(forward);
  gearValue.textContent = Math.abs(longitudinal) < 0.8 ? 'N' : longitudinal < 0 ? 'R' : `D${Math.min(6, Math.max(1, Math.ceil(speedMph / 30)))}`;
  routeFill.style.width = `${state.progress * 100}%`;
  routePercent.textContent = `${Math.round(state.progress * 100)}%`;
  timerValue.textContent = formatRaceTime(state.finished ? state.finalTime : state.runTime);
  surfaceHud.textContent = state.onRoad ? 'Asphalt' : 'Off road';
  surfaceHud.classList.toggle('is-offroad', !state.onRoad);

  const boosting = state.boostTimer > 0;
  const showDrift = state.drifting || (boosting && state.driftChain > 0);
  const driftScale = THREE.MathUtils.clamp(0.78 + state.driftTime * 0.06, 0.78, 1.18);
  driftHud.classList.toggle('is-active', showDrift);
  driftHud.classList.toggle('is-boosting', boosting);
  driftHud.style.setProperty('--drift-scale', driftScale.toFixed(3));
  if (state.driftChain > 0) {
    driftScore.textContent = Math.round(state.driftChain).toLocaleString();
  }
  document.body.classList.toggle('is-drifting', state.drifting);
  document.body.classList.toggle('is-boosting', boosting);
}

function animateWorld(elapsed) {
  scene.traverse((object) => {
    if (object.userData.donut) object.userData.donut.rotation.z = Math.sin(elapsed * 0.5) * 0.08;
    if (object.userData.billboardBulbs) {
      object.userData.billboardBulbs.forEach((bulb) => {
        const isLit = Math.floor(elapsed * 7 + bulb.userData.phase) % 4 < 2;
        bulb.material.emissiveIntensity = isLit ? 3.6 : 0.55;
        bulb.scale.setScalar(isLit ? 1.16 : 0.92);
      });
    }
  });
}

startButton.addEventListener('click', startDrive);
restartButton.addEventListener('click', restartRun);
startAgainButton.addEventListener('click', startDrive);

addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (state.finished && (key === 'enter' || key === ' ')) {
    event.preventDefault();
    startDrive();
    return;
  }
  if (state.started && ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'r'].includes(key)) {
    event.preventDefault();
  }
  input.keys.add(key);
  if (key === 'r' && state.started && !event.repeat) startDrive();
  if ((key === 'enter' || key === ' ') && !state.started) startDrive();
});

addEventListener('keyup', (event) => input.keys.delete(event.key.toLowerCase()));
addEventListener('blur', () => input.keys.clear());

document.querySelectorAll('[data-control]').forEach((button) => {
  const control = button.dataset.control;
  const release = () => {
    input.touch.delete(control);
    button.classList.remove('is-pressed');
  };
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    input.touch.add(control);
    button.classList.add('is-pressed');
    button.setPointerCapture?.(event.pointerId);
  });
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
});

addEventListener('resize', resizeRenderer);

resetCar(true);
const clock = new THREE.Clock();

function animate() {
  const delta = Math.min(clock.getDelta(), 0.04);
  const elapsed = clock.elapsedTime;
  updateRaceClock(delta);
  updateCountdown(delta);
  updatePhysics(delta);
  updateParticles(delta);
  updateCar(delta, elapsed);
  updateCamera(delta);
  updateUi();
  animateWorld(elapsed);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
