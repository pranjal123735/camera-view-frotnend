/**
 * Tesla Autopilot-style visualization: 3D car model in center with objects moving around it.
 * Shows detected objects as 3D models positioned relative to the ego vehicle.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import * as THREE from 'three';

function bandColorHex(det) {
  const risk = Number(det?.risk_percent || 0);
  const ttc = Number(det?.ttc_s || 999);
  if (risk >= 75 || ttc < 1.8) return 0xff0000; // Red
  if (risk >= 40 || ttc < 3.5) return 0xff8800; // Orange
  return 0x00ff00; // Green
}

function detToWorldXZ(det, frameW) {
  const [x1, , x2] = det.bbox_xyxy.map(Number);
  const cx = (x1 + x2) / 2;
  const fw = Math.max(320, frameW || 1280);
  const dist = Math.max(1.0, Number(det.distance_m) || 6);
  const nx = cx / fw - 0.5; // -0.5 to 0.5
  const lateralM = nx * 2 * Math.min(12, dist * 0.4); // Lateral offset
  const forwardM = dist;
  return { lateralM, forwardZ: forwardM };
}

// Create Tesla-style ego vehicle (sportbike with rider - based on reference image)
function createEgoVehicle() {
  const group = new THREE.Group();
  
  // --- SPORTBIKE (Blue like in reference) ---
  
  // Main fairing/body (aerodynamic sportbike shape)
  const fairingGeo = new THREE.BoxGeometry(0.9, 0.6, 2.4);
  const fairingMat = new THREE.MeshStandardMaterial({
    color: 0x1e40af, // Deep blue like reference
    metalness: 0.8,
    roughness: 0.15,
  });
  const fairing = new THREE.Mesh(fairingGeo, fairingMat);
  fairing.position.y = 0.7;
  fairing.position.z = 0.2;
  group.add(fairing);

  // Front nose/windscreen area
  const noseGeo = new THREE.BoxGeometry(0.7, 0.4, 0.8);
  const noseMat = new THREE.MeshStandardMaterial({
    color: 0x1e40af,
    metalness: 0.9,
    roughness: 0.1,
  });
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.set(0, 0.9, 1.0);
  group.add(nose);

  // Windscreen
  const windscreenGeo = new THREE.BoxGeometry(0.5, 0.3, 0.05);
  const windscreenMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    metalness: 0.9,
    roughness: 0.05,
    transparent: true,
    opacity: 0.7,
  });
  const windscreen = new THREE.Mesh(windscreenGeo, windscreenMat);
  windscreen.position.set(0, 1.1, 1.4);
  windscreen.rotation.x = -0.2;
  group.add(windscreen);

  // Fuel tank (more pronounced)
  const tankGeo = new THREE.CapsuleGeometry(0.3, 1.0, 8, 16);
  const tankMat = new THREE.MeshStandardMaterial({
    color: 0x1e40af,
    metalness: 0.8,
    roughness: 0.2,
  });
  const tank = new THREE.Mesh(tankGeo, tankMat);
  tank.rotation.z = Math.PI / 2;
  tank.position.set(0, 1.0, 0.1);
  group.add(tank);

  // Seat/tail section
  const seatGeo = new THREE.BoxGeometry(0.6, 0.15, 1.2);
  const seatMat = new THREE.MeshStandardMaterial({
    color: 0x1f2937, // Dark seat
    metalness: 0.2,
    roughness: 0.8,
  });
  const seat = new THREE.Mesh(seatGeo, seatMat);
  seat.position.set(0, 1.0, -0.4);
  group.add(seat);

  // Rear tail fairing
  const tailGeo = new THREE.BoxGeometry(0.7, 0.4, 0.8);
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0x1e40af,
    metalness: 0.8,
    roughness: 0.15,
  });
  const tail = new THREE.Mesh(tailGeo, tailMat);
  tail.position.set(0, 0.8, -1.0);
  group.add(tail);

  // Front wheel (larger, sportbike style)
  const frontWheelGeo = new THREE.TorusGeometry(0.38, 0.1, 12, 24);
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    metalness: 0.6,
    roughness: 0.4,
  });
  const frontWheel = new THREE.Mesh(frontWheelGeo, wheelMat);
  frontWheel.rotation.y = Math.PI / 2;
  frontWheel.position.set(0, 0.38, 1.2);
  group.add(frontWheel);

  // Rear wheel (slightly wider)
  const rearWheelGeo = new THREE.TorusGeometry(0.38, 0.12, 12, 24);
  const rearWheel = new THREE.Mesh(rearWheelGeo, wheelMat.clone());
  rearWheel.rotation.y = Math.PI / 2;
  rearWheel.position.set(0, 0.38, -1.1);
  group.add(rearWheel);

  // Wheel rims (sport style)
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xe5e7eb, // Light silver
    metalness: 0.9,
    roughness: 0.1,
  });
  
  // Front rim with spokes
  const frontRimGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 6); // 6-spoke design
  const frontRim = new THREE.Mesh(frontRimGeo, rimMat);
  frontRim.rotation.z = Math.PI / 2;
  frontRim.position.set(0, 0.38, 1.2);
  group.add(frontRim);

  // Rear rim
  const rearRim = new THREE.Mesh(frontRimGeo, rimMat.clone());
  rearRim.rotation.z = Math.PI / 2;
  rearRim.position.set(0, 0.38, -1.1);
  group.add(rearRim);

  // Clip-on handlebars (low, aggressive)
  const handlebarGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.7, 8);
  const handlebarMat = new THREE.MeshStandardMaterial({
    color: 0x374151,
    metalness: 0.8,
    roughness: 0.2,
  });
  const handlebar = new THREE.Mesh(handlebarGeo, handlebarMat);
  handlebar.rotation.z = Math.PI / 2;
  handlebar.position.set(0, 1.0, 0.8);
  group.add(handlebar);

  // Dual headlights (sportbike style)
  const headlightGeo = new THREE.SphereGeometry(0.08, 12, 12);
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffff,
    emissiveIntensity: 1.0,
  });
  
  const leftHeadlight = new THREE.Mesh(headlightGeo, headlightMat);
  leftHeadlight.position.set(-0.15, 0.9, 1.35);
  group.add(leftHeadlight);
  
  const rightHeadlight = new THREE.Mesh(headlightGeo, headlightMat.clone());
  rightHeadlight.position.set(0.15, 0.9, 1.35);
  group.add(rightHeadlight);

  // Exhaust (single side-mounted)
  const exhaustGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.8, 12);
  const exhaustMat = new THREE.MeshStandardMaterial({
    color: 0x4a5568,
    metalness: 0.8,
    roughness: 0.2,
  });
  const exhaust = new THREE.Mesh(exhaustGeo, exhaustMat);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0.3, 0.5, -0.8);
  group.add(exhaust);

  // Front forks
  const forkGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8);
  const forkMat = new THREE.MeshStandardMaterial({
    color: 0x6b7280,
    metalness: 0.7,
    roughness: 0.3,
  });
  
  const leftFork = new THREE.Mesh(forkGeo, forkMat);
  leftFork.position.set(-0.15, 0.7, 1.2);
  group.add(leftFork);
  
  const rightFork = new THREE.Mesh(forkGeo, forkMat.clone());
  rightFork.position.set(0.15, 0.7, 1.2);
  group.add(rightFork);

  // --- RIDER (Aggressive sportbike position) ---
  
  // Rider body (very low, tucked position)
  const riderBodyGeo = new THREE.CapsuleGeometry(0.22, 0.7, 8, 16);
  const riderBodyMat = new THREE.MeshStandardMaterial({
    color: 0x111827, // Black racing leathers
    metalness: 0.4,
    roughness: 0.6,
  });
  const riderBody = new THREE.Mesh(riderBodyGeo, riderBodyMat);
  riderBody.position.set(0, 1.3, 0.0);
  riderBody.rotation.x = 0.5; // Very aggressive lean
  group.add(riderBody);

  // Racing helmet (aerodynamic)
  const helmetGeo = new THREE.SphereGeometry(0.16, 16, 16);
  const helmetMat = new THREE.MeshStandardMaterial({
    color: 0x1f2937, // Black helmet
    metalness: 0.7,
    roughness: 0.3,
  });
  const helmet = new THREE.Mesh(helmetGeo, helmetMat);
  helmet.position.set(0, 1.7, 0.4);
  group.add(helmet);

  // Helmet visor (tinted)
  const visorGeo = new THREE.SphereGeometry(0.14, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.9,
    roughness: 0.05,
    transparent: true,
    opacity: 0.9,
  });
  const visor = new THREE.Mesh(visorGeo, visorMat);
  visor.position.set(0, 1.7, 0.45);
  group.add(visor);

  // Racing suit arms (reaching low to clip-ons)
  const armGeo = new THREE.CapsuleGeometry(0.07, 0.45, 6, 8);
  const armMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    metalness: 0.4,
    roughness: 0.6,
  });
  
  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.position.set(-0.25, 1.15, 0.5);
  leftArm.rotation.x = 0.8; // Reaching down
  leftArm.rotation.z = 0.2;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, armMat.clone());
  rightArm.position.set(0.25, 1.15, 0.5);
  rightArm.rotation.x = 0.8;
  rightArm.rotation.z = -0.2;
  group.add(rightArm);

  // Racing gloves on handlebars
  const gloveGeo = new THREE.SphereGeometry(0.05, 8, 8);
  const gloveMat = new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    metalness: 0.3,
    roughness: 0.7,
  });
  
  const leftGlove = new THREE.Mesh(gloveGeo, gloveMat);
  leftGlove.position.set(-0.3, 1.0, 0.8);
  group.add(leftGlove);
  
  const rightGlove = new THREE.Mesh(gloveGeo, gloveMat.clone());
  rightGlove.position.set(0.3, 1.0, 0.8);
  group.add(rightGlove);

  // Rider legs (tucked up, knees near tank)
  const legGeo = new THREE.CapsuleGeometry(0.09, 0.5, 6, 8);
  const legMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    metalness: 0.4,
    roughness: 0.6,
  });
  
  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.position.set(-0.2, 1.0, -0.1);
  leftLeg.rotation.x = -0.6; // Knees up
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, legMat.clone());
  rightLeg.position.set(0.2, 1.0, -0.1);
  rightLeg.rotation.x = -0.6;
  group.add(rightLeg);

  // Racing boots (on rear-set footpegs)
  const bootGeo = new THREE.BoxGeometry(0.12, 0.06, 0.22);
  const bootMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    metalness: 0.5,
    roughness: 0.5,
  });
  
  const leftBoot = new THREE.Mesh(bootGeo, bootMat);
  leftBoot.position.set(-0.25, 0.6, -0.3);
  group.add(leftBoot);

  const rightBoot = new THREE.Mesh(bootGeo, bootMat.clone());
  rightBoot.position.set(0.25, 0.6, -0.3);
  group.add(rightBoot);

  // Store references for animation
  group.userData = {
    frontWheel,
    rearWheel,
    riderBody,
    helmet,
    leftArm,
    rightArm,
    fairing,
    tank
  };

  return group;
}

// Create detected object based on type
function createDetectedObject(det) {
  const group = new THREE.Group();
  const label = det.label.toLowerCase();
  const color = bandColorHex(det);

  let geometry, material;

  switch (label) {
    case 'car':
      geometry = new THREE.BoxGeometry(1.8, 0.6, 4.2);
      material = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.7,
        roughness: 0.3,
      });
      break;
    
    case 'truck':
    case 'bus':
      geometry = new THREE.BoxGeometry(2.5, 1.2, 8.0);
      material = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.6,
        roughness: 0.4,
      });
      break;
    
    case 'motorcycle':
    case 'bicycle':
      geometry = new THREE.BoxGeometry(0.6, 0.8, 1.8);
      material = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.5,
        roughness: 0.5,
      });
      break;
    
    case 'person':
      geometry = new THREE.CapsuleGeometry(0.3, 1.4, 8, 16);
      material = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.1,
        roughness: 0.8,
      });
      break;
    
    default:
      geometry = new THREE.BoxGeometry(1.0, 0.5, 1.0);
      material = new THREE.MeshStandardMaterial({
        color: color,
        metalness: 0.4,
        roughness: 0.6,
      });
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = geometry.parameters?.height ? geometry.parameters.height / 2 : 0.5;
  group.add(mesh);

  // Wireframe outline
  const wireframe = new THREE.WireframeGeometry(geometry);
  const wireframeMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.6,
  });
  const wireframeMesh = new THREE.LineSegments(wireframe, wireframeMat);
  wireframeMesh.position.y = mesh.position.y;
  group.add(wireframeMesh);

  // Distance label
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = '#ffffff';
  ctx.strokeRect(2, 2, 252, 60);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`${det.label.toUpperCase()}`, 128, 25);
  ctx.fillText(`${Number(det.distance_m || 0).toFixed(1)}m`, 128, 45);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMat = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.position.y = mesh.position.y + 1.5;
  sprite.scale.set(2, 0.5, 1);
  group.add(sprite);

  group.userData = { mesh, wireframeMesh, sprite, label: det.label };
  return group;
}

// Create road surface
function createRoadSurface() {
  const group = new THREE.Group();
  
  // Main road
  const roadGeo = new THREE.PlaneGeometry(20, 60);
  const roadMat = new THREE.MeshStandardMaterial({
    color: 0x2d3748,
    roughness: 0.9,
  });
  const road = new THREE.Mesh(roadGeo, roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.z = 15;
  group.add(road);

  // Lane markings
  for (let z = -15; z < 45; z += 4) {
    const markGeo = new THREE.PlaneGeometry(0.2, 2);
    const markMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
    });
    const mark = new THREE.Mesh(markGeo, markMat);
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(0, 0.01, z);
    group.add(mark);
  }

  // Side lines
  [-10, 10].forEach(x => {
    for (let z = -15; z < 45; z += 8) {
      const sideGeo = new THREE.PlaneGeometry(0.15, 4);
      const sideMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.6,
      });
      const sideLine = new THREE.Mesh(sideGeo, sideMat);
      sideLine.rotation.x = -Math.PI / 2;
      sideLine.position.set(x, 0.01, z);
      group.add(sideLine);
    }
  });

  return group;
}

export default function TeslaAutopilotView({ width, height, detections, frameSize, isRunning, mode = 'driving' }) {
  const mountId = `tesla-autopilot-${useId().replace(/:/g, '')}`;
  const [initError, setInitError] = useState('');
  const detectionsRef = useRef(detections);
  const frameSizeRef = useRef(frameSize);
  const isRunningRef = useRef(isRunning);

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
      egoVehicle: null,
      roadSurface: null,
      objectGroups: new Map(),
      raf: 0,
      _cleanupResize: null,
      _resizeObserver: null,
      _el: null,
    };

    const setup = (el) => {
      if (!el || disposed) return;

      const w = Math.max(280, width || 640);
      const h = Math.max(200, height || 480);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0f172a);
      scene.fog = new THREE.Fog(0x0f172a, 20, 80);

      // Tesla-style camera angle (slightly elevated, looking forward)
      const camera = new THREE.PerspectiveCamera(60, w / Math.max(1, h), 0.1, 200);
      camera.position.set(0, 12, -8);
      camera.lookAt(0, 0, 15);

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        setInitError('');
      } catch (e) {
        setInitError(`Tesla view unavailable: ${e?.message || 'WebGL disabled'}`);
        return;
      }
      renderer.setClearColor(0x0f172a, 1);
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

      // Create road surface
      ctx.roadSurface = createRoadSurface();
      scene.add(ctx.roadSurface);

      // Create ego vehicle (always at center)
      ctx.egoVehicle = createEgoVehicle();
      ctx.egoVehicle.position.set(0, 0, 0);
      scene.add(ctx.egoVehicle);

      // Lighting
      scene.add(new THREE.AmbientLight(0x404040, 0.4));
      
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(10, 20, 10);
      directionalLight.castShadow = true;
      directionalLight.shadow.camera.left = -30;
      directionalLight.shadow.camera.right = 30;
      directionalLight.shadow.camera.top = 30;
      directionalLight.shadow.camera.bottom = -30;
      scene.add(directionalLight);

      // Blue Tesla-style accent lighting
      const accentLight = new THREE.DirectionalLight(0x3b82f6, 0.3);
      accentLight.position.set(-10, 5, -10);
      scene.add(accentLight);

      ctx.scene = scene;
      ctx.camera = camera;
      ctx.renderer = renderer;

      const syncDetections = () => {
        const dets = detectionsRef.current || [];
        const fw = frameSizeRef.current?.w || 1280;
        const used = new Set();

        for (const d of dets.slice(0, 20)) {
          const id = String(d.track_id || d.label + Math.random());
          used.add(id);

          const { lateralM, forwardZ } = detToWorldXZ(d, fw);
          const x = lateralM;
          const z = forwardZ;

          let group = ctx.objectGroups.get(id);
          if (!group) {
            group = createDetectedObject(d);
            group.userData.tx = x;
            group.userData.tz = z;
            group.userData.fadeIn = 0;
            scene.add(group);
            ctx.objectGroups.set(id, group);
          }

          group.userData.tx = x;
          group.userData.tz = z;
          group.userData.lastDet = d;
        }

        // Remove objects no longer detected
        for (const [id, group] of [...ctx.objectGroups.entries()]) {
          if (!used.has(id)) {
            scene.remove(group);
            group.traverse((obj) => {
              if (obj.geometry) obj.geometry.dispose();
              if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
                else obj.material.dispose();
              }
            });
            ctx.objectGroups.delete(id);
          }
        }
      };

      const animate = () => {
        if (disposed) return;
        ctx.raf = requestAnimationFrame(animate);
        const t = Date.now() * 0.001;

        syncDetections();

        // Smooth object positions
        const alpha = 0.15;
        for (const group of ctx.objectGroups.values()) {
          const u = group.userData;
          if (u.tx != null && u.tz != null) {
            group.position.x += (u.tx - group.position.x) * alpha;
            group.position.z += (u.tz - group.position.z) * alpha;
          }

          // Fade in animation
          if (!u.fadeIn) u.fadeIn = 0;
          u.fadeIn = Math.min(1, u.fadeIn + 0.03);
          
          group.traverse((child) => {
            if (child.material && child.material.opacity !== undefined) {
              child.material.opacity = u.fadeIn;
            }
          });

          // Pulse high-risk objects
          if (u.lastDet) {
            const risk = Number(u.lastDet.risk_percent || 0);
            if (risk >= 75 && u.mesh) {
              const pulse = 0.5 + Math.sin(t * 8) * 0.5;
              u.mesh.material.emissiveIntensity = pulse * 0.3;
            }
          }
        }

        // Sportbike and rider animation (based on reference image)
        if (ctx.egoVehicle && isRunningRef.current) {
          const { frontWheel, rearWheel, riderBody, helmet, leftArm, rightArm, fairing, tank } = ctx.egoVehicle.userData;
          
          // Wheel rotation (fast spinning for sportbike)
          if (frontWheel) frontWheel.rotation.x = t * 4;
          if (rearWheel) rearWheel.rotation.x = t * 4;
          
          // Rider subtle movement (aggressive position breathing)
          if (riderBody) {
            riderBody.position.y = 1.3 + Math.sin(t * 2.5) * 0.015; // Controlled breathing
            riderBody.rotation.z = Math.sin(t * 1.2) * 0.02; // Minimal sway (tucked position)
          }
          
          // Helmet follows body (aerodynamic position)
          if (helmet) {
            helmet.position.y = 1.7 + Math.sin(t * 2.5) * 0.015;
            helmet.rotation.z = Math.sin(t * 1.2) * 0.02;
          }
          
          // Arms micro-adjustments (gripping clip-ons)
          if (leftArm) {
            leftArm.rotation.y = Math.sin(t * 4) * 0.03;
          }
          if (rightArm) {
            rightArm.rotation.y = Math.sin(t * 4 + Math.PI) * 0.03;
          }
          
          // Bike fairing vibration (high-performance engine)
          if (fairing) {
            fairing.position.y = 0.7 + Math.sin(t * 12) * 0.003;
          }
          
          // Tank subtle movement
          if (tank) {
            tank.position.y = 1.0 + Math.sin(t * 10) * 0.002;
          }
        } else if (ctx.egoVehicle) {
          // Idle state - minimal movement
          const { riderBody, helmet } = ctx.egoVehicle.userData;
          if (riderBody) {
            riderBody.position.y = 1.3 + Math.sin(t * 0.8) * 0.008;
          }
          if (helmet) {
            helmet.position.y = 1.7 + Math.sin(t * 0.8) * 0.008;
          }
        }

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
      if (ctx.objectGroups && ctx.scene) {
        for (const g of [...ctx.objectGroups.values()]) {
          ctx.scene.remove(g);
          g.traverse((obj) => {
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
              if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
              else obj.material.dispose();
            }
          });
        }
        ctx.objectGroups.clear();
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
        <Text style={styles.errorTitle}>Tesla Autopilot unavailable</Text>
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