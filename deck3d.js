import * as THREE from './vendor/three.module.js';

const deckEl = document.getElementById('deck');

let renderer;
let scene;
let camera;
let deckGroup;
let topCard;
let edgeBlock;
let cardMeshes = [];
let particles;
let phase = 'intro';
let targetRotation = new THREE.Euler(-0.18, 0.12, -0.08);
let targetPosition = new THREE.Vector3(0, 0, 0);
let pulsePower = 0;
let cutRatio = null;
let cutMarker;
let lastTime = performance.now();

function makeRoundedRectTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1536;
  const ctx = canvas.getContext('2d');

  const grd = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grd.addColorStop(0, '#5b3274');
  grd.addColorStop(0.52, '#241734');
  grd.addColorStop(1, '#100b18');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#f3d789';
  for (let i = -canvas.height; i < canvas.width; i += 34) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + canvas.height, canvas.height);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = '#d7a84f';
  ctx.lineWidth = 28;
  roundRect(ctx, 74, 74, canvas.width - 148, canvas.height - 148, 72);
  ctx.stroke();
  ctx.lineWidth = 7;
  roundRect(ctx, 132, 132, canvas.width - 264, canvas.height - 264, 44);
  ctx.stroke();

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.strokeStyle = '#e8bf68';
  ctx.fillStyle = '#e8bf68';
  ctx.shadowColor = 'rgba(215,168,79,.65)';
  ctx.shadowBlur = 34;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(0, 0, 140, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 8; i++) {
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.moveTo(0, -210);
    ctx.lineTo(26, -74);
    ctx.lineTo(0, -96);
    ctx.lineTo(-26, -74);
    ctx.closePath();
    ctx.fill();
  }
  ctx.font = '900 156px ui-rounded, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('✦', 0, 5);
  ctx.restore();

  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 9000; i++) {
    const v = Math.random() * 255;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.random() * canvas.width, Math.random() * canvas.height, 1, 1);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function init() {
  if (!deckEl || renderer) return;

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.15, 7.2);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'deck-3d-canvas';
  deckEl.innerHTML = '';
  deckEl.appendChild(renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffedd0, 1.55);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffd28a, 2.5);
  key.position.set(-3.2, 4.5, 5.2);
  key.castShadow = true;
  scene.add(key);
  const rim = new THREE.PointLight(0x8f5cff, 3.2, 10);
  rim.position.set(3.4, -1.5, 3.4);
  scene.add(rim);

  deckGroup = new THREE.Group();
  scene.add(deckGroup);

  const backTexture = makeRoundedRectTexture();
  const topMaterial = new THREE.MeshStandardMaterial({ map: backTexture, roughness: 0.42, metalness: 0.1 });
  const paperMaterial = new THREE.MeshStandardMaterial({ color: 0xf1e6d0, roughness: 0.82, metalness: 0.015 });
  const warmPaperMaterial = new THREE.MeshStandardMaterial({ color: 0xfff6df, roughness: 0.72, metalness: 0.01 });
  const shadowMaterial = new THREE.MeshStandardMaterial({ color: 0x2a1a2f, roughness: 0.7 });

  edgeBlock = new THREE.Group();
  deckGroup.add(edgeBlock);

  const cardGeometry = new THREE.BoxGeometry(2.42, 0.014, 3.42, 12, 1, 18);
  const count = 38;
  for (let i = 0; i < count; i++) {
    const y = -0.245 + i * 0.0132;
    const jitterX = (Math.sin(i * 1.7) * 0.004);
    const jitterZ = (Math.cos(i * 1.31) * 0.004);
    const material = i === count - 1
      ? [shadowMaterial, shadowMaterial, topMaterial, warmPaperMaterial, shadowMaterial, shadowMaterial]
      : [paperMaterial, paperMaterial, warmPaperMaterial, warmPaperMaterial, paperMaterial, paperMaterial];
    const card = new THREE.Mesh(cardGeometry, material);
    card.position.set(jitterX, y, jitterZ);
    card.rotation.y = Math.sin(i * 0.9) * 0.002;
    card.castShadow = true;
    card.receiveShadow = true;
    card.userData.base = { x: jitterX, y, z: jitterZ, rz: 0, ry: card.rotation.y, index: i, count };
    cardMeshes.push(card);
    edgeBlock.add(card);
  }
  topCard = cardMeshes[cardMeshes.length - 1];

  addPaperLines();
  addParticles();
  addCutMarker();

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(3.6, 64),
    new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.24 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.56;
  floor.receiveShadow = true;
  scene.add(floor);

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(tick);
}

