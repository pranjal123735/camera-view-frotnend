import { useEffect, useId, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import * as THREE from 'three';

function makeLoopVideo(src) {
  const v = document.createElement('video');
  v.src = src;
  v.crossOrigin = 'anonymous';
  v.loop = true;
  v.muted = true;
  v.autoplay = true;
  v.playsInline = true;
  v.setAttribute('playsinline', 'true');
  v.setAttribute('webkit-playsinline', 'true');
  void v.play().catch(() => {});
  return v;
}

function cloneLiveVideo(sourceEl) {
  if (!sourceEl || typeof sourceEl.captureStream !== 'function') {
    return null;
  }
  try {
    const v = document.createElement('video');
    v.srcObject = sourceEl.captureStream();
    v.muted = true;
    v.autoplay = true;
    v.playsInline = true;
    v.setAttribute('playsinline', 'true');
    v.setAttribute('webkit-playsinline', 'true');
    void v.play().catch(() => {});
    return v;
  } catch {
    return null;
  }
}

function makeFallbackTexture(text, colorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 540;
  const g = canvas.getContext('2d');
  g.fillStyle = '#030712';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.strokeStyle = colorHex;
  g.lineWidth = 6;
  g.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);
  g.fillStyle = '#e2e8f0';
  g.font = 'bold 54px system-ui, sans-serif';
  g.fillText(text, 52, 290);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function panelMaterial(texture, featherLeft = 0.0, featherRight = 0.0) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uGain: { value: 1.0 },
      uFeatherLeft: { value: featherLeft },
      uFeatherRight: { value: featherRight },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uGain;
      uniform float uFeatherLeft;
      uniform float uFeatherRight;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(uMap, vUv);
        float leftAlpha = smoothstep(0.0, max(0.0001, uFeatherLeft), vUv.x);
        float rightAlpha = smoothstep(0.0, max(0.0001, uFeatherRight), 1.0 - vUv.x);
        float a = min(leftAlpha, rightAlpha);
        vec3 rgb = c.rgb * uGain;
        gl_FragColor = vec4(rgb, c.a * a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

function sampleVideoLuma(video, canvas, ctx) {
  if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
    return null;
  }
  try {
    const w = 48;
    const h = 28;
    canvas.width = w;
    canvas.height = h;
    ctx.drawImage(video, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    let s = 0;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      s += 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    return s / ((px.length / 4) * 255);
  } catch {
    return null;
  }
}

export default function Immersive360ViewWeb({
  width,
  height,
  mode = 'riding',
  isRunning,
  frontVideoEl,
  leftUrl,
  rightUrl,
  rearUrl,
  fps = 0,
  pipelineMs = 0,
  sessionSec = 0,
  frameDiagnostics = null,
  detectionsCount = 0,
  movingCount = 0,
}) {
  const mountId = `immersive360-${useId().replace(/:/g, '')}`;
  const [initError, setInitError] = useState('');
  const refs = useRef({
    scene: null,
    camera: null,
    renderer: null,
    raf: 0,
    cleanupResize: null,
    resizeObserver: null,
    rootEl: null,
    disposeList: [],
  });

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return undefined;
    }
    let root;
    let renderer;
    let hud;
    try {
      root =
        document.querySelector(`[data-testid="${mountId}"]`) || document.getElementById(mountId);
      if (!root) return undefined;

      const w = Math.max(280, width || 640);
      const h = Math.max(220, height || 480);
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x020617);
      scene.fog = new THREE.Fog(0x020617, 12, 55);

      const camera = new THREE.PerspectiveCamera(67, w / Math.max(1, h), 0.1, 120);
      camera.position.set(0, 1.8, 0.1);
      camera.lookAt(0, 1.5, 3);

      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        setInitError('');
      } catch (e) {
        setInitError(
          `Immersive 360 renderer failed: ${e?.message || 'WebGL not available on this browser/device'}`
        );
        return undefined;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h);
      if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      root.innerHTML = '';
      root.appendChild(renderer.domElement);
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.display = 'block';

      hud = document.createElement('div');
      hud.style.position = 'absolute';
      hud.style.left = '14px';
      hud.style.right = '14px';
      hud.style.top = '12px';
      hud.style.pointerEvents = 'none';
      hud.style.display = 'flex';
      hud.style.justifyContent = 'space-between';
      hud.style.gap = '12px';
      hud.style.fontFamily = 'Rajdhani, system-ui, sans-serif';
      hud.style.zIndex = '4';
      const hudLeft = document.createElement('div');
      const hudRight = document.createElement('div');
      for (const el of [hudLeft, hudRight]) {
        el.style.padding = '10px 12px';
        el.style.border = '1px solid rgba(34,211,238,0.32)';
        el.style.background = 'rgba(2,6,23,0.68)';
        el.style.backdropFilter = 'blur(10px)';
        el.style.color = '#dbeafe';
        el.style.fontSize = '13px';
        el.style.lineHeight = '1.25';
        el.style.whiteSpace = 'pre-line';
        el.style.borderRadius = '10px';
      }
      hud.appendChild(hudLeft);
      hud.appendChild(hudRight);
      root.style.position = 'relative';
      root.appendChild(hud);

    scene.add(new THREE.AmbientLight(0xffffff, 0.48));

    const hemi = new THREE.HemisphereLight(0x67e8f9, 0x0f172a, 0.45);
    hemi.position.set(0, 10, 0);
    scene.add(hemi);

    const road = new THREE.Mesh(
      new THREE.CircleGeometry(13, 64),
      new THREE.MeshStandardMaterial({
        color: 0x0b1226,
        roughness: 0.95,
        metalness: 0.02,
      })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = -0.02;
    scene.add(road);

    const avatarGeo =
      mode === 'walking'
        ? new THREE.CapsuleGeometry(0.38, 1.05, 7, 14)
        : new THREE.BoxGeometry(1.5, 0.62, 2.6);
    const avatar = new THREE.Mesh(
      avatarGeo,
      new THREE.MeshStandardMaterial({
        color: mode === 'walking' ? 0x86efac : 0x38bdf8,
        emissive: mode === 'walking' ? 0x14532d : 0x083344,
        emissiveIntensity: 0.68,
        roughness: 0.45,
        metalness: 0.12,
      })
    );
    avatar.position.set(0, mode === 'walking' ? 1.0 : 0.38, 2.1);
    scene.add(avatar);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.045, 12, 64),
      new THREE.MeshBasicMaterial({
        color: mode === 'walking' ? 0x86efac : 0x22d3ee,
        transparent: true,
        opacity: 0.45,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.04;
    scene.add(ring);

    const mkPanel = (x, z, ry, tex, labelColor, featherLeft, featherRight, gainRef) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(16.9, 9), panelMaterial(tex, featherLeft, featherRight));
      m.position.set(x, 4.0, z);
      m.rotation.y = ry;
      scene.add(m);

      const frame = new THREE.Mesh(
        new THREE.PlaneGeometry(16.25, 9.25),
        new THREE.MeshBasicMaterial({
          color: labelColor,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
        })
      );
      frame.position.copy(m.position);
      frame.rotation.y = m.rotation.y;
      frame.position.x += Math.sin(ry) * 0.04;
      frame.position.z += Math.cos(ry) * 0.04;
      scene.add(frame);
      return [m, frame, gainRef];
    };

    const sideLeftVideo = leftUrl ? makeLoopVideo(leftUrl) : cloneLiveVideo(frontVideoEl);
    const sideRightVideo = rightUrl ? makeLoopVideo(rightUrl) : cloneLiveVideo(frontVideoEl);
    const rearVideo = rearUrl ? makeLoopVideo(rearUrl) : cloneLiveVideo(frontVideoEl);
    const frontTexture =
      frontVideoEl || sideLeftVideo
        ? new THREE.VideoTexture(frontVideoEl || sideLeftVideo)
        : makeFallbackTexture('FRONT CAMERA', '#22d3ee');
    const leftTexture = sideLeftVideo
      ? new THREE.VideoTexture(sideLeftVideo)
      : makeFallbackTexture('LEFT FEED', '#4ade80');
    const rightTexture = sideRightVideo
      ? new THREE.VideoTexture(sideRightVideo)
      : makeFallbackTexture('RIGHT FEED', '#a78bfa');
    const rearTexture = rearVideo
      ? new THREE.VideoTexture(rearVideo)
      : makeFallbackTexture('REAR FEED', '#f59e0b');

    [frontTexture, leftTexture, rightTexture, rearTexture].forEach((t) => {
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
    });

    const panelRadius = 11.7;
    const panelGains = {
      front: { value: 1.0 },
      left: { value: 1.0 },
      right: { value: 1.0 },
      rear: { value: 1.0 },
    };
    const parts = [
      ...mkPanel(0, panelRadius, Math.PI, frontTexture, 0x22d3ee, 0.2, 0.2, panelGains.front),
      ...mkPanel(-panelRadius, 0, Math.PI / 2, leftTexture, 0x4ade80, 0.2, 0.2, panelGains.left),
      ...mkPanel(panelRadius, 0, -Math.PI / 2, rightTexture, 0xa78bfa, 0.2, 0.2, panelGains.right),
      ...mkPanel(0, -panelRadius, 0, rearTexture, 0xf59e0b, 0.2, 0.2, panelGains.rear),
    ];
    const panelMeshes = [parts[0], parts[3], parts[6], parts[9]];
    if (panelMeshes[0]?.material?.uniforms) panelMeshes[0].material.uniforms.uGain.value = panelGains.front.value;
    if (panelMeshes[1]?.material?.uniforms) panelMeshes[1].material.uniforms.uGain.value = panelGains.left.value;
    if (panelMeshes[2]?.material?.uniforms) panelMeshes[2].material.uniforms.uGain.value = panelGains.right.value;
    if (panelMeshes[3]?.material?.uniforms) panelMeshes[3].material.uniforms.uGain.value = panelGains.rear.value;

    refs.current.disposeList = [
      ...parts,
      road,
      avatar,
      ring,
      frontTexture,
      leftTexture,
      rightTexture,
      rearTexture,
      sideLeftVideo,
      sideRightVideo,
      rearVideo,
    ];

    let alive = true;
    const lumaCanvas = document.createElement('canvas');
    const lumaCtx = lumaCanvas.getContext('2d');
    let lastColorSyncAt = 0;
    let yawTarget = 0;
    let yawSmooth = 0;
    let yawPrev = 0;
    let yawVel = 0;
    let lastYawTs = Date.now();
    let seamSmooth = 0.2;

    const normalizeAngle = (deg) => {
      let v = deg;
      while (v > 180) v -= 360;
      while (v < -180) v += 360;
      return v;
    };

    const onOrientation = (e) => {
      if (typeof e.alpha !== 'number') return;
      yawTarget = normalizeAngle(e.alpha) / 180;
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('deviceorientation', onOrientation);
    }

      const loop = () => {
        if (!alive) return;
        refs.current.raf = requestAnimationFrame(loop);
        try {
          const nowMs = Date.now();
          const t = nowMs * 0.001;
      const dt = Math.max(0.001, (nowMs - lastYawTs) / 1000);
      lastYawTs = nowMs;
      yawSmooth += (yawTarget - yawSmooth) * 0.06;
      const yawDelta = yawSmooth - yawPrev;
      yawVel = yawVel * 0.84 + (yawDelta / dt) * 0.16;
      yawPrev = yawSmooth;
      const turnNorm = Math.max(-1, Math.min(1, yawVel * 0.12));
      seamSmooth += ((isRunning ? 0.23 : 0.18) + Math.abs(turnNorm) * 0.05 - seamSmooth) * 0.08;

      ring.rotation.z = t * 0.25;
      avatar.rotation.y = Math.sin(t * 1.8) * (mode === 'walking' ? 0.12 : 0.05);
      if (isRunning) {
        avatar.position.y = (mode === 'walking' ? 1.0 : 0.38) + Math.sin(t * 4.2) * 0.02;
      }
      if (lumaCtx && nowMs - lastColorSyncAt > 420) {
        lastColorSyncAt = nowMs;
        const baseL = sampleVideoLuma(frontVideoEl, lumaCanvas, lumaCtx);
        if (baseL != null) {
          const syncOne = (video, mesh, key) => {
            const l = sampleVideoLuma(video, lumaCanvas, lumaCtx);
            if (l == null || !mesh?.material?.uniforms) return;
            const raw = Math.max(0.72, Math.min(1.28, baseL / Math.max(0.04, l)));
            panelGains[key].value = panelGains[key].value * 0.75 + raw * 0.25;
            mesh.material.uniforms.uGain.value = panelGains[key].value;
          };
          syncOne(sideLeftVideo, panelMeshes[1], 'left');
          syncOne(sideRightVideo, panelMeshes[2], 'right');
          syncOne(rearVideo, panelMeshes[3], 'rear');
        }
      }
      if (panelMeshes[0]?.material?.uniforms) {
        panelMeshes[0].material.uniforms.uFeatherLeft.value = seamSmooth;
        panelMeshes[0].material.uniforms.uFeatherRight.value = seamSmooth;
      }
      if (panelMeshes[1]?.material?.uniforms) {
        panelMeshes[1].material.uniforms.uFeatherLeft.value = seamSmooth;
        panelMeshes[1].material.uniforms.uFeatherRight.value = seamSmooth;
      }
      if (panelMeshes[2]?.material?.uniforms) {
        panelMeshes[2].material.uniforms.uFeatherLeft.value = seamSmooth;
        panelMeshes[2].material.uniforms.uFeatherRight.value = seamSmooth;
      }
      if (panelMeshes[3]?.material?.uniforms) {
        panelMeshes[3].material.uniforms.uFeatherLeft.value = seamSmooth;
        panelMeshes[3].material.uniforms.uFeatherRight.value = seamSmooth;
      }

      const headingShift = yawSmooth * 0.55;
      const frontBias = Math.max(-0.08, Math.min(0.08, yawSmooth * 0.05));
      if (frontTexture.offset) frontTexture.offset.x = 0.5 + frontBias - 0.5;
      if (leftTexture.offset) leftTexture.offset.x = Math.max(-0.09, Math.min(0.09, -headingShift * 0.08));
      if (rightTexture.offset) rightTexture.offset.x = Math.max(-0.09, Math.min(0.09, headingShift * 0.08));
      if (rearTexture.offset) rearTexture.offset.x = Math.max(-0.12, Math.min(0.12, headingShift * 0.04));

      if (panelMeshes[0]) panelMeshes[0].rotation.y = Math.PI + yawSmooth * 0.08;
      if (panelMeshes[1]) panelMeshes[1].rotation.y = Math.PI / 2 + turnNorm * 0.04;
      if (panelMeshes[2]) panelMeshes[2].rotation.y = -Math.PI / 2 + turnNorm * 0.04;
      if (panelMeshes[3]) panelMeshes[3].rotation.y = turnNorm * 0.05;

      if (panelMeshes[1]) panelMeshes[1].position.z = turnNorm * 0.7;
      if (panelMeshes[2]) panelMeshes[2].position.z = turnNorm * 0.7;
      if (panelMeshes[3]) panelMeshes[3].position.x = -turnNorm * 0.8;

      camera.position.x += ((yawSmooth * 1.2) - camera.position.x) * 0.06;
      camera.lookAt(0, mode === 'walking' ? 1.5 : 1.2, 4.2);
      hudLeft.textContent = `${mode === 'walking' ? 'WALK' : 'RIDE'} · 360 LIVE\nFPS ${fps.toFixed(
        1
      )} · LAT ${pipelineMs.toFixed(0)}ms\nOBJ ${detectionsCount} · MOV ${movingCount}`;
      hudRight.textContent = `Scene ${frameDiagnostics?.quality_hint || 'ok'}\nYaw ${Math.round(
        yawSmooth * 180
      )}° · Turn ${turnNorm.toFixed(2)}\nSession ${Math.floor(sessionSec / 60)
        .toString()
        .padStart(2, '0')}:${Math.floor(sessionSec % 60)
        .toString()
        .padStart(2, '0')}`;
          renderer.render(scene, camera);
        } catch (e) {
          alive = false;
          setInitError(`Immersive 360 runtime failed: ${e?.message || 'unknown render error'}`);
        }
      };
      loop();

      const resize = () => {
        const rw = Math.max(280, root.clientWidth || w);
        const rh = Math.max(220, root.clientHeight || h);
        camera.aspect = rw / Math.max(1, rh);
        camera.updateProjectionMatrix();
        renderer.setSize(rw, rh);
      };
      window.addEventListener('resize', resize);
      const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
      if (ro) ro.observe(root);
      resize();

      refs.current.scene = scene;
      refs.current.camera = camera;
      refs.current.renderer = renderer;
      refs.current.cleanupResize = resize;
      refs.current.resizeObserver = ro;
      refs.current.rootEl = root;

      return () => {
        alive = false;
        cancelAnimationFrame(refs.current.raf);
        if (refs.current.resizeObserver) refs.current.resizeObserver.disconnect();
        window.removeEventListener('resize', resize);
        if (typeof window !== 'undefined') {
          window.removeEventListener('deviceorientation', onOrientation);
        }

        refs.current.disposeList.forEach((obj) => {
          if (!obj) return;
          if (obj.pause) {
            obj.pause();
            obj.src = '';
            return;
          }
          if (obj.geometry) obj.geometry.dispose();
          if (obj.material) obj.material.dispose();
          if (obj.dispose) obj.dispose();
        });
        if (renderer) renderer.dispose();
        if (hud && hud.parentNode === root) {
          root.removeChild(hud);
        }
        if (root && renderer?.domElement?.parentNode === root) {
          root.removeChild(renderer.domElement);
        }
      };
    } catch (e) {
      setInitError(`Immersive 360 setup failed: ${e?.message || 'unknown setup error'}`);
      return undefined;
    }
  }, [
    mountId,
    width,
    height,
    mode,
    isRunning,
    frontVideoEl,
    leftUrl,
    rightUrl,
    rearUrl,
    fps,
    pipelineMs,
    sessionSec,
    frameDiagnostics,
    detectionsCount,
    movingCount,
  ]);

  if (Platform.OS !== 'web') {
    return null;
  }
  if (initError) {
    return (
      <View style={[StyleSheet.absoluteFillObject, styles.errorOverlay]} pointerEvents="none">
        <Text style={styles.errorTitle}>Immersive 360 unavailable</Text>
        <Text style={styles.errorBody}>{initError}</Text>
        <Text style={styles.errorBody}>Switch fullscreen scene to Birds-Eye, or open in Chrome/Edge.</Text>
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
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.86)',
    paddingHorizontal: 24,
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

