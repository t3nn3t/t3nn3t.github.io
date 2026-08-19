import * as THREE from 'three';

const canvas = document.querySelector('#scene');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x09090b, 0.065);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 7);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const geometry = new THREE.IcosahedronGeometry(1.65, 18);
const material = new THREE.MeshPhysicalMaterial({
  color: 0xc5ff3d,
  roughness: 0.28,
  metalness: 0.08,
  transmission: 0.2,
  thickness: 1.4,
  wireframe: true,
  transparent: true,
  opacity: 0.72,
});
const orb = new THREE.Mesh(geometry, material);
orb.position.x = 1.85;
scene.add(orb);

const glow = new THREE.PointLight(0xc5ff3d, 45, 12, 2);
glow.position.set(2.5, 1.5, 3);
scene.add(glow, new THREE.AmbientLight(0xffffff, 0.45));

const pointer = new THREE.Vector2();
const target = new THREE.Vector2();

addEventListener('pointermove', ({ clientX, clientY }) => {
  target.x = (clientX / innerWidth - 0.5) * 2;
  target.y = (clientY / innerHeight - 0.5) * 2;
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
});

const clock = new THREE.Clock();

function animate() {
  const elapsed = clock.getElapsedTime();
  pointer.lerp(target, 0.035);
  orb.rotation.x = elapsed * 0.07 + pointer.y * 0.18;
  orb.rotation.y = elapsed * 0.1 + pointer.x * 0.25;
  orb.position.y = Math.sin(elapsed * 0.55) * 0.12;
  camera.position.x = pointer.x * 0.12;
  camera.position.y = -pointer.y * 0.12;
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
