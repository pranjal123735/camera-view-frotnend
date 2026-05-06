/**
 * Realistic 3D Scene that builds environment from actual camera detections.
 * No default road/buildings — only shows what the camera actually sees.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import * as THREE from 'three';

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

// --- Create realistic avatar based on what's detected ---
function createRealisticAvatar(detections) {
  const group = new THREE.Group();
  
  // Check if a person is detected (you in the camera)
  const personDet = detections.find(d => d.label === 'person');
  
  if (personDet) {
    // Create avatar based on detected person
    const [x1, y1, x2, y2] = personDet.bbox_xyxy.map(Number);
    const width = (x2 - x1) / 100; // Scale to world units
    const height = (y2 - y1) / 100;
    
    // Sitting person (since you're at laptop)
    const bodyGeo = new THREE.BoxGeometry(width * 0.8, height * 0.6, width * 0.5);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      metalness: 0.2,
      roughness: 0.7,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = height * 0.3;
    group.add(body);

    // Head
    const headSize = width * 0.3;
    const headGeo = new THREE.SphereGeometry(headSize, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      metalness: 0.1,
      roughness: 0.8,
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = height * 0.8;
    group.add(head);
  } else {
    // Default minimal avatar if no person detected
    const bodyGeo = new THREE.BoxGeometry(0.4, 0.6, 0.3);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x6b7280,
      metalness: 0.2,
      roughness: 0.7,
      transparent: true,
      opacity: 0.5,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.3;
    group.add(body);
  }

  return group;
}

// --- Create 3D object based on detection ---
function createDetectedObject(det) {
  const group = new THREE.Group();
  const label = det.label.toLowerCase();
  const [x1, y1, x2, y2] = det.bbox_xyxy.map(Number);
  const width = Math.max(0.2, (x2 - x1) / 200);
  const height = Math.max(0.2, (y2 - y1) / 200);
  const depth = Math.min(width, height) * 0.8;

  let color = 0x6b7280; // Default gray
  let geometry;

  // Create geometry based on detected object type
  switch (label) {
    case 'laptop':
    case 'computer':
      geometry = new THREE.BoxGeometry(width, height * 0.3, depth);
      color = 0x1f2937;
      break;
    case 'cell phone':
    case 'phone':
      geometry = new THREE.BoxGeometry(width * 0.6, height, depth * 0.2);
      color = 0x000000;
      break;
    case 'book':
      geometry = new THREE.BoxGeometry(width, height * 0.1, depth);
      color = 0x7c2d12;
      break;
    case 'cup':
    case 'bottle':
      geometry = new THREE.CylinderGeometry(width * 0.3, width * 0.4, height, 12);
      color = 0xfbbf24;
      break;
    case 'chair':
      geometry = new THREE.BoxGeometry(width, height, depth);
      color = 0x78350f;
      break;
    case 'tv':
    case 'monitor':
      geometry = new THREE.BoxGeometry(width, height, depth * 0.2);
      color = 0x000000;
      break;
    case 'clock':
      geometry = new THREE.CylinderGeometry(width * 0.4, width * 0.4, depth * 0.2, 16);
      color = 0xffffff;
      break;
    default:
      // Generic box for unknown objects
      geometry = new THREE.BoxGeometry(width, height, depth);
      color = bandColorHex(det);
  }

  const material = new THREE.MeshStandardMaterial({
    color: color,
    metalness: 0.3,
    roughness: 0.6,
    transparent: true,
    opacity: 0,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = height / 2;
  group.add(mesh);

  // Add wireframe for better visibility
  const wireframe = new THREE.WireframeGeometry(geometry);
  const wireframeMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
  });
  const wireframeMesh = new THREE.LineSegments(wireframe, wireframeMat);
  wireframeMesh.position.y = height / 2;
  group.add(wireframeMesh);

  group.userData = { mesh, wireframeMesh, label: det.label };
  return group;
}

// --- Create room environment based on detections ---
function createRoomEnvironment(scene, detections) {
  // Only create walls/floor if we detect indoor objects
  const indoorObjects = detections.filter(d => 
    ['laptop', 'computer', 'chair', 'book', 'cup', 'tv', 'monitor', 'clock', 'cell phone'].includes(d.label.toLowerCase())
  );

  if (indoorObjects.length > 0) {
    // Simple room floor
    const floorGeo = new THREE.PlaneGeometry(20, 20);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x8b5cf6,
      roughness: 0.8,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    scene.add(floor);

    // Back wall (where camera is pointing)
    const wallGeo = new THREE.PlaneGeometry(20, 10);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xe5e7eb,
      roughness: 0.9,
    });
    const backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(0, 5, 10);
    scene.add(backWall);

    // Side walls
    const leftWall = new THREE.Mesh(wallGeo, wallMat.clone());
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-10, 5, 0);
    scene.add(leftWall);

    const rightWall = new THREE.Mesh(wallGeo, wallMat.clone());
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(10, 5, 0);
    scene.add(rightWall);
  }
}

export default function Realistic3DScene({ width, height, detections, frameSize, isRunning, mode = 'sitting' }) {
  const mountId = `realistic3d-${useId().replace(/:/g, '')}`;
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
      avatar: null,
      objectGroups: new Map(),
      raf: 0,
      cameraAngle: 0,
      cameraDistance: 8,
      cameraHeight: 4,
      lastDetectionCount: 0,
      _cleanupResize: null,
      _resizeObserver: null,
      _el: null,
    };

    const setup = (el) => {
      if (!el || disposed) return;

      const w = Math.max(280, width || 640);
      const h = Math.max(200, height || 480);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1e293b);
      scene.fog = new THREE.Fog(0x1e293b, 10, 30);

      const camera = new THREE.PerspectiveCamera(75, w / Math.max(1, h), 0.1, 100);
      camera.up.set(0, 1, 0);

      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        setInitError('');
      } catch (e) {
        setInitError(`3D renderer unavailable: ${e?.message || 'WebGL disabled'}`);
        return;
      }
      renderer.setClearColor(0x1e293b, 1);
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

      // Lighting for indoor scene
      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      
      const roomLight = new THREE.DirectionalLight(0xffffff, 0.8);
      roomLight.position.set(5, 8, 5);
      roomLight.castShadow = true;
      roomLight.shadow.camera.left = -15;
      roomLight.shadow.camera.right = 15;
      roomLight.shadow.camera.top = 15;
      roomLight.shadow.camera.bottom = -15;
      scene.add(roomLight);

      // Soft fill light
      const fillLight = new THREE.DirectionalLight(0x87ceeb, 0.3);
      fillLight.position.set(-5, 3, -5);
      scene.add(fillLight);

      ctx.scene = scene;
      ctx.camera = camera;
      ctx.renderer = renderer;

      const syncDetections = () => {
        const dets = detectionsRef.current || [];
        const fw = frameSizeRef.current?.w || 1280;
        const used = new Set();

        // Recreate environment if detection count changed significantly
        if (Math.abs(dets.length - ctx.lastDetectionCount) > 2) {
          // Clear old environment
          const toRemove = [];
          scene.traverse((obj) => {
            if (obj.userData.isEnvironment) {
              toRemove.push(obj);
            }
          });
          toRemove.forEach(obj => scene.remove(obj));

          // Create new environment based on current detections
          createRoomEnvironment(scene, dets);
          ctx.lastDetectionCount = dets.length;
        }

        // Update avatar based on person detection
        if (ctx.avatar) {
          scene.remove(ctx.avatar);
        }
        ctx.avatar = createRealisticAvatar(dets);
        ctx.avatar.position.set(0, 0, 0);
        scene.add(ctx.avatar);

        // Update detected objects
        for (const d of dets.slice(0, 15)) {
          if (d.label === 'person') continue; // Skip person (that's the avatar)
          
          const id = String(d.track_id || d.label + Math.random());
          used.add(id);

          const { lateralM, forwardZ } = detToWorldXZ(d, fw);
          const x = lateralM;
          const z = 2 + forwardZ * 0.8;

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

        // Smooth object positions and fade in
        const alpha = 0.2;
        for (const group of ctx.objectGroups.values()) {
          const u = group.userData;
          if (u.tx != null) {
            group.position.x += (u.tx - group.position.x) * alpha;
            group.position.z += (u.tz - group.position.z) * alpha;
          }

          // Fade in animation
          if (!u.fadeIn) u.fadeIn = 0;
          u.fadeIn = Math.min(1, u.fadeIn + 0.03);
          
          if (u.mesh && u.mesh.material) {
            u.mesh.material.opacity = u.fadeIn;
          }
          if (u.wireframeMesh && u.wireframeMesh.material) {
            u.wireframeMesh.material.opacity = u.fadeIn * 0.5;
          }
        }

        // Gentle camera orbit around the scene
        ctx.cameraAngle += 0.002;
        const camX = Math.sin(ctx.cameraAngle) * ctx.cameraDistance;
        const camZ = Math.cos(ctx.cameraAngle) * ctx.cameraDistance;
        camera.position.set(camX, ctx.cameraHeight, camZ);
        camera.lookAt(0, 2, 3);

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
        <Text style={styles.errorTitle}>Realistic 3D unavailable</Text>
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