function addPaperLines() {
  const lineMaterial = new THREE.LineBasicMaterial({ color: 0xa99a83, transparent: true, opacity: 0.38 });
  for (let i = 0; i < 38; i++) {
    const y = -0.248 + i * 0.0132;
    const front = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.18, y, 1.735),
      new THREE.Vector3(1.18, y, 1.735)
    ]);
    const right = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(1.235, y, -1.58),
      new THREE.Vector3(1.235, y, 1.58)
    ]);
    deckGroup.add(new THREE.Line(front, lineMaterial));
    deckGroup.add(new THREE.Line(right, lineMaterial));
  }
}

function addParticles() {
  const positions = new Float32Array(90 * 3);
  for (let i = 0; i < 90; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 4;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2.2;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 3.8;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xd7a84f, size: 0.035, transparent: true, opacity: 0, depthWrite: false });
  particles = new THREE.Points(geometry, material);
  scene.add(particles);
}

function addCutMarker() {
  const material = new THREE.MeshBasicMaterial({ color: 0xd7a84f, transparent: true, opacity: 0 });
  cutMarker = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.8, 3.65), material);
  cutMarker.position.y = 0.35;
  deckGroup.add(cutMarker);
}

function resize() {
  const rect = deckEl.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function setPhase(nextPhase) {
  phase = nextPhase;
  cutRatio = null;
  if (phase === 'cut') {
    targetRotation.set(-1.02, 0.16, -0.04);
    targetPosition.set(0, -0.18, 0.15);
  } else if (phase === 'shuffle' || phase === 'finalShuffle') {
    targetRotation.set(-0.22, 0.18, -0.08);
    targetPosition.set(0, 0.02, 0);
  } else {
    targetRotation.set(-0.18, 0.12, -0.08);
    targetPosition.set(0, 0, 0);
  }
}

function pulse() {
  pulsePower = Math.min(1, pulsePower + 0.55);
}

function cut(ratio) {
  cutRatio = ratio;
  cutMarker.position.x = THREE.MathUtils.lerp(-1.05, 1.05, ratio);
  cutMarker.material.opacity = 0.95;
}

function tick(now = performance.now()) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  const t = now * 0.001;

  pulsePower = Math.max(0, pulsePower - dt * 1.85);
  const shuffleMotion = (phase === 'shuffle' || phase === 'finalShuffle') ? pulsePower : 0;

  deckGroup.rotation.x += (targetRotation.x + Math.sin(t * 12) * 0.08 * shuffleMotion - deckGroup.rotation.x) * 0.09;
  deckGroup.rotation.y += (targetRotation.y + Math.cos(t * 15) * 0.18 * shuffleMotion - deckGroup.rotation.y) * 0.09;
  deckGroup.rotation.z += (targetRotation.z + Math.sin(t * 18) * 0.13 * shuffleMotion - deckGroup.rotation.z) * 0.09;
  deckGroup.position.lerp(targetPosition, 0.08);
  deckGroup.position.x += Math.sin(t * 28) * 0.018 * shuffleMotion;
  deckGroup.position.y += Math.cos(t * 22) * 0.015 * shuffleMotion;

  cardMeshes.forEach((card) => {
    const base = card.userData.base;
    const normalized = base.index / Math.max(1, base.count - 1);
    const split = cutRatio === null ? 0 : (normalized < cutRatio ? -1 : 1);
    const cutLift = cutRatio === null ? 0 : Math.abs(normalized - cutRatio) < 0.08 ? 0.045 : 0;
    card.position.x += (base.x + split * 0.12 - card.position.x) * 0.08;
    card.position.y += (base.y + cutLift + Math.sin(t * 19 + base.index) * 0.018 * shuffleMotion - card.position.y) * 0.12;
    card.position.z += (base.z + split * 0.035 - card.position.z) * 0.08;
    card.rotation.z += (base.rz + split * 0.018 + Math.sin(t * 20 + base.index) * 0.026 * shuffleMotion - card.rotation.z) * 0.1;
    card.rotation.y += (base.ry + split * 0.025 - card.rotation.y) * 0.08;
  });
  topCard.position.y += 0.055 * shuffleMotion;
  edgeBlock.scale.x = 1 + 0.012 * shuffleMotion;
  edgeBlock.scale.z = 1 + 0.01 * shuffleMotion;

  if (particles) {
    particles.material.opacity = Math.max(0, pulsePower * 0.58);
    particles.rotation.y += dt * (0.7 + pulsePower * 3);
    particles.rotation.z -= dt * 0.35;
  }

  if (cutMarker) {
    if (cutRatio === null) cutMarker.material.opacity *= 0.88;
    else cutMarker.material.opacity *= 0.94;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

init();

window.NatDeck3D = { setPhase, pulse, cut, resize };
