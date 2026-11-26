import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { BUILDING_GEO, BUILDING_META, DISTRICT_COLORS } from '../lib/cityConfig';
import type { Agent, Building } from '../lib/api';

interface Props {
  buildings: Building[];
  agents: Agent[];
  selectedSlug: string | null;
  onSelect: (slug: string | null) => void;
  night: boolean;
  reduced: boolean;
  focusSlug: string | null;
  resetSignal: number;
}

function makeWindowTexture(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#050508'; g.fillRect(0, 0, 128, 256);
  for (let y = 10; y < 244; y += 26) for (let x = 10; x < 116; x += 24) {
    if (Math.random() > 0.38) { g.fillStyle = Math.random() > 0.35 ? '#ffe9b0' : '#dbeafe'; g.globalAlpha = 0.75 + Math.random() * 0.25; g.fillRect(x, y, 14, 16); }
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function makeAgentLabel(name: string, role: string): THREE.Sprite {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(7,12,28,0.94)'; g.beginPath(); g.roundRect(18, 8, 476, 112, 24); g.fill();
  g.strokeStyle = 'rgba(75,210,255,0.95)'; g.lineWidth = 4; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 8;
  g.fillStyle = '#fff4cf'; g.font = 'bold 34px Georgia, serif'; g.fillText(name.toUpperCase(), 256, 45, 440);
  g.fillStyle = '#7de7ff'; g.font = 'bold 25px sans-serif'; g.fillText(role.toUpperCase(), 256, 88, 440);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  sp.scale.set(24, 6, 1); sp.renderOrder = 1200; return sp;
}

function makeLabel(text: string): THREE.Sprite {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(8,8,20,0.72)';
  g.beginPath(); g.roundRect(56, 14, 400, 62, 30); g.fill();
  g.strokeStyle = 'rgba(201,162,39,0.9)'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#f5e7c1'; g.font = 'bold 34px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 8; g.shadowOffsetY = 2;
  g.fillText(text.toUpperCase(), 256, 46, 380);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(20, 3.75, 1); return sp;
}

export default function City3D({ buildings, agents, selectedSlug, onSelect, night, reduced, focusSlug, resetSignal }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<any>(null);
  const propsRef = useRef({ night, reduced, selectedSlug });
  propsRef.current = { night, reduced, selectedSlug };
  useEffect(() => { if (stateRef.current) stateRef.current.setAgents(agents); }, [agents]);
  const nameBySlug = useRef<Record<string, string>>({});
  buildings.forEach(b => { nameBySlug.current[b.slug] = b.name; });

  useEffect(() => { if (stateRef.current) stateRef.current.focusOn(focusSlug); }, [focusSlug]);
  useEffect(() => { if (stateRef.current && resetSignal > 0) stateRef.current.resetCam(); }, [resetSignal]);
  useEffect(() => { if (stateRef.current) stateRef.current.setSelected(selectedSlug); }, [selectedSlug]);

  useEffect(() => {
    const mount = mountRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.06;
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'none'; renderer.domElement.style.display = 'block';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a1730);
    scene.fog = new THREE.Fog(0xa8c2e8, 250, 560);
    // Royal sky dome: sapphire gradient (dawn) → deep navy (night), one cheap draw
    const skyUni = { topColor: { value: new THREE.Color(0x35569e) }, bottomColor: { value: new THREE.Color(0xcfe0f5) }, offset: { value: 70 }, exponent: { value: 0.72 } };
    const sky = new THREE.Mesh(new THREE.SphereGeometry(820, 24, 12), new THREE.ShaderMaterial({ uniforms: skyUni, side: THREE.BackSide, depthWrite: false, fog: false, vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }', fragmentShader: 'uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent; varying vec3 vP; void main(){ float h = normalize(vP + vec3(0.0, offset, 0.0)).y; gl_FragColor = vec4(mix(bottomColor, topColor, pow(max(h, 0.0), exponent)), 1.0); }' }));
    scene.add(sky);
    const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 1000);

    const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x2a2438, 0.9); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
    sun.position.set(90, 130, 50); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -130; sun.shadow.camera.right = 130; sun.shadow.camera.top = 130; sun.shadow.camera.bottom = -130; sun.shadow.camera.far = 400;
    scene.add(sun);
    const moonGlow = new THREE.PointLight(0x8fb7ff, 0, 400); moonGlow.position.set(-60, 90, -40); scene.add(moonGlow);

    // Stars
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i++) { starPos[i * 3] = (Math.random() - 0.5) * 700; starPos[i * 3 + 1] = 120 + Math.random() * 200; starPos[i * 3 + 2] = (Math.random() - 0.5) * 700; }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.4, transparent: true, opacity: 0 }));
    scene.add(stars);

    // Ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(230, 230), new THREE.MeshStandardMaterial({ color: 0x232038, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

    // River (east) + banks — animated shimmer via scrolling stripe texture
    const waterC = document.createElement('canvas'); waterC.width = 128; waterC.height = 128;
    const wg = waterC.getContext('2d')!; wg.fillStyle = '#1d6fb8'; wg.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 46; i++) { wg.fillStyle = Math.random() > 0.5 ? 'rgba(180,225,255,0.35)' : 'rgba(10,60,120,0.35)'; wg.fillRect(Math.random() * 120, Math.random() * 128, 6 + Math.random() * 22, 2); }
    const waterTex = new THREE.CanvasTexture(waterC); waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping; waterTex.repeat.set(3, 26);
    const riverMat = new THREE.MeshStandardMaterial({ color: 0x9fc8ee, map: waterTex, roughness: 0.12, metalness: 0.55, emissive: 0x0a2d52, emissiveIntensity: 0.5 });
    const river = new THREE.Mesh(new THREE.PlaneGeometry(34, 230), riverMat);
    river.rotation.x = -Math.PI / 2; river.position.set(92, 0.12, 0); river.receiveShadow = true; scene.add(river);

    // Roads: avenues x=-46,-12,34,72 vertical; streets z=-50,-20,8,36,68 horizontal
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x17142a, roughness: 0.48, metalness: 0.18 }); // wet-road sheen
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xf5d97a, polygonOffset: true, polygonOffsetFactor: -2 });
    const vRoads = [-78, -46, -12, 33, 71]; const hRoads = [-80, -50, -20, 8, 38, 68, 78];
    const addPlane = (w: number, d: number, x: number, z: number, mat: any, y = 0.06) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; scene.add(m); return m; };
    vRoads.forEach(x => addPlane(7, 196, x, 2, roadMat));
    hRoads.forEach(z => addPlane(176, 7, -7, z, roadMat));
    vRoads.forEach(x => { for (let z = -90; z < 95; z += 8) addPlane(0.5, 3.4, x, z, dashMat, 0.1); });
    hRoads.forEach(z => { for (let x = -90; x < 78; x += 8) addPlane(3.4, 0.5, x, z, dashMat, 0.1); });
    // Crosswalks (zebra texture, one plane per intersection)
    const zebC = document.createElement('canvas'); zebC.width = 64; zebC.height = 64; const zg = zebC.getContext('2d')!; zg.clearRect(0, 0, 64, 64); zg.fillStyle = 'rgba(245,245,250,0.85)'; for (let i = 0; i < 4; i++) zg.fillRect(4 + i * 16, 6, 8, 52);
    const zebTex = new THREE.CanvasTexture(zebC);
    const zebMat = new THREE.MeshBasicMaterial({ map: zebTex, transparent: true, opacity: 0.8, polygonOffset: true, polygonOffsetFactor: -1 });
    vRoads.forEach(x => hRoads.forEach(z => { if (Math.abs(x + 12) < 2 && Math.abs(z - 8) < 2) return; addPlane(6.4, 6.4, x, z, zebMat, 0.085); }));
    // Bridges over river
    [-20, 38].forEach(z => { const b = new THREE.Mesh(new THREE.BoxGeometry(38, 1.2, 8), new THREE.MeshStandardMaterial({ color: 0x3d3654, roughness: 0.7 })); b.position.set(92, 1.4, z); b.castShadow = true; scene.add(b); });

    // Central plaza + fountain
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(13, 40), new THREE.MeshStandardMaterial({ color: 0x3a3358, roughness: 0.8 }));
    plaza.rotation.x = -Math.PI / 2; plaza.position.set(-12, 0.09, 8); plaza.receiveShadow = true; scene.add(plaza);
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.8, 1, 28), new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.7 }));
    basin.position.set(-12, 0.5, 8); basin.castShadow = true; scene.add(basin);
    const jet = new THREE.Mesh(new THREE.ConeGeometry(1.1, 5, 16), new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.75, emissive: 0x3b82f6, emissiveIntensity: 0.6 }));
    jet.position.set(-12, 3.4, 8); scene.add(jet);
    const jets = [jet];
    // District mini-fountains (Studio District park + Business park)
    [[-24, 104], [34, -66]].forEach(([fx, fz]) => { const b2 = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 0.8, 20), basin.material); b2.position.set(fx, 0.4, fz); b2.castShadow = true; scene.add(b2); const j2 = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.4, 12), jet.material); j2.position.set(fx, 2.4, fz); scene.add(j2); jets.push(j2); });

    // Parks
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x1d4028, roughness: 1 });
    addPlane(26, 20, -46, 66, parkMat, 0.07); addPlane(22, 16, 34, -66, parkMat, 0.07); addPlane(20, 14, -82, -34, parkMat, 0.07); addPlane(30, 13, -24, 104, parkMat, 0.07); addPlane(16, 14, -70, -92, parkMat, 0.07); addPlane(18, 12, 62, 76, parkMat, 0.07);

    // Trees (instanced)
    const treeSpots: [number, number][] = [];
    for (let i = 0; i < 130; i++) { const x = -95 + Math.random() * 170, z = -95 + Math.random() * 190; if (vRoads.some(r => Math.abs(r - x) < 6) || hRoads.some(r => Math.abs(r - z) < 6)) continue; if (BUILDING_GEO.some(b => Math.abs(b.x - x) < b.w / 2 + 4 && Math.abs(b.z - z) < b.d / 2 + 4)) continue; treeSpots.push([x, z]); }
    const trunkI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.3, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0x5b4028 }), treeSpots.length);
    const coneSpots = treeSpots.filter((_, i) => i % 3 === 0); const ballSpots = treeSpots.filter((_, i) => i % 3 === 1); const amberSpots = treeSpots.filter((_, i) => i % 3 === 2);
    const leafI = new THREE.InstancedMesh(new THREE.ConeGeometry(1.5, 3.6, 8), new THREE.MeshStandardMaterial({ color: 0x2e7d46, roughness: 0.9 }), Math.max(1, coneSpots.length));
    const ballI = new THREE.InstancedMesh(new THREE.SphereGeometry(1.55, 10, 8), new THREE.MeshStandardMaterial({ color: 0x49a35d, roughness: 0.95 }), Math.max(1, ballSpots.length));
    const amberI = new THREE.InstancedMesh(new THREE.SphereGeometry(1.35, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc98a3d, roughness: 0.95 }), Math.max(1, amberSpots.length));
    const m4 = new THREE.Matrix4();
    treeSpots.forEach(([x, z], i) => { const s = 0.8 + Math.random() * 0.7; m4.makeScale(s, s, s); m4.setPosition(x, 0.8 * s, z); trunkI.setMatrixAt(i, m4); });
    coneSpots.forEach(([x, z], i) => { const s = 0.8 + Math.random() * 0.7; m4.makeScale(s, s, s); m4.setPosition(x, 3.2 * s, z); leafI.setMatrixAt(i, m4); });
    ballSpots.forEach(([x, z], i) => { const s = 0.8 + Math.random() * 0.7; m4.makeScale(s, s, s); m4.setPosition(x, 2.9 * s, z); ballI.setMatrixAt(i, m4); });
    amberSpots.forEach(([x, z], i) => { const s = 0.8 + Math.random() * 0.7; m4.makeScale(s, s, s); m4.setPosition(x, 2.7 * s, z); amberI.setMatrixAt(i, m4); });
    trunkI.castShadow = leafI.castShadow = ballI.castShadow = amberI.castShadow = true; scene.add(trunkI, leafI, ballI, amberI);

    // Street lights (instanced glow spheres)
    const lampSpots: [number, number][] = [];
    vRoads.forEach(x => { for (let z = -88; z < 92; z += 16) lampSpots.push([x + 4.6, z]); });
    hRoads.forEach(z => { for (let x = -88; x < 74; x += 16) lampSpots.push([x, z + 4.6]); });
    [-20, 38].forEach(z => { for (let x = 76; x <= 108; x += 8) lampSpots.push([x, z - 3.2]); }); // bridge lights
    const lampI = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a3 }), lampSpots.length);
    lampSpots.forEach(([x, z], i) => { m4.identity(); m4.setPosition(x, 4.4, z); lampI.setMatrixAt(i, m4); });
    scene.add(lampI);
    const poleI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.09, 4.4, 5), new THREE.MeshStandardMaterial({ color: 0x44445a }), lampSpots.length);
    lampSpots.forEach(([x, z], i) => { m4.identity(); m4.setPosition(x, 2.2, z); poleI.setMatrixAt(i, m4); });
    scene.add(poleI);

    // Buildings
    const winTex = makeWindowTexture();
    const groups = new Map<string, THREE.Group>();
    const clickMeshes: THREE.Object3D[] = [];
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.8, emissive: 0x6b5207, emissiveIntensity: 0.5 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.1, metalness: 0.4, transparent: true, opacity: 0.75, emissive: 0x2563eb, emissiveIntensity: 0.35 });

    const windowMats: THREE.MeshStandardMaterial[] = [];
    const buildShape = (geo: typeof BUILDING_GEO[0]) => {
      const g = new THREE.Group();
      const tex = winTex.clone(); tex.needsUpdate = true; tex.repeat.set(Math.max(1, Math.round(geo.w / 10)), Math.max(1, Math.round(geo.h / 13)));
      const bodyMat = new THREE.MeshStandardMaterial({ color: geo.color, roughness: 0.42 + (geo.slug.length % 5) * 0.07, metalness: 0.3 + (geo.slug.length % 4) * 0.09, emissive: new THREE.Color(geo.emissive), emissiveIntensity: 0.38, emissiveMap: tex });
      windowMats.push(bodyMat);
      const roofMat = new THREE.MeshStandardMaterial({ color: geo.roof, roughness: 0.4, metalness: 0.5, emissive: new THREE.Color(geo.roof), emissiveIntensity: 0.25 });
      const box = (w: number, h: number, d: number, x: number, y: number, z: number, mat: any = bodyMat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
      const { w, d, h } = geo;
      // Front offset per silhouette — round towers get doors ON the curve, never floating/buried
      const roundFront: Record<string, number> = { observatory: w * 0.5, theatre: w * 0.47, cartoon: w * 0.47, techresearch: w * 0.48, lighthouse: d * 0.35 };
      const frontZ = roundFront[geo.shape] ?? d / 2;
      const doorX = geo.shape === 'lighthouse' ? w * 0.55 : 0;
      // podium + entrance for every building
      box(w + 4, 0.7, d + 4, 0, 0.35, 0, new THREE.MeshStandardMaterial({ color: 0x35304e, roughness: 0.9 }));
      const door = box(3.2, 3.4, 0.5, doorX, 1.7, frontZ + 0.12, glass); door.castShadow = false;
      box(4.4, 0.4, 1.6, doorX, 3.7, frontZ + 0.5, gold); // entrance canopy (mounted on facade)
      // District accent trim — glowing plinth strip in the district colour
      const accent = new THREE.Color(DISTRICT_COLORS[BUILDING_META[geo.slug]?.district || ''] || '#c9a227');
      const trim = new THREE.Mesh(new THREE.BoxGeometry((roundFront[geo.shape] ? w * 0.66 : w * 0.94), 0.3, 0.14), new THREE.MeshBasicMaterial({ color: accent }));
      trim.position.set(doorX, 1.02, frontZ + 0.1); g.add(trim);
      switch (geo.shape) {
        case 'palace': {
          box(w, h * 0.55, d, 0, h * 0.275 + 0.7, 0); box(w * 0.62, h * 0.3, d * 0.8, 0, h * 0.7 + 0.7, 0);
          const dome = new THREE.Mesh(new THREE.SphereGeometry(w * 0.24, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), gold); dome.position.y = h * 0.85 + 0.7; dome.castShadow = true; g.add(dome);
          [-w / 2 + 1.5, w / 2 - 1.5].forEach(x => { const t = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, h * 0.8, 10), bodyMat); t.position.set(x, h * 0.4 + 0.7, 0); t.castShadow = true; g.add(t); const cap = new THREE.Mesh(new THREE.ConeGeometry(2, 3.4, 10), gold); cap.position.set(x, h * 0.8 + 2.3, 0); g.add(cap); });
          for (let i = -3; i <= 3; i++) { if (!i) continue; const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, h * 0.5, 8), gold); col.position.set(i * 3.2, h * 0.25 + 0.7, d / 2 + 1.1); g.add(col); }
          break; }
        case 'tower': case 'spire': {
          box(w, h, d, 0, h / 2 + 0.7, 0); box(w * 0.7, h * 0.16, d * 0.7, 0, h + h * 0.08 + 0.7, 0, roofMat);
          const sp = new THREE.Mesh(new THREE.ConeGeometry(0.7, geo.shape === 'spire' ? 10 : 6, 6), gold); sp.position.y = h + h * 0.16 + (geo.shape === 'spire' ? 5 : 3) + 0.7; g.add(sp);
          const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 10), new THREE.MeshBasicMaterial({ color: 0xff5566 })); beacon.position.y = sp.position.y + (geo.shape === 'spire' ? 5 : 3); beacon.name = 'beacon'; g.add(beacon);
          break; }
        case 'fortress': {
          box(w, h, d, 0, h / 2 + 0.7, 0);
          [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2, h + 3, 8), bodyMat); t.position.set(sx * (w / 2 - 0.5), (h + 3) / 2 + 0.7, sz * (d / 2 - 0.5)); t.castShadow = true; g.add(t); });
          box(w * 0.5, 2.2, d * 0.5, 0, h + 1.8, 0, roofMat); break; }
        case 'lab': {
          box(w, h, d, 0, h / 2 + 0.7, 0);
          const dome = new THREE.Mesh(new THREE.SphereGeometry(w * 0.26, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass); dome.position.set(-w * 0.2, h + 0.7, 0); g.add(dome);
          const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 6, 8), roofMat); stack.position.set(w * 0.32, h + 3.4, -d * 0.25); g.add(stack); break; }
        case 'vault': {
          box(w, h, d, 0, h / 2 + 0.7, 0, new THREE.MeshStandardMaterial({ color: geo.color, roughness: 0.35, metalness: 0.7, emissive: new THREE.Color(geo.emissive), emissiveIntensity: 0.3, emissiveMap: winTex }));
          const pyr = new THREE.Mesh(new THREE.ConeGeometry(w * 0.42, 4.5, 4), roofMat); pyr.rotation.y = Math.PI / 4; pyr.position.y = h + 2.9; pyr.castShadow = true; g.add(pyr);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.35, 10, 28), gold); ring.position.set(0, 3.4, d / 2 + 0.6); g.add(ring); break; }
        case 'academy': {
          box(w, h * 0.8, d, 0, h * 0.4 + 0.7, 0);
          const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.62, 3.6, 4), roofMat); roof.rotation.y = Math.PI / 4; roof.scale.z = d / w; roof.position.y = h * 0.8 + 2.4; roof.castShadow = true; g.add(roof);
          for (let i = -2; i <= 2; i++) { if (!i) continue; const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, h * 0.72, 8), new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.8 })); col.position.set(i * (w / 5), h * 0.36 + 0.7, d / 2 + 1.2); col.castShadow = true; g.add(col); }
          box(w * 0.9, 0.6, 2.2, 0, h * 0.74 + 0.7, d / 2 + 1.2, roofMat); break; }
        case 'library': {
          // Grand Library: ivory-column portico + reading-hall dome + glowing book-spine strips (no shared academy roof)
          box(w, h * 0.74, d, 0, h * 0.37 + 0.7, 0);
          const ivory = new THREE.MeshStandardMaterial({ color: 0xf1e8d2, roughness: 0.65 });
          for (let i = -3; i <= 3; i++) { if (!i) continue; const col = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, h * 0.68, 8), ivory); col.position.set(i * (w / 6.4), h * 0.34 + 0.7, d / 2 + 1.35); col.castShadow = true; g.add(col); }
          box(w * 0.94, 0.7, 2.4, 0, h * 0.7 + 0.7, d / 2 + 1.35, ivory); // entablature the columns actually carry
          const drum = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.24, w * 0.27, 1.7, 18), ivory); drum.position.y = h * 0.74 + 1.55; drum.castShadow = true; g.add(drum);
          const dome = new THREE.Mesh(new THREE.SphereGeometry(w * 0.25, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2c4f9e, roughness: 0.3, metalness: 0.55, emissive: 0x16305f, emissiveIntensity: 0.5 })); dome.position.y = h * 0.74 + 2.4; dome.castShadow = true; g.add(dome); // sapphire dome
          const fin = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), gold); fin.position.y = h * 0.74 + 2.4 + w * 0.25 + 0.4; g.add(fin);
          const spineCols = [0xffd97a, 0xffb26b, 0xfff3c4, 0xffc978];
          [0.2, 0.4, 0.6].forEach((f, li) => { for (let i = 0; i < 7; i++) { if (i === 3) continue; const sp = new THREE.Mesh(new THREE.BoxGeometry(w / 9.5, 0.85, 0.12), new THREE.MeshBasicMaterial({ color: spineCols[(i + li) % spineCols.length] })); sp.position.set(-w / 2 + (i + 0.5) * (w / 7), h * f + 0.7, d / 2 + 0.08); g.add(sp); } });
          break; }
        case 'garage': {
          box(w, h, d, 0, h / 2 + 0.7, 0); box(w * 0.9, 0.5, d * 0.9, 0, h + 0.95, 0, roofMat);
          box(6, 4.4, 0.4, -w * 0.22, 2.2, d / 2 + 0.15, new THREE.MeshStandardMaterial({ color: 0x777788, roughness: 0.4, metalness: 0.7 }));
          const crane = box(0.5, 7, 0.5, w * 0.36, h + 3.4, 0, gold); crane.castShadow = true; box(6, 0.5, 0.5, w * 0.36 - 2.5, h + 6.6, 0, gold); break; }
        case 'observatory': {
          const base = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.46, w * 0.52, h, 18), bodyMat); base.position.y = h / 2 + 0.7; base.castShadow = true; g.add(base);
          const dome = new THREE.Mesh(new THREE.SphereGeometry(w * 0.44, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2), roofMat); dome.position.y = h + 0.7; dome.castShadow = true; g.add(dome);
          const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 6, 8), gold); scope.position.set(1.6, h + 3.4, 0); scope.rotation.z = -0.8; g.add(scope); break; }
        case 'eco': {
          let y = 0.7; const tiers = 4;
          for (let i = 0; i < tiers; i++) { const th = h / tiers; const s = 1 - i * 0.13; box(w * s, th, d * s, 0, y + th / 2, 0); const gr = new THREE.Mesh(new THREE.BoxGeometry(w * s + 1.4, 0.5, d * s + 1.4), new THREE.MeshStandardMaterial({ color: 0x2e7d46, roughness: 1 })); gr.position.y = y + th; gr.castShadow = true; g.add(gr); y += th; }
          const top = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10), new THREE.MeshStandardMaterial({ color: 0x3fa45c, roughness: 1 })); top.position.y = y + 1.6; g.add(top); break; }
        case 'nexus': {
          box(w, h * 0.6, d, 0, h * 0.3 + 0.7, 0);
          const orbY = h * 0.6 + w * 0.28 + 0.7;
          const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.85, Math.max(0.4, orbY - w * 0.26 - (h * 0.6 + 0.7)), 8), gold); ped.position.y = (h * 0.6 + 0.7 + orbY - w * 0.26) / 2; g.add(ped);
          const orb = new THREE.Mesh(new THREE.SphereGeometry(w * 0.3, 22, 16), new THREE.MeshStandardMaterial({ color: geo.roof, roughness: 0.2, metalness: 0.4, emissive: new THREE.Color(geo.roof), emissiveIntensity: 0.9, transparent: true, opacity: 0.92 })); orb.position.y = orbY; orb.name = 'orb'; g.add(orb);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(w * 0.42, 0.35, 8, 36), gold); ring.position.y = orb.position.y; ring.rotation.x = Math.PI / 2.4; ring.name = 'ring'; g.add(ring); break; }
        case 'studio': {
          box(w, h, d, 0, h / 2 + 0.7, 0); box(w * 0.55, h * 0.4, d * 0.7, w * 0.16, h + h * 0.2 + 0.7, 0, roofMat);
          const dish = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3, metalness: 0.5, side: THREE.DoubleSide })); dish.position.set(-w * 0.3, h + 2.4, 0); dish.rotation.x = 2.4; g.add(dish);
          const sign = box(7, 2.4, 0.3, 0, h * 0.72, d / 2 + 0.3, new THREE.MeshBasicMaterial({ color: 0xff4455 })); sign.name = 'onair'; break; }
        case 'hub': {
          box(w, h * 0.55, d, 0, h * 0.275 + 0.7, 0); box(w * 0.72, h * 0.45, d * 0.72, 0, h * 0.775 + 0.7, 0);
          box(4.8, 4.8, 0.35, 0, h * 0.78 + 0.7, d * 0.36 + 0.08, new THREE.MeshStandardMaterial({ color: 0x1a1426, roughness: 0.35, metalness: 0.3 })); // mounted plaque (no floating triangle)
          const play = new THREE.Mesh(new THREE.ConeGeometry(1.45, 2.5, 3), new THREE.MeshBasicMaterial({ color: 0xffa53b })); play.rotation.z = -Math.PI / 2; play.scale.z = 0.22; play.position.set(0.18, h * 0.78 + 0.7, d * 0.36 + 0.38); g.add(play); break; }
        case 'theatre': {
          const drum = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.44, w * 0.48, h, 22), bodyMat); drum.position.y = h / 2 + 0.7; drum.castShadow = true; g.add(drum);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(w * 0.5, 3.4, 22), roofMat); cap.position.y = h + 2.4; cap.castShadow = true; g.add(cap);
          box(w * 0.6, h * 0.55, 2.6, 0, h * 0.275 + 0.7, w * 0.44 + 0.8, roofMat); break; }
        case 'exchange': {
          box(w, h * 0.75, d, 0, h * 0.375 + 0.7, 0);
          const pyr = new THREE.Mesh(new THREE.ConeGeometry(w * 0.6, h * 0.3, 4), glass); pyr.rotation.y = Math.PI / 4; pyr.position.y = h * 0.75 + h * 0.15 + 0.7; g.add(pyr);
          const piv = new THREE.Group(); piv.position.set(0, h * 0.5, d / 2 + 0.32); piv.name = 'spinY'; const coin = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.4, 20), gold); coin.rotation.x = Math.PI / 2; piv.add(coin); g.add(piv); break; }
        case 'clinic': {
          box(w, h, d, 0, h / 2 + 0.7, 0, new THREE.MeshStandardMaterial({ color: 0xdfe7ee, roughness: 0.6, emissive: 0x93c5fd, emissiveIntensity: 0.25, emissiveMap: winTex }));
          const red = new THREE.MeshBasicMaterial({ color: 0xef4444 });
          box(0.9, 3.4, 0.3, 0, h * 0.68, d / 2 + 0.25, red); box(3.4, 0.9, 0.3, 0, h * 0.68, d / 2 + 0.25, red);
          box(w * 0.8, 0.5, d * 0.8, 0, h + 0.95, 0, roofMat); break; }
        case 'transport': {
          box(w, h * 0.6, d, 0, h * 0.3 + 0.7, 0);
          const vaultRoof = new THREE.Mesh(new THREE.CylinderGeometry(d * 0.52, d * 0.52, w, 14, 1, false, 0, Math.PI), glass); vaultRoof.rotation.z = Math.PI / 2; vaultRoof.rotation.y = Math.PI / 2; vaultRoof.position.y = h * 0.6 + 0.7; g.add(vaultRoof);
          box(w * 0.3, 3.4, 0.4, 0, 1.7, d / 2 + 0.2, glass); break; }
        case 'lighthouse': {
          const shaft = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.22, w * 0.34, h, 14), bodyMat); shaft.position.y = h / 2 + 0.7; shaft.castShadow = true; g.add(shaft);
          [0.3, 0.55, 0.8].forEach(f => { const band = new THREE.Mesh(new THREE.CylinderGeometry(w * (0.36 - f * 0.13), w * (0.37 - f * 0.13), 2.2, 14), new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 })); band.position.y = h * f + 0.7; g.add(band); });
          const lamp = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 12), new THREE.MeshBasicMaterial({ color: 0xffe98a })); lamp.position.y = h + 2; lamp.name = 'beacon'; g.add(lamp);
          const beamPivot = new THREE.Group(); beamPivot.position.y = h + 2; beamPivot.name = 'beamPivot'; const beam = new THREE.Mesh(new THREE.ConeGeometry(3.4, 26, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe98a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })); beam.rotation.z = Math.PI / 2; beam.position.set(13, 0, 0); beamPivot.add(beam); g.add(beamPivot);
          box(w * 0.9, 4, d * 0.7, w * 0.55, 2.7, 0); break; }
        case 'gamestudio': {
          box(w, h * 0.75, d, 0, h * 0.375 + 0.7, 0); box(w * 0.7, h * 0.25, d * 0.7, 0, h * 0.875 + 0.7, 0, roofMat);
          box(5.8, 0.3, 5.8, 0, h + 0.82, 0, roofMat); // button plate so spheres sit, not hover
          [0xff5566, 0x55ccff, 0xffdd55, 0x66ff99].forEach((c, i) => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), new THREE.MeshBasicMaterial({ color: c })); s.position.set(i % 2 === 0 ? -1.35 : 1.35, h + 1.55, i < 2 ? -1.35 : 1.35); g.add(s); });
          box(0.8, 3, 0.3, -w * 0.3, h * 0.45, d / 2 + 0.3, gold); box(3, 0.8, 0.3, -w * 0.3, h * 0.45, d / 2 + 0.3, gold); break; }
        case 'anime': {
          box(w, h, d, 0, h / 2 + 0.7, 0);
          const torii = new THREE.MeshStandardMaterial({ color: 0xdc2645, roughness: 0.5 });
          [-3, 3].forEach(x => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 4.4, 8), torii); p.position.set(x, h + 2.9, d * 0.28); g.add(p); });
          const beamT = box(9.5, 0.7, 0.9, 0, h + 5.2, d * 0.28, torii); beamT.castShadow = true; box(7.4, 0.5, 0.7, 0, h + 4.1, d * 0.28, torii);
          const sakura = new THREE.Mesh(new THREE.SphereGeometry(2.1, 12, 10), new THREE.MeshStandardMaterial({ color: 0xf9a8d4, roughness: 1 })); sakura.position.set(w / 2 + 1.4, 3.2, d / 2 - 1); g.add(sakura); break; }
        case 'cartoon': {
          const drum = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.44, w * 0.48, h * 0.8, 16), bodyMat); drum.position.y = h * 0.4 + 0.7; drum.castShadow = true; g.add(drum);
          const hat = new THREE.Mesh(new THREE.ConeGeometry(2.6, 4.6, 12), roofMat); hat.position.set(1.4, h * 0.8 + 3, 0); hat.rotation.z = 0.22; hat.castShadow = true; g.add(hat);
          const pom = new THREE.Mesh(new THREE.SphereGeometry(0.8, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff5566 })); pom.position.set(2.35, h * 0.8 + 5.4, 0); g.add(pom); break; }
        case 'movie': {
          box(w, h, d, 0, h / 2 + 0.7, 0);
          [-w * 0.22, w * 0.22].forEach(x => { const reel = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.5, 20), new THREE.MeshStandardMaterial({ color: 0xd7dce6, roughness: 0.3, metalness: 0.7 })); reel.rotation.x = Math.PI / 2; reel.position.set(x, h * 0.68, d / 2 + 0.45); g.add(reel); const hub2 = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.7, 10), gold); hub2.rotation.x = Math.PI / 2; hub2.position.copy(reel.position); g.add(hub2); });
          box(0.4, 1.5, 0.4, -2.4, h + 1.35, 0, gold); box(0.4, 1.5, 0.4, 2.4, h + 1.35, 0, gold); // clapperboard legs (was floating)
          const clap = box(6.4, 0.5, 2.2, 0, h + 2.25, 0, new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.5 })); clap.rotation.z = 0.1; break; }
        case 'vfx': {
          box(w, h * 0.8, d, 0, h * 0.4 + 0.7, 0);
          const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.65, 1.5, 8), gold); ped.position.y = h * 0.8 + 1.35; g.add(ped);
          const orb = new THREE.Mesh(new THREE.SphereGeometry(2, 18, 14), new THREE.MeshStandardMaterial({ color: geo.roof, emissive: new THREE.Color(geo.roof), emissiveIntensity: 0.9, roughness: 0.2 })); orb.position.y = h * 0.8 + 3.4; orb.name = 'orb'; g.add(orb);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.28, 8, 32), gold); ring.position.y = orb.position.y; ring.rotation.x = Math.PI / 2.6; ring.name = 'ring'; g.add(ring);
          const ring2 = new THREE.Mesh(new THREE.TorusGeometry(4.1, 0.2, 8, 32), roofMat); ring2.position.y = orb.position.y; ring2.rotation.x = Math.PI / 1.7; ring2.name = 'ring'; g.add(ring2); break; }
        case 'arcade': {
          box(w, h, d, 0, h / 2 + 0.7, 0); box(w * 0.85, 0.5, d * 0.85, 0, h + 0.95, 0, roofMat);
          const sign = box(8, 2.2, 0.3, 0, h * 0.74, d / 2 + 0.3, new THREE.MeshBasicMaterial({ color: 0xd946ef })); sign.name = 'onair';
          const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 3.2, 8), gold); stick.position.set(w * 0.3, h + 2.2, 0); stick.rotation.z = -0.3; g.add(stick);
          const ball = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff3355 })); ball.position.set(w * 0.3 + 0.95, h + 3.7, 0); g.add(ball); break; }
        case 'award': {
          box(w, h * 0.7, d, 0, h * 0.35 + 0.7, 0); box(w * 0.6, h * 0.3, d * 0.6, 0, h * 0.85 + 0.7, 0, roofMat);
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 2.6, 10), gold); stem.position.y = h + 2; g.add(stem);
          const cup = new THREE.Mesh(new THREE.SphereGeometry(1.9, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.6), gold); cup.position.y = h + 3.2; cup.rotation.x = Math.PI; g.add(cup);
          const star = new THREE.Mesh(new THREE.ConeGeometry(1.2, 2.6, 5), new THREE.MeshBasicMaterial({ color: 0xffe98a })); star.position.y = h + 5.6; star.name = 'beacon'; g.add(star);
          const carpet = box(4.6, 0.12, 6, 0, 0.92, d / 2 + 3.4, new THREE.MeshStandardMaterial({ color: 0xb91c3d, roughness: 0.9 })); carpet.castShadow = false; break; }
        case 'review': {
          box(w, h, d, 0, h / 2 + 0.7, 0); box(w * 0.66, 1.6, d * 0.66, 0, h + 1.5, 0, roofMat);
          for (let i = 0; i < 5; i++) { const st = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.5, 5), i < 4 ? new THREE.MeshBasicMaterial({ color: 0xffd75e }) : new THREE.MeshStandardMaterial({ color: 0x8a8a9a })); st.position.set(-3.6 + i * 1.8, h * 0.72, d / 2 + 0.55); g.add(st); }
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 6), gold); pole.position.y = h + 2.5; g.add(pole);
          const big = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.2, 5), gold); big.position.y = h + 4.6; big.name = 'spinY'; g.add(big); break; }
        case 'bank': {
          box(w, h * 0.78, d, 0, h * 0.39 + 0.7, 0);
          const ped = new THREE.Mesh(new THREE.ConeGeometry(w * 0.58, 2.6, 4), roofMat); ped.rotation.y = Math.PI / 4; ped.scale.z = 0.55; ped.position.y = h * 0.78 + 2; ped.castShadow = true; g.add(ped);
          for (let i = -2; i <= 2; i++) { if (!i) continue; const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, h * 0.7, 8), new THREE.MeshStandardMaterial({ color: 0xf3ead2, roughness: 0.75 })); col.position.set(i * (w / 5.2), h * 0.35 + 0.7, d / 2 + 1.3); col.castShadow = true; g.add(col); }
          const piv = new THREE.Group(); piv.position.set(0, h * 0.52, d / 2 + 0.34); piv.name = 'spinY'; const coin = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.4, 22), gold); coin.rotation.x = Math.PI / 2; piv.add(coin); g.add(piv); break; }
        case 'vyom': {
          box(w, h, d, 0, h / 2 + 0.7, 0);
          const vmat = new THREE.MeshStandardMaterial({ color: geo.roof, emissive: new THREE.Color(geo.roof), emissiveIntensity: 0.55, roughness: 0.4 });
          const v1 = box(0.8, 5.4, 0.8, -1.35, h + 3.2, 0, vmat); v1.rotation.z = 0.42; const v2 = box(0.8, 5.4, 0.8, 1.35, h + 3.2, 0, vmat); v2.rotation.z = -0.42;
          const crane = box(0.45, 6.4, 0.45, w * 0.38, h + 3, -d * 0.2, gold); crane.castShadow = true; box(5.6, 0.45, 0.45, w * 0.38 - 2.3, h + 6, -d * 0.2, gold); break; }
        case 'automation': {
          box(w, h, d, 0, h / 2 + 0.7, 0);
          const nodeM = new THREE.MeshStandardMaterial({ color: geo.roof, emissive: new THREE.Color(geo.roof), emissiveIntensity: 0.8, roughness: 0.3 });
          [[-w * 0.3, -d * 0.25], [w * 0.28, -d * 0.1], [-w * 0.12, d * 0.28], [w * 0.32, d * 0.26]].forEach(([x, z], i) => { const n = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), nodeM); n.position.set(x, h + 1.6 + (i % 2) * 0.9, z); if (i === 0) n.name = 'orb'; g.add(n); });
          box(w * 0.6, 0.18, 0.18, 0, h + 2.1, -d * 0.18, gold); box(0.18, 0.18, d * 0.5, w * 0.3, h + 2.1, d * 0.08, gold); break; }
        case 'ecc': {
          box(w * 0.42, h, d * 0.8, -w * 0.26, h / 2 + 0.7, 0); box(w * 0.42, h * 0.72, d * 0.8, w * 0.26, h * 0.36 + 0.7, 0);
          box(w * 0.3, 1.4, d * 0.4, 0, h * 0.66, 0, roofMat);
          const bc = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfb923c })); bc.position.set(-w * 0.26, h + 1.6, 0); bc.name = 'beacon'; g.add(bc); break; }
        case 'app': {
          box(w, h * 0.22, d, 0, h * 0.11 + 0.7, 0);
          const phone = box(w * 0.5, h * 0.78, d * 0.34, 0, h * 0.61 + 0.7, 0, new THREE.MeshStandardMaterial({ color: 0x11182b, roughness: 0.25, metalness: 0.6 })); phone.castShadow = true;
          box(w * 0.42, h * 0.62, 0.25, 0, h * 0.64 + 0.7, d * 0.17 + 0.15, glass);
          const home = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), gold); home.position.set(0, h * 0.3, d * 0.17 + 0.3); g.add(home); break; }
        case 'website': {
          box(w, h * 0.82, d, 0, h * 0.41 + 0.7, 0);
          box(w * 0.94, 1.5, 0.35, 0, h * 0.76, d / 2 + 0.25, new THREE.MeshStandardMaterial({ color: 0xe8ecf5, roughness: 0.5 }));
          [0xff5566, 0xffdd55, 0x66ff99].forEach((c, i) => { const s = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 8), new THREE.MeshBasicMaterial({ color: c })); s.position.set(-w * 0.36 + i * 1.15, h * 0.76, d / 2 + 0.5); g.add(s); });
          const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 1.6, 8), gold); stand.position.y = h * 0.82 + 1.3; g.add(stand);
          const globe = new THREE.Mesh(new THREE.SphereGeometry(2, 14, 10), glass); globe.position.y = h * 0.82 + 3.3; globe.name = 'spinY'; g.add(globe); break; }
        case 'portfolio': {
          box(w, h, d, 0, h / 2 + 0.7, 0);
          [-0.28, 0, 0.28].forEach((f, i) => { const fr = box(3.4, 4.4 - i * 0.5, 0.28, w * f, h * 0.58, d / 2 + 0.3, gold); fr.rotation.z = (i - 1) * 0.09; const inner = box(2.7, 3.6 - i * 0.5, 0.3, w * f, h * 0.58, d / 2 + 0.32, new THREE.MeshBasicMaterial({ color: [0xfda4af, 0xa5b4fc, 0xfde68a][i] })); inner.rotation.z = (i - 1) * 0.09; });
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 1.7, 6), gold); pole.position.y = h + 1.45; g.add(pole);
          const star = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 5), gold); star.position.y = h + 3.2; star.name = 'spinY'; g.add(star); break; }
        case 'securitylab': {
          box(w, h, d, 0, h / 2 + 0.7, 0, new THREE.MeshStandardMaterial({ color: geo.color, roughness: 0.35, metalness: 0.65, emissive: new THREE.Color(geo.emissive), emissiveIntensity: 0.3, emissiveMap: tex }));
          const shackle = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.42, 8, 20, Math.PI), gold); shackle.position.set(0, h * 0.66, d / 2 + 0.6); g.add(shackle);
          box(4.6, 3.6, 0.5, 0, h * 0.5, d / 2 + 0.55, gold);
          const key = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0x111827 })); key.position.set(0, h * 0.54, d / 2 + 0.9); g.add(key);
          const bc = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff4455 })); bc.position.y = h + 1.6; bc.name = 'beacon'; g.add(bc); break; }
        case 'clonelab': {
          box(w * 0.44, h, d * 0.85, -w * 0.27, h / 2 + 0.7, 0); // original tower
          // "Clone" twin: solid dark-glass duplicate + ONE EdgesGeometry outline (no wireframe diagonals, no coplanar inner box)
          const twinGeo = new THREE.BoxGeometry(w * 0.44, h, d * 0.85);
          const twin = new THREE.Mesh(twinGeo, new THREE.MeshStandardMaterial({ color: 0x0e2233, roughness: 0.12, metalness: 0.55, transparent: true, opacity: 0.9, emissive: new THREE.Color(geo.roof), emissiveIntensity: 0.16, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
          twin.position.set(w * 0.27, h / 2 + 0.7, 0); twin.castShadow = true; g.add(twin);
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(twinGeo), new THREE.LineBasicMaterial({ color: geo.roof }));
          edges.scale.setScalar(1.012); edges.position.copy(twin.position); g.add(edges);
          box(2.6, 0.5, 0.5, 0, h * 0.62, d * 0.2, gold); const ah = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.4, 6), gold); ah.rotation.z = -Math.PI / 2; ah.position.set(1.9, h * 0.62, d * 0.2); g.add(ah); break; }
        case 'techresearch': {
          const base = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.42, w * 0.5, h * 0.72, 14), bodyMat); base.position.y = h * 0.36 + 0.7; base.castShadow = true; g.add(base);
          box(w * 0.7, h * 0.28, d * 0.7, 0, h * 0.86 + 0.7, 0, roofMat);
          const pivot = new THREE.Group(); pivot.position.y = h + 2.6; pivot.name = 'beamPivot';
          const dish = new THREE.Mesh(new THREE.SphereGeometry(2.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 3), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3, metalness: 0.5, side: THREE.DoubleSide })); dish.rotation.x = 2.5; pivot.add(dish);
          const sweep = new THREE.Mesh(new THREE.ConeGeometry(2.6, 15, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })); sweep.rotation.z = Math.PI / 2; sweep.position.x = 7.5; pivot.add(sweep); g.add(pivot); break; }
        default: box(w, h, d, 0, h / 2 + 0.7, 0);
      }
      return g;
    };

    const labelSprites: { s: THREE.Sprite; slug: string; x: number; y: number; z: number }[] = [];
    const agentSprites: { s: THREE.Sprite; marker: THREE.Group; slug: string; x: number; y: number; z: number; baseY: number; agent: Agent }[] = [];
    BUILDING_GEO.forEach(geo => {
      const g = buildShape(geo);
      g.position.set(geo.x, 0, geo.z);
      g.traverse(o => { o.userData.slug = geo.slug; if ((o as THREE.Mesh).isMesh) clickMeshes.push(o); });
      const label = makeLabel(nameBySlug.current[geo.slug] || BUILDING_META[geo.slug]?.name || geo.slug.replace(/-/g, ' '));
      label.position.set(geo.x, geo.h + 8, geo.z); label.name = 'label-' + geo.slug; scene.add(label);
      labelSprites.push({ s: label, slug: geo.slug, x: geo.x, y: geo.h + 8, z: geo.z });
      scene.add(g); groups.set(geo.slug, g);
    });

    // Selection ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.18, 40), new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.25; ring.visible = false; scene.add(ring);

    // Cars
    const carColors = [0xef4444, 0x3b82f6, 0xfacc15, 0xe2e8f0, 0xa855f7, 0x22c55e, 0xf97316];
    interface Car { mesh: THREE.Group; route: [number, number][]; seg: number; t: number; speed: number; }
    const cars: Car[] = [];
    const mkCar = (color: number) => { const g = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 1.7), new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6 })); b.position.y = 0.65; b.castShadow = true; g.add(b); const top = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.7, 1.5), glass); top.position.y = 1.35; g.add(top); const hl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), new THREE.MeshBasicMaterial({ color: 0xfff6c9 })); hl.position.set(1.75, 0.7, 0.5); g.add(hl); const hl2 = hl.clone(); hl2.position.z = -0.5; g.add(hl2); return g; };
    const loopA: [number, number][] = [[-46, -50], [33, -50], [33, 38], [-46, 38]];
    const loopB: [number, number][] = [[-12, 68], [-12, -20], [71, -20], [71, 68]];
    const loopC: [number, number][] = [[71, 8], [-46, 8], [-46, -88], [71, -88]];
    [loopA, loopB, loopC].forEach((route, ri) => { const n = ri === 0 ? 5 : 4; for (let i = 0; i < n; i++) { const mesh = mkCar(carColors[(ri * 3 + i) % carColors.length]); scene.add(mesh); cars.push({ mesh, route, seg: i % route.length, t: Math.random(), speed: 0.11 + Math.random() * 0.1 }); } });

    // Citizens (simulated people)
    const skinTones = [0xf2c9a0, 0xd9a066, 0x8d5524, 0xffdbb4];
    const outfit = [0xc9a227, 0x3b82f6, 0xec4899, 0x22c55e, 0xa855f7, 0xef4444, 0xe2e8f0, 0xf97316];
    interface Person { g: THREE.Group; from: THREE.Vector3; to: THREE.Vector3; t: number; speed: number; phase: number; }
    const people: Person[] = [];
    const walkPoint = () => { const onV = Math.random() > 0.5; if (onV) { const x = vRoads[Math.floor(Math.random() * vRoads.length)] + (Math.random() > 0.5 ? 5.2 : -5.2); return new THREE.Vector3(x, 0, -88 + Math.random() * 178); } const z = hRoads[Math.floor(Math.random() * hRoads.length)] + (Math.random() > 0.5 ? 5.2 : -5.2); return new THREE.Vector3(-90 + Math.random() * 160, 0, z); };
    const mkPerson = () => { const g = new THREE.Group(); const c = outfit[Math.floor(Math.random() * outfit.length)]; const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.05, 8), new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })); body.position.y = 0.85; body.castShadow = true; g.add(body); const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), new THREE.MeshStandardMaterial({ color: skinTones[Math.floor(Math.random() * skinTones.length)], roughness: 0.7 })); head.position.y = 1.68; g.add(head); const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.55, 0.2), new THREE.MeshStandardMaterial({ color: 0x222233 })); legL.position.set(0, 0.28, 0.16); legL.name = 'legL'; g.add(legL); const legR = legL.clone(); legR.position.z = -0.16; legR.name = 'legR'; g.add(legR); return g; };
    const PEOPLE_N = 38;
    for (let i = 0; i < PEOPLE_N; i++) { const g = mkPerson(); scene.add(g); const from = walkPoint(); people.push({ g, from, to: walkPoint(), t: Math.random(), speed: 0.02 + Math.random() * 0.025, phase: Math.random() * Math.PI * 2 }); }

    // Floating lanterns over the river + circling birds (cheap life details)
    const lanterns: THREE.Mesh[] = [];
    const lantMat = new THREE.MeshBasicMaterial({ color: 0xffc978 });
    for (let i = 0; i < 12; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), lantMat); s.position.set(84 + Math.random() * 16, 3 + Math.random() * 5, -80 + Math.random() * 160); s.userData.phase = Math.random() * 6.28; scene.add(s); lanterns.push(s); }
    const birds: THREE.Group[] = [];
    const birdMat = new THREE.MeshBasicMaterial({ color: 0x1a2030 });
    for (let i = 0; i < 6; i++) { const bg2 = new THREE.Group(); const w1 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.42), birdMat); w1.position.x = -1.05; w1.name = 'wingL'; const w2 = w1.clone(); w2.position.x = 1.05; w2.name = 'wingR'; bg2.add(w1, w2); bg2.scale.setScalar(1.45); bg2.userData.r = 48 + i * 7; bg2.userData.h = 48 + (i % 3) * 6; bg2.userData.ph = i * 1.05; scene.add(bg2); birds.push(bg2); }

    // Camera orbit state (starts wide → eased intro fly-over into the default view)
    const cam = { theta: 0.12, phi: 0.6, radius: 268, tx: 0, tz: 0, dTheta: 0.7, dPhi: 0.92, dRadius: 178, dTx: 0, dTz: 0 };
    const el = renderer.domElement;
    const pointers = new Map<number, { x: number; y: number }>();
    let lastPinch = 0; let moved = 0; let downPos = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => { pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); downPos = { x: e.clientX, y: e.clientY }; moved = 0; el.setPointerCapture(e.pointerId); };
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      const prev = pointers.get(e.pointerId)!; pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y);
      if (pointers.size === 2) { const pts = [...pointers.values()]; const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y); if (lastPinch > 0) cam.dRadius = THREE.MathUtils.clamp(cam.dRadius * (lastPinch / dist), 26, 280); lastPinch = dist; return; }
      if (e.shiftKey) { const s = cam.radius * 0.0016; const sin = Math.sin(cam.theta), cos = Math.cos(cam.theta); cam.dTx = THREE.MathUtils.clamp(cam.dTx - ((e.clientX - prev.x) * cos) * s + ((e.clientY - prev.y) * -sin) * s * 0, -110, 110); cam.dTz = THREE.MathUtils.clamp(cam.dTz + ((e.clientX - prev.x) * sin) * s - ((e.clientY - prev.y) * cos) * s, -110, 110); return; }
      cam.dTheta -= (e.clientX - prev.x) * 0.005;
      cam.dPhi = THREE.MathUtils.clamp(cam.dPhi - (e.clientY - prev.y) * 0.004, 0.18, 1.42);
    };
    const raycaster = new THREE.Raycaster(); const ndc = new THREE.Vector2();
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId); lastPinch = 0;
      if (moved < 7 && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) < 7) {
        const r = el.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(clickMeshes, false);
        onSelect(hits.length ? (hits[0].object.userData.slug as string) : null);
      }
    };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); cam.dRadius = THREE.MathUtils.clamp(cam.dRadius + e.deltaY * 0.09, 26, 280); };
    el.addEventListener('pointerdown', onDown); el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp); el.addEventListener('wheel', onWheel, { passive: false });

    let mobileFrameApplied = false;
    const resize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      const mobile = w / h < 0.78;
      camera.fov = mobile ? 58 : 52;
      camera.updateProjectionMatrix();
      // One-time mobile framing adjustment only; preserve the intro fly-over/easing.
      if (mobile && !mobileFrameApplied) {
        cam.dRadius = Math.max(cam.dRadius, 194);
        cam.dPhi = Math.min(cam.dPhi, 0.88);
        mobileFrameApplied = true;
      }
    };
    resize(); const ro = new ResizeObserver(resize); ro.observe(mount);

    stateRef.current = {
      focusOn: (slug: string | null) => {
        if (!slug) return;
        const geo = BUILDING_GEO.find(b => b.slug === slug); if (!geo) return;
        const mobile = mount.clientWidth / Math.max(1, mount.clientHeight) < 0.78;
        cam.dTx = geo.x; cam.dTz = geo.z;
        cam.dRadius = Math.max(38, geo.h * 2.4) * (mobile ? 1.16 : 1);
        cam.dPhi = mobile ? 0.88 : 0.95;
      },
      resetCam: () => {
        const mobile = mount.clientWidth / Math.max(1, mount.clientHeight) < 0.78;
        cam.dTheta = 0.7; cam.dPhi = mobile ? 0.88 : 0.92; cam.dRadius = mobile ? 194 : 178; cam.dTx = 0; cam.dTz = 0;
      },
      setSelected: (slug: string | null) => { labelSprites.forEach(l => { const m = l.s.material as THREE.SpriteMaterial; const sel2 = l.slug === slug; m.depthTest = !sel2; l.s.renderOrder = sel2 ? 2000 : 0; m.color.set(sel2 ? 0xffd75e : 0xffffff); }); agentSprites.forEach(a => { const selectedAgentBuilding = a.slug === slug; (a.s.material as THREE.SpriteMaterial).opacity = selectedAgentBuilding ? 1 : 0.88; a.marker.scale.setScalar(selectedAgentBuilding ? 1.22 : 1); }); const geo = BUILDING_GEO.find(b => b.slug === slug); if (!geo) { ring.visible = false; return; } ring.visible = true; ring.position.x = geo.x; ring.position.z = geo.z; const r = Math.max(geo.w, geo.d) * 0.78 + 3; ring.scale.set(r, r, 1); },
      setAgents: (list: Agent[]) => {
        agentSprites.forEach(a => { scene.remove(a.s); scene.remove(a.marker); (a.s.material as THREE.SpriteMaterial).map?.dispose(); (a.s.material as THREE.SpriteMaterial).dispose(); a.marker.traverse(o => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).geometry.dispose(); const mat = (o as THREE.Mesh).material; if (Array.isArray(mat)) mat.forEach(m => m.dispose()); else mat.dispose(); } }); });
        agentSprites.length = 0;
        const byBuilding = new Map<string, Agent[]>();
        list.forEach(agent => { if (!agent.building_slug) return; const arr = byBuilding.get(agent.building_slug) || []; arr.push(agent); byBuilding.set(agent.building_slug, arr); });
        byBuilding.forEach((members, slug) => {
          const geo = BUILDING_GEO.find(b => b.slug === slug); if (!geo) return;
          members.forEach((agent, index) => {
            const col = index % 3, row = Math.floor(index / 3);
            const x = geo.x + (col - 1) * Math.min(5, geo.w * 0.18), z = geo.z + row * 3.2;
            const marker = new THREE.Group();
            const ringM = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.35, 24), new THREE.MeshBasicMaterial({ color: 0x55ddff, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
            ringM.rotation.x = -Math.PI / 2; ringM.position.y = 0.2; marker.add(ringM);
            const orb = new THREE.Mesh(new THREE.SphereGeometry(0.82, 14, 10), new THREE.MeshStandardMaterial({ color: 0x55ddff, emissive: 0x087ea4, emissiveIntensity: 1.2, metalness: 0.35, roughness: 0.22 }));
            orb.position.y = 1.25; marker.add(orb);
            marker.position.set(x, geo.h + 3 + row * 2.2, z); marker.renderOrder = 1100; scene.add(marker);
            const s = makeAgentLabel(agent.name || agent.code || 'Agent', agent.role || agent.department || 'AI Agent');
            const baseY = marker.position.y + 11;
            s.position.set(x, baseY, z); scene.add(s);
            agentSprites.push({ s, marker, slug, x, y: baseY, z, baseY, agent });
          });
        });
        stateRef.current?.setSelected(propsRef.current.selectedSlug);
      },
    };
    stateRef.current.setSelected(propsRef.current.selectedSlug);
    stateRef.current.setAgents(agents);

    const dawnTop = new THREE.Color(0x35569e), dawnBot = new THREE.Color(0xcfe0f5), nightTop = new THREE.Color(0x02040f), nightBot = new THREE.Color(0x14306e);
    const dawnFog = new THREE.Color(0xa8c2e8), nightFog = new THREE.Color(0x0a1730), warmSun = new THREE.Color(0xfff2d8), moonSun = new THREE.Color(0x9db8ff);
    const clock = new THREE.Clock(); let raf = 0; let nightMix = propsRef.current.night ? 1 : 0;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05); const t = clock.elapsedTime;
      const P = propsRef.current;
      nightMix += ((P.night ? 1 : 0) - nightMix) * 0.04;
      skyUni.topColor.value.lerpColors(dawnTop, nightTop, nightMix);
      skyUni.bottomColor.value.lerpColors(dawnBot, nightBot, nightMix);
      if (scene.fog) scene.fog.color.lerpColors(dawnFog, nightFog, nightMix);
      sun.intensity = 2.2 * (1 - nightMix) + 0.35; sun.color.lerpColors(warmSun, moonSun, nightMix); hemi.intensity = 0.9 - nightMix * 0.5; moonGlow.intensity = nightMix * 900;
      waterTex.offset.y = t * 0.018; waterTex.offset.x = Math.sin(t * 0.11) * 0.02;
      for (let i = 0; i < windowMats.length; i++) windowMats[i].emissiveIntensity = 0.34 + nightMix * 0.55 + Math.sin(t * 0.6 + i * 1.7) * 0.03;
      (stars.material as THREE.PointsMaterial).opacity = nightMix * 0.95;
      (lampI.material as THREE.MeshBasicMaterial).color.setHex(nightMix > 0.4 ? 0xffd98a : 0x8a8a9a);
      riverMat.emissiveIntensity = 0.3 + Math.sin(t * 0.7) * 0.12 + nightMix * 0.3;
      jets.forEach((j, i) => { j.scale.y = 1 + Math.sin(t * 2.2 + i * 1.3) * 0.14; j.rotation.y = t * (0.8 + i * 0.15); });
      groups.forEach(g => { g.traverse(o => { if (o.name === 'beacon') o.visible = Math.sin(t * 3) > -0.2; if (o.name === 'orb') { if (o.userData.baseY === undefined) o.userData.baseY = o.position.y; o.position.y = o.userData.baseY + Math.sin(t * 1.3 + o.id) * 0.22; } if (o.name === 'ring') o.rotation.z = t * 0.5; if (o.name === 'spinY') o.rotation.y = t * 1.2; if (o.name === 'onair') (o as THREE.Mesh).visible = Math.sin(t * 2) > -0.6; if (o.name === 'beamPivot') { o.rotation.y = t * 0.45; } }); });
      lanterns.forEach((s, i) => { s.visible = !P.reduced && nightMix > 0.15; if (s.visible) { s.position.y += Math.sin(t * 0.8 + s.userData.phase) * 0.006; s.position.x += Math.sin(t * 0.3 + i) * 0.004; } });
      birds.forEach((bg2, i) => { bg2.visible = !P.reduced; if (!bg2.visible) return; const a = t * 0.05 + bg2.userData.ph; bg2.position.set(Math.cos(a) * bg2.userData.r, bg2.userData.h + Math.sin(t * 0.7 + i) * 1.6, Math.sin(a) * bg2.userData.r); bg2.rotation.y = -a; const wl = bg2.getObjectByName('wingL'), wr = bg2.getObjectByName('wingR'); const flap = Math.sin(t * 4.8 + i * 1.7) * 0.6; if (wl) wl.rotation.z = flap; if (wr) wr.rotation.z = -flap; });
      // Unified screen-space layout: selected building, its agents, active agents, then other labels.
      const occupiedLabels: { x: number; y: number; hw: number; hh: number }[] = [];
      const labelItems: {
        kind: 'agent' | 'building'; sprite: THREE.Sprite; slug: string;
        x: number; y: number; z: number; dist: number; priority: number;
        agentEntry?: (typeof agentSprites)[number];
        buildingEntry?: (typeof labelSprites)[number];
      }[] = [];
      for (const a of agentSprites) {
        const dx = camera.position.x - a.x, dy = camera.position.y - a.baseY, dz = camera.position.z - a.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const working = a.agent.status === 'active' || a.agent.status === 'busy';
        labelItems.push({ kind: 'agent', sprite: a.s, slug: a.slug, x: a.x, y: a.baseY, z: a.z, dist, priority: a.slug === P.selectedSlug ? 1 : working ? 2 : 3, agentEntry: a });
      }
      for (const l of labelSprites) {
        const dx = camera.position.x - l.x, dy = camera.position.y - l.y, dz = camera.position.z - l.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const selected = l.slug === P.selectedSlug;
        const inRange = dist < (cam.radius < 100 ? 135 : 245);
        l.s.visible = selected || inRange;
        if (l.s.visible) labelItems.push({ kind: 'building', sprite: l.s, slug: l.slug, x: l.x, y: l.y, z: l.z, dist, priority: selected ? 0 : 4, buildingEntry: l });
      }
      labelItems.sort((a, b) => a.priority - b.priority || a.dist - b.dist);
      const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
      for (const item of labelItems) {
        const isAgent = item.kind === 'agent';
        const selected = item.slug === P.selectedSlug;
        const sc = isAgent
          ? THREE.MathUtils.clamp(item.dist * 0.085, 8, 22)
          : THREE.MathUtils.clamp(item.dist * 0.085, 7.5, selected ? 30 : 24) * (selected ? 1.15 : 1);
        const labelAspect = isAgent ? 0.25 : 0.1875;
        item.sprite.scale.set(sc, sc * labelAspect, 1);
        const maxAttempts = isAgent ? 32 : selected ? 24 : 10;
        const stepY = isAgent ? 4.2 : 3.6;
        const safeDist = Math.max(1, item.dist);
        const halfW = THREE.MathUtils.clamp(sc / (2 * safeDist * tanHalfFov * Math.max(camera.aspect, 0.4)), 0.025, 0.48);
        const halfH = THREE.MathUtils.clamp((sc * labelAspect) / (2 * safeDist * tanHalfFov), 0.018, 0.22);
        let projected = new THREE.Vector3();
        let placed = false;
        for (let attempt = 0; attempt <= maxAttempts; attempt++) {
          item.sprite.position.set(item.x, item.y + attempt * stepY, item.z);
          projected = item.sprite.position.clone().project(camera);
          const collides = occupiedLabels.some(p =>
            Math.abs(p.x - projected.x) < p.hw + halfW + 0.012 &&
            Math.abs(p.y - projected.y) < p.hh + halfH + 0.012
          );
          if (!collides) { placed = true; break; }
        }
        if (!placed && item.kind === 'building' && !selected) {
          item.sprite.visible = false;
          continue;
        }
        item.sprite.visible = true;
        occupiedLabels.push({ x: projected.x, y: projected.y, hw: halfW, hh: halfH });
        if (item.agentEntry) {
          const a = item.agentEntry;
          const working = a.agent.status === 'active' || a.agent.status === 'busy';
          (item.sprite.material as THREE.SpriteMaterial).opacity = selected ? 1 : working ? 0.96 : 0.86;
          a.marker.visible = !P.reduced;
          a.marker.position.y = a.baseY - 11;
          a.marker.scale.setScalar(selected ? 1.22 : 1);
        } else if (item.buildingEntry) {
          (item.sprite.material as THREE.SpriteMaterial).opacity = selected ? 1 : THREE.MathUtils.clamp(1.3 - item.dist / 270, 0.3, 0.95);
        }
      }
      if (ring.visible) { const s = 1 + Math.sin(t * 3) * 0.03; ring.scale.x = Math.abs(ring.scale.x) * 0 + ring.userData.base || ring.scale.x; ring.material.opacity = 0.75 + Math.sin(t * 3) * 0.2; ring.rotation.z = t * 0.4; void s; }
      // Cars
      const activeCars = P.reduced ? 5 : cars.length;
      cars.forEach((car, i) => { car.mesh.visible = i < activeCars; if (!car.mesh.visible) return; const a = car.route[car.seg], b = car.route[(car.seg + 1) % car.route.length]; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); car.t += (car.speed * dt * 60) / len; if (car.t >= 1) { car.t = 0; car.seg = (car.seg + 1) % car.route.length; } const lane = 1.8; const dx = b[0] - a[0], dz = b[1] - a[1]; const nl = Math.hypot(dx, dz) || 1; const ox = (-dz / nl) * lane, oz = (dx / nl) * lane; car.mesh.position.set(a[0] + dx * car.t + ox, 0.1, a[1] + dz * car.t + oz); car.mesh.rotation.y = Math.atan2(-dz, dx); });
      // People
      const activePeople = P.reduced ? 12 : people.length;
      people.forEach((p, i) => { p.g.visible = i < activePeople; if (!p.g.visible) return; p.t += p.speed * dt * (30 / Math.max(8, p.from.distanceTo(p.to))); if (p.t >= 1) { p.from = p.to; p.to = walkPoint(); p.t = 0; } p.g.position.lerpVectors(p.from, p.to, p.t); p.g.position.y = Math.abs(Math.sin(t * 7 + p.phase)) * 0.09; const dir = new THREE.Vector3().subVectors(p.to, p.from); p.g.rotation.y = Math.atan2(dir.x, dir.z); const ll = p.g.getObjectByName('legL'), lr = p.g.getObjectByName('legR'); if (ll) ll.rotation.x = Math.sin(t * 7 + p.phase) * 0.55; if (lr) lr.rotation.x = -Math.sin(t * 7 + p.phase) * 0.55; });
      // Camera easing
      const k = 0.07;
      cam.theta += (cam.dTheta - cam.theta) * k; cam.phi += (cam.dPhi - cam.phi) * k; cam.radius += (cam.dRadius - cam.radius) * k; cam.tx += (cam.dTx - cam.tx) * k; cam.tz += (cam.dTz - cam.tz) * k;
      camera.position.set(cam.tx + cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta), cam.radius * Math.cos(cam.phi) + 4, cam.tz + cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta));
      camera.lookAt(cam.tx, 5, cam.tz);
      renderer.render(scene, camera);
    };
    animate();

    return () => { cancelAnimationFrame(raf); ro.disconnect(); el.removeEventListener('pointerdown', onDown); el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); el.removeEventListener('wheel', onWheel); renderer.dispose(); mount.removeChild(el); stateRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={mountRef} className="h-full w-full" role="application" aria-label="Autopolis Royal 3D city. Drag to orbit, pinch or scroll to zoom, tap a building to select it." />;
}
