/**
 * Advanced 3D Scene with animated avatar, 360° view, and environment rendering.
 * Upgrades the bird's-eye to a full immersive 3D world.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import * as THREE from 'three';

// --- Avatar Animation States ---
const WALK_CYCLE_SPEED = 2.8; // rad/s
const BIKE_WHEEL_SPEED = 4.5; // rad/s

function bandColorHex(det) {
  const risk = Number(det?.risk_percent || 0);
  const ttc = Number(det?.ttc_s || 999);
  if (risk >= 75 || ttc < 1.8) return 0xdc2626;
  if (risk >= 40 || ttc < 3.5) return 0xd97706;
  return 0x059669;
}

function detToWorldXZ(det, frameW) {
  const [x1, , x2] = det.bbox_xyxy.map(Number);
  const cx = (x1 + x2) / 2;
  const fw = Math.max(320, frameW || 1280);
  const dist = Math.max(0.5, Number(det.distance_m) || 6);
  const nx = cx / fw - 0.5;
  const lateralM = nx * 2 * Math.min(14, dist * 0.48);
  const forwardM = dist;
  return { lateralM, forwardZ: Math.min(55, forwardM) };
}

// --- Create animated walking person avatar ---
function createWalkingAvatar() {
  const group = new THREE.Group();
  
  // Body (torso)
  const bodyGeo = new THREE.CapsuleGeometry(0.35, 0.9, 8, 12);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    metalness: 0.2,
    roughness: 0.7,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 1.2;
  group.add(body);

  // Head
  const headGeo = new THREE.SphereGeometry(0.22, 16, 16);
  const headMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    metalness: 0.1,
    roughness: 0.8,
  });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.85;
  group.add(head);

  // Left leg
  const legGeo = new THREE.CapsuleGeometry(0.12, 0.75, 6, 8);
  const legMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.1,
    roughness: 0.9,
  });
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-0.15, 0.45, 0);
  group.add(leftLeg);

  // Right leg
  const rightLeg = new THREE.Mesh(legGeo, legMat.clone());
  rightLeg.position.set(0.15, 0.45, 0);
  group.add(rightLeg);

  // Arms
  const armGeo = new THREE.CapsuleGeometry(0.08, 0.65, 6, 8);
  const armMat = new THREE.MeshStandardMaterial({
    color: 0x3b82f6,
    metalness: 0.2,
    roughness: 0.7,
  });
  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.position.set(-0.45, 1.15, 0);
  leftArm.rotation.z = 0.3;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, armMat.clone());
  rightArm.position.set(0.45, 1.15, 0);
  rightArm.rotation.z = -0.3;
  group.add(rightArm);

  group.userData = { leftLeg, rightLeg, leftArm, rightArm, body, head };
  return group;
}

// --- Create animated cyclist avatar ---
function createCyclistAvatar() {
  const group = new THREE.Group();

  // Bike frame
  const frameGeo = new THREE.BoxGeometry(0.08, 0.08, 1.2);
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    metalness: 0.6,
    roughness: 0.3,
  });
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.position.y = 0.65;
  group.add(frame);

  // Front wheel
  const wheelGeo = new THREE.TorusGeometry(0.32, 0.06, 12, 24);
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    metalness: 0.4,
    roughness: 0.6,
  });
  const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
  frontWheel.rotation.y = Math.PI / 2;
  frontWheel.position.set(0, 0.32, 0.6);
  group.add(frontWheel);

  // Rear wheel
  const rearWheel = new THREE.Mesh(wheelGeo, wheelMat.clone());
  rearWheel.rotation.y = Math.PI / 2;
  rearWheel.position.set(0, 0.32, -0.6);
  group.add(rearWheel);

  // Rider body
  const riderBodyGeo = new THREE.CapsuleGeometry(0.28, 0.7, 8, 12);
  const riderBodyMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    metalness: 0.2,
    roughness: 0.7,
  });
  const riderBody = new THREE.Mesh(riderBodyGeo, riderBodyMat);
  riderBody.position.y = 1.1;
  riderBody.rotation.x = 0.3;
  group.add(riderBody);

  // Rider head
  const riderHeadGeo = new THREE.SphereGeometry(0.2, 16, 16);
  const riderHeadMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    metalness: 0.1,
    roughness: 0.8,
  });
  const riderHead = new THREE.Mesh(riderHeadGeo, riderHeadMat);
  riderHead.position.y = 1.65;
  group.add(riderHead);

  // Handlebars
  const handlebarGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 8);
  const handlebarMat = new THREE.MeshStandardMaterial({
    color: 0x6b7280,
    metalness: 0.7,
    roughness: 0.3,
  });
  const handlebar = new THREE.Mesh(handlebarGeo, handlebarMat);
  handlebar.rotation.z = Math.PI / 2;
  handlebar.position.set(0, 0.95, 0.55);
  group.add(handlebar);

  group.userData = { frontWheel, rearWheel, frame, riderBody, riderHead };
  return group;
}

// --- Create 3D vehicle model (car/truck/bike) ---
function createVehicleModel(label) {
  const group = new THREE.Group();
  const isLarge = label === 'truck' || label === 'bus';
  const isBike = label === 'motorcycle' || label === 'bicycle';

  if (isBike) {
    // Body
    const bodyGeo = new THREE.BoxGeometry(0.6, 0.8, 1.4);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.7,
      roughness: 0.2,
      transparent: true,
      opacity: 0,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.6;
    group.add(body);

    // Wheels
    const wheelGeo = new THREE.TorusGeometry(0.28, 0.08, 10, 20);
    const wheelMat = new THREE.MeshStandardMaterial({ 
      color: 0x1f2937,
      transparent: true,
      opacity: 0,
    });
    const wheel1 = new THREE.Mesh(wheelGeo, wheelMat);
    wheel1.rotation.y = Math.PI / 2;
    wheel1.position.set(0, 0.28, 0.5);
    group.add(wheel1);
    const wheel2 = wheel1.clone();
    wheel2.position.z = -0.5;
    group.add(wheel2);
  } else {
    // Car/truck/bus
    const w = isLarge ? 2.8 : 1.9;
    const h = isLarge ? 3.2 : 1.6;
    const d = isLarge ? 6.5 : 4.5;

    // Body
    const bodyGeo = new THREE.BoxGeometry(w, h, d);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: isLarge ? 0x7c3aed : 0x3b82f6,
      metalness: 0.6,
      roughness: 0.3,
      transparent: true,
      opacity: 0,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = h / 2 + 0.4;
    group.add(body);

    // Windshield
    const windGeo = new THREE.BoxGeometry(w * 0.9, h * 0.4, d * 0.3);
    const windMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.9,
      roughness: 0.1,
      transparent: true,
      opacity: 0,
    });
    const windshield = new THREE.Mesh(windGeo, windMat);
    windshield.position.set(0, h * 0.7 + 0.4, d * 0.15);
    group.add(windshield);

    // Wheels
    const wheelRadius = isLarge ? 0.5 : 0.38;
    const wheelGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, 0.25, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ 
      color: 0x0f172a,
      transparent: true,
      opacity: 0,
    });
    
    const positions = [
      [-w * 0.45, wheelRadius, d * 0.35],
      [w * 0.45, wheelRadius, d * 0.35],
      [-w * 0.45, wheelRadius, -d * 0.35],
      [w * 0.45, wheelRadius, -d * 0.35],
    ];
    
    positions.forEach(([x, y, z]) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat.clone());
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, y, z);
      group.add(wheel);
    });

    // Headlights
    const lightGeo = new THREE.SphereGeometry(0.15, 12, 12);
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfef08a,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0,
    });
    const light1 = new THREE.Mesh(lightGeo, lightMat);
    light1.position.set(-w * 0.35, h * 0.3 + 0.4, d * 0.5 + 0.1);
    group.add(light1);
    const light2 = light1.clone();
    light2.position.x = w * 0.35;
    group.add(light2);
  }

  return group;
}

// --- Create scrolling environment (road, buildings, trees) ---
function createScrollingEnvironment(scene, ctx) {
  const envObjects = [];

  // Road segments (spawn ahead, recycle behind)
  for (let i = 0; i < 8; i++) {
    const roadGeo = new THREE.PlaneGeometry(40, 20);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.9,
      metalness: 0.1,
    });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.01;
    road.position.z = i * 20;
    road.userData.type = 'road';
    road.userData.segmentLength = 20;
    scene.add(road);
    envObjects.push(road);

    // Road markings on each segment
    for (let j = 0; j < 3; j++) {
      const markGeo = new THREE.PlaneGeometry(0.3, 4);
      const markMat = new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.8,
      });
      const mark = new THREE.Mesh(markGeo, markMat);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(0, 0.02, i * 20 + j * 6);
      mark.userData.type = 'marking';
      mark.userData.parentSegment = i;
      scene.add(mark);
      envObjects.push(mark);
    }
  }

  // Buildings (spawn on sides, recycle)
  const buildingSpacing = 25;
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? -25 : 25;
    const z = Math.floor(i / 2) * buildingSpacing + 20;
    const h = 8 + Math.random() * 12;
    const buildGeo = new THREE.BoxGeometry(8, h, 8);
    const buildMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.6, 0.2, 0.2 + Math.random() * 0.2),
      roughness: 0.8,
      metalness: 0.2,
    });
    const building = new THREE.Mesh(buildGeo, buildMat);
    building.position.set(side, h / 2, z);
    building.userData.type = 'building';
    building.userData.height = h;
    building.userData.side = side;
    building.userData.respawnDistance = buildingSpacing * 3;
    scene.add(building);
    envObjects.push(building);

    // Windows
    const windows = [];
    for (let wy = 2; wy < h - 1; wy += 2.5) {
      for (let wx = -3; wx <= 3; wx += 2) {
        const winGeo = new THREE.PlaneGeometry(0.8, 1.2);
        const winMat = new THREE.MeshBasicMaterial({
          color: Math.random() > 0.3 ? 0xfef08a : 0x1e293b,
          transparent: true,
          opacity: 0.9,
        });
        const window = new THREE.Mesh(winGeo, winMat);
        window.position.set(side > 0 ? side - 4.01 : side + 4.01, wy, z + wx);
        window.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        window.userData.type = 'window';
        window.userData.parentBuilding = building;
        scene.add(window);
        windows.push(window);
      }
    }
    building.userData.windows = windows;
    envObjects.push(...windows);
  }

  // Trees (spawn on sides, recycle)
  const treeSpacing = 22;
  for (let i = 0; i < 8; i++) {
    const side = i % 2 === 0 ? -18 : 18;
    const z = Math.floor(i / 2) * treeSpacing + 10;
    
    // Trunk
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.4, 3, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(side, 1.5, z);
    trunk.userData.type = 'trunk';
    trunk.userData.side = side;
    trunk.userData.respawnDistance = treeSpacing * 4;
    scene.add(trunk);
    envObjects.push(trunk);

    // Foliage
    const foliageGeo = new THREE.ConeGeometry(2, 4, 8);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x166534 });
    const foliage = new THREE.Mesh(foliageGeo, foliageMat);
    foliage.position.set(side, 4.5, z);
    foliage.userData.type = 'foliage';
    foliage.userData.parentTrunk = trunk;
    scene.add(foliage);
    envObjects.push(foliage);
  }

  // Ground plane (infinite-looking, moves with avatar)
  const groundGeo = new THREE.PlaneGeometry(200, 200);
  const groundMat = new THREE.MeshStandardMaterial({
    color: 0x15803d,
    roughness: 0.95,
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0;
  ground.userData.type = 'ground';
  scene.add(ground);
  envObjects.push(ground);

  ctx.environmentObjects = envObjects;
}

export default function Advanced3DScene({ width, height, detections, frameSize, isRunning, mode = 'riding' }) {
  const mountId = `advanced3d-${useId().replace(/:/g, '')}`;
  const [initError, setInitError] = useState('');
  const detectionsRef = useRef(detections);
  const frameSizeRef = useRef(frameSize);
  const isRunningRef = useRef(isRunning);
  const [avatarSpeed, setAvatarSpeed] = useState(0); // m/s forward speed

  detectionsRef.current = detections;
  frameSizeRef.current = frameSize;
  isRunningRef.current = isRunning;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return undefined;
    }

    let disposed = false;
    let rafWait = 0;
    const ctx = {
      scene: null,
      camera: null,
      renderer: null,
      avatar: null,
      trackGroups: new Map(),
      raf: 0,
      cameraAngle: 0,
      cameraDistance: 18,
      cameraHeight: 8,
      avatarZ: 0, // Avatar's forward position (increases as you move)
      environmentObjects: [], // Buildings, trees, road segments that scroll
      _cleanupResize: null,
      _resizeObserver: null,
      _el: null,
    };

    const setup = (el) => {
      if (!el || disposed) return;

      const w = Math.max(280, width || 640);
      const h = Math.max(200, height || 480);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0c4a6e);
      scene.fog = new THREE.Fog(0x0c4a6e, 30, 100);

      const camera = new THREE.PerspectiveCamera(60, w / Math.max(1, h), 0.5, 250);
      camera.up.set(0, 1, 0);

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        setInitError('');
      } catch (e) {
        setInitError(`3D renderer unavailable: ${e?.message || 'WebGL disabled'}`);
        return;
      }
      renderer.setClearColor(0x0c4a6e, 1);
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, 2));
      if ('outputColorSpace' in renderer) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      }
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      el.innerHTML = '';
      const canvas = renderer.domElement;
      canvas.style.position = 'absolute';
      canvas.style.left = '0';
      canvas.style.top = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      el.appendChild(canvas);

      // Create scrolling environment
      createScrollingEnvironment(scene, ctx);

      // Create avatar
      const walkingMode = mode === 'walking';
      const avatar = walkingMode ? createWalkingAvatar() : createCyclistAvatar();
      avatar.position.set(0, 0, 0);
      scene.add(avatar);
      ctx.avatar = avatar;

      // Lighting
      scene.add(new THREE.AmbientLight(0xffffff, 0.4));
      scene.add(new THREE.HemisphereLight(0x87ceeb, 0x15803d, 0.6));
      
      const sun = new THREE.DirectionalLight(0xfef08a, 0.8);
      sun.position.set(30, 50, 20);
      sun.castShadow = true;
      sun.shadow.camera.left = -50;
      sun.shadow.camera.right = 50;
      sun.shadow.camera.top = 50;
      sun.shadow.camera.bottom = -50;
      sun.shadow.mapSize.width = 2048;
      sun.shadow.mapSize.height = 2048;
      scene.add(sun);

      ctx.scene = scene;
      ctx.camera = camera;
      ctx.renderer = renderer;

      const syncDetections = () => {
        const dets = detectionsRef.current || [];
        const fw = frameSizeRef.current?.w || 1280;
        const used = new Set();

        for (const d of dets.slice(0, 20)) {
          const id = String(d.track_id || '');
          if (!id) continue;
          used.add(id);

          const { lateralM, forwardZ } = detToWorldXZ(d, fw);
          const x = lateralM;
          const z = 5 + forwardZ * 1.1;

          let group = ctx.trackGroups.get(id);
          if (!group) {
            group = createVehicleModel(d.label);
            group.userData = { tx: x, tz: z, lastDet: d };
            scene.add(group);
            ctx.trackGroups.set(id, group);
          }

          group.userData.tx = x;
          group.userData.tz = z;
          group.userData.lastDet = d;
        }

        for (const [id, group] of [...ctx.trackGroups.entries()]) {
          if (!used.has(id)) {
            scene.remove(group);
            group.traverse((obj) => {
              if (obj.geometry) obj.geometry.dispose();
              if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
                else obj.material.dispose();
              }
            });
            ctx.trackGroups.delete(id);
          }
        }
      };

      const animate = () => {
        if (disposed) return;
        ctx.raf = requestAnimationFrame(animate);
        const t = Date.now() * 0.001;
        const dt = 1 / 60; // Assume 60fps for movement

        syncDetections();

        // --- Avatar movement ---
        const walkingMode = mode === 'walking';
        const baseSpeed = walkingMode ? 1.4 : 5.5; // m/s (walking ~1.4 m/s, cycling ~5.5 m/s)
        const targetSpeed = isRunningRef.current ? baseSpeed : 0;
        
        // Smooth speed transition
        const currentSpeed = ctx.avatarSpeed || 0;
        ctx.avatarSpeed = currentSpeed + (targetSpeed - currentSpeed) * 0.1;
        
        // Move avatar forward
        if (ctx.avatarSpeed > 0.01) {
          ctx.avatarZ += ctx.avatarSpeed * dt;
        }

        // Update avatar position
        if (ctx.avatar) {
          ctx.avatar.position.z = ctx.avatarZ;
        }

        // --- Animate avatar ---
        if (ctx.avatar && isRunningRef.current) {
          if (walkingMode) {
            // Walking animation
            const { leftLeg, rightLeg, leftArm, rightArm, body } = ctx.avatar.userData;
            if (leftLeg && rightLeg) {
              leftLeg.rotation.x = Math.sin(t * WALK_CYCLE_SPEED) * 0.5;
              rightLeg.rotation.x = Math.sin(t * WALK_CYCLE_SPEED + Math.PI) * 0.5;
            }
            if (leftArm && rightArm) {
              leftArm.rotation.x = Math.sin(t * WALK_CYCLE_SPEED + Math.PI) * 0.3;
              rightArm.rotation.x = Math.sin(t * WALK_CYCLE_SPEED) * 0.3;
            }
            // Body bob
            if (body) {
              body.position.y = 1.2 + Math.sin(t * WALK_CYCLE_SPEED * 2) * 0.05;
            }
          } else {
            // Cycling animation (wheel rotation + body lean)
            const { frontWheel, rearWheel, riderBody } = ctx.avatar.userData;
            if (frontWheel) frontWheel.rotation.x = t * BIKE_WHEEL_SPEED;
            if (rearWheel) rearWheel.rotation.x = t * BIKE_WHEEL_SPEED;
            if (riderBody) {
              riderBody.rotation.z = Math.sin(t * 1.5) * 0.03; // Slight sway
            }
          }
        }

        // --- Scroll environment backward (avatar moves forward) ---
        for (const obj of ctx.environmentObjects) {
          const type = obj.userData.type;
          
          if (type === 'road') {
            // Road segments recycle
            const relativeZ = obj.position.z - ctx.avatarZ;
            if (relativeZ < -20) {
              // Segment passed behind, move it ahead
              obj.position.z += 160; // 8 segments * 20m
            }
          } else if (type === 'marking') {
            // Markings follow their parent road segment
            const segmentIdx = obj.userData.parentSegment;
            const baseZ = segmentIdx * 20;
            const offset = obj.position.z - baseZ;
            const relativeZ = baseZ - ctx.avatarZ;
            if (relativeZ < -20) {
              obj.position.z += 160;
            }
          } else if (type === 'building') {
            const relativeZ = obj.position.z - ctx.avatarZ;
            if (relativeZ < -30) {
              // Building passed, respawn ahead
              obj.position.z += obj.userData.respawnDistance;
              // Update windows
              if (obj.userData.windows) {
                for (const win of obj.userData.windows) {
                  win.position.z += obj.userData.respawnDistance;
                }
              }
            }
          } else if (type === 'trunk') {
            const relativeZ = obj.position.z - ctx.avatarZ;
            if (relativeZ < -30) {
              obj.position.z += obj.userData.respawnDistance;
            }
          } else if (type === 'foliage') {
            // Follow parent trunk
            if (obj.userData.parentTrunk) {
              obj.position.z = obj.userData.parentTrunk.position.z;
            }
          } else if (type === 'ground') {
            // Ground follows avatar
            obj.position.z = ctx.avatarZ + 50;
          }
        }

        // --- Smooth vehicle positions (relative to avatar) ---
        const alpha = 0.15;
        for (const group of ctx.trackGroups.values()) {
          const u = group.userData;
          if (u.tx != null) {
            // Target position is relative to avatar's current Z
            const targetZ = ctx.avatarZ + u.tz;
            group.position.x += (u.tx - group.position.x) * alpha;
            group.position.z += (targetZ - group.position.z) * alpha;
          }

          // Fade in/out animation
          if (!u.fadeIn) {
            u.fadeIn = 0;
          }
          u.fadeIn = Math.min(1, u.fadeIn + 0.05);
          group.traverse((child) => {
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((mat) => {
                  if (mat.opacity !== undefined) mat.opacity = u.fadeIn;
                });
              } else if (child.material.opacity !== undefined) {
                child.material.opacity = u.fadeIn;
              }
            }
          });
        }

        // --- 360° rotating camera (follows avatar) ---
        ctx.cameraAngle += 0.003;
        const camX = Math.sin(ctx.cameraAngle) * ctx.cameraDistance;
        const camZ = Math.cos(ctx.cameraAngle) * ctx.cameraDistance + ctx.avatarZ;
        camera.position.set(camX, ctx.cameraHeight, camZ);
        camera.lookAt(0, 1, ctx.avatarZ + 8);

        renderer.render(scene, camera);
      };
      animate();

      const onResize = () => {
        if (!ctx.renderer || !ctx.camera || !ctx._el) return;
        const rw = Math.max(280, ctx._el.clientWidth || w);
        const rh = Math.max(200, ctx._el.clientHeight || h);
        ctx.camera.aspect = rw / Math.max(1, rh);
        ctx.camera.updateProjectionMatrix();
        ctx.renderer.setSize(rw, rh);
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', onResize);
      }

      ctx._cleanupResize = onResize;
      ctx._el = el;
      onResize();

      if (typeof ResizeObserver !== 'undefined') {
        ctx._resizeObserver = new ResizeObserver(() => onResize());
        ctx._resizeObserver.observe(el);
      }
    };

    const tryStart = () => {
      if (disposed) return;
      const el =
        document.querySelector(`[data-testid="${mountId}"]`) || document.getElementById(mountId);
      if (!el) {
        rafWait = requestAnimationFrame(tryStart);
        return;
      }
      setup(el);
    };
    tryStart();

    return () => {
      disposed = true;
      cancelAnimationFrame(rafWait);
      if (ctx._resizeObserver) {
        ctx._resizeObserver.disconnect();
        ctx._resizeObserver = null;
      }
      if (typeof window !== 'undefined' && ctx._cleanupResize) {
        window.removeEventListener('resize', ctx._cleanupResize);
      }
      cancelAnimationFrame(ctx.raf);
      if (ctx.trackGroups && ctx.scene) {
        for (const g of [...ctx.trackGroups.values()]) {
          ctx.scene.remove(g);
          g.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
              if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
              else obj.material.dispose();
            }
          });
        }
        ctx.trackGroups.clear();
      }
      if (ctx.renderer) {
        ctx.renderer.dispose();
        if (ctx._el && ctx.renderer.domElement.parentNode === ctx._el) {
          ctx._el.removeChild(ctx.renderer.domElement);
        }
      }
      if (ctx.scene) {
        ctx.scene.traverse((obj) => {
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
            else obj.material.dispose();
          }
        });
      }
    };
  }, [mountId, width, height, mode]);

  if (Platform.OS !== 'web') {
    return null;
  }
  if (initError) {
    return (
      <View
        testID={mountId}
        nativeID={mountId}
        collapsable={false}
        style={[StyleSheet.absoluteFillObject, styles.errorOverlay]}
        pointerEvents="none"
      >
        <Text style={styles.errorTitle}>Advanced 3D unavailable</Text>
        <Text style={styles.errorBody}>{initError}</Text>
      </View>
    );
  }

  return (
    <View
      testID={mountId}
      nativeID={mountId}
      collapsable={false}
      style={[StyleSheet.absoluteFillObject, { zIndex: 1 }]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  errorOverlay: {
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.82)',
    paddingHorizontal: 22,
  },
  errorTitle: {
    color: '#F0F9FF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  errorBody: {
    color: '#BAE6FD',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 6,
  },
});
