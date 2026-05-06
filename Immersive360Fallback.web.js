import { useEffect, useId } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

function cloneLiveVideo(sourceEl) {
  if (!sourceEl || typeof sourceEl.captureStream !== 'function') return null;
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

function makeLoopVideo(src) {
  if (!src) return null;
  try {
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
  } catch {
    return null;
  }
}

function attachVideo(panel, video, tint) {
  if (!video) {
    panel.style.background = `linear-gradient(160deg, ${tint}33, #020617 70%)`;
    return null;
  }
  video.style.position = 'absolute';
  video.style.left = '0';
  video.style.top = '0';
  video.style.width = '100%';
  video.style.height = '100%';
  video.style.objectFit = 'cover';
  panel.appendChild(video);
  return video;
}

export default function Immersive360FallbackWeb({
  mode = 'riding',
  isRunning,
  frontVideoEl,
  leftUrl,
  rightUrl,
  rearUrl,
  fps = 0,
  pipelineMs = 0,
  sessionSec = 0,
  detectionsCount = 0,
}) {
  const mountId = `immersive360-fallback-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const root =
      document.querySelector(`[data-testid="${mountId}"]`) || document.getElementById(mountId);
    if (!root) return undefined;

    root.innerHTML = '';
    root.style.position = 'relative';
    root.style.overflow = 'hidden';
    root.style.background = '#020617';

    const wrap = document.createElement('div');
    wrap.style.position = 'absolute';
    wrap.style.inset = '0';
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = '18% 64% 18%';
    wrap.style.gridTemplateRows = '1fr';
    wrap.style.gap = '0';
    root.appendChild(wrap);

    const left = document.createElement('div');
    const center = document.createElement('div');
    const right = document.createElement('div');
    for (const el of [left, center, right]) {
      el.style.position = 'relative';
      el.style.overflow = 'hidden';
      wrap.appendChild(el);
    }

    const rearStrip = document.createElement('div');
    rearStrip.style.position = 'absolute';
    rearStrip.style.left = '18%';
    rearStrip.style.right = '18%';
    rearStrip.style.bottom = '0';
    rearStrip.style.height = '20%';
    rearStrip.style.overflow = 'hidden';
    rearStrip.style.borderTop = '1px solid rgba(34,211,238,0.35)';
    rearStrip.style.background = 'rgba(2,6,23,0.8)';
    root.appendChild(rearStrip);

    const frontContainer = document.createElement('div');
    frontContainer.style.position = 'absolute';
    frontContainer.style.inset = '0';
    frontContainer.style.pointerEvents = 'none';
    center.appendChild(frontContainer);
    const frontClone = cloneLiveVideo(frontVideoEl);
    const frontV = attachVideo(frontContainer, frontClone || frontVideoEl, '#22d3ee');
    if (frontV) frontV.style.filter = 'brightness(0.98) contrast(1.05)';

    const leftV = attachVideo(left, makeLoopVideo(leftUrl) || cloneLiveVideo(frontVideoEl), '#4ade80');
    const rightV = attachVideo(right, makeLoopVideo(rightUrl) || cloneLiveVideo(frontVideoEl), '#a78bfa');
    const rearV = attachVideo(rearStrip, makeLoopVideo(rearUrl) || cloneLiveVideo(frontVideoEl), '#f59e0b');
    if (leftV) leftV.style.filter = 'brightness(0.82) saturate(0.9)';
    if (rightV) rightV.style.filter = 'brightness(0.82) saturate(0.9)';
    if (rearV) rearV.style.filter = 'brightness(0.75) saturate(0.85)';

    const seamLeft = document.createElement('div');
    seamLeft.style.position = 'absolute';
    seamLeft.style.right = '-1px';
    seamLeft.style.top = '0';
    seamLeft.style.bottom = '0';
    seamLeft.style.width = '38px';
    seamLeft.style.background = 'linear-gradient(90deg, rgba(2,6,23,0.55), rgba(2,6,23,0))';
    left.appendChild(seamLeft);
    const seamRight = document.createElement('div');
    seamRight.style.position = 'absolute';
    seamRight.style.left = '-1px';
    seamRight.style.top = '0';
    seamRight.style.bottom = '0';
    seamRight.style.width = '38px';
    seamRight.style.background = 'linear-gradient(270deg, rgba(2,6,23,0.55), rgba(2,6,23,0))';
    right.appendChild(seamRight);

    const avatar = document.createElement('div');
    avatar.style.position = 'absolute';
    avatar.style.left = '50%';
    avatar.style.bottom = mode === 'walking' ? '18%' : '15%';
    avatar.style.transform = 'translateX(-50%)';
    avatar.style.width = mode === 'walking' ? '80px' : '130px';
    avatar.style.height = mode === 'walking' ? '160px' : '68px';
    avatar.style.borderRadius = mode === 'walking' ? '44px' : '14px';
    avatar.style.border = '1px solid rgba(255,255,255,0.45)';
    avatar.style.background =
      mode === 'walking'
        ? 'radial-gradient(circle at 50% 40%, #86efac 0%, #166534 85%)'
        : 'radial-gradient(circle at 50% 40%, #22d3ee 0%, #155e75 85%)';
    avatar.style.boxShadow = '0 0 22px rgba(34,211,238,0.35)';
    avatar.style.animation = 'immersive-bob 1.8s ease-in-out infinite';
    root.appendChild(avatar);

    const styleTag = document.createElement('style');
    styleTag.textContent = `
      @keyframes immersive-bob {
        0% { transform: translateX(-50%) translateY(0px); }
        50% { transform: translateX(-50%) translateY(-6px); }
        100% { transform: translateX(-50%) translateY(0px); }
      }
    `;
    root.appendChild(styleTag);

    const hud = document.createElement('div');
    hud.style.position = 'absolute';
    hud.style.left = '12px';
    hud.style.top = '10px';
    hud.style.padding = '8px 10px';
    hud.style.background = 'rgba(2,6,23,0.6)';
    hud.style.border = '1px solid rgba(34,211,238,0.45)';
    hud.style.color = '#dbeafe';
    hud.style.font = '600 12px Rajdhani,system-ui,sans-serif';
    hud.style.lineHeight = '1.2';
    hud.style.borderRadius = '8px';
    hud.style.whiteSpace = 'pre-line';
    hud.textContent = `${mode === 'walking' ? 'WALK' : 'RIDE'} · CSS 360 fallback
FPS ${fps.toFixed(1)} · LAT ${pipelineMs.toFixed(0)}ms
OBJ ${detectionsCount} · T ${Math.floor(sessionSec)}s${isRunning ? '' : '\nSTANDBY'}`;
    root.appendChild(hud);

    return () => {
      for (const v of [leftV, rightV, rearV, frontClone]) {
        if (v && typeof v.pause === 'function') {
          v.pause();
          if (v !== frontVideoEl) v.src = '';
        }
      }
      root.innerHTML = '';
    };
  }, [
    mountId,
    mode,
    isRunning,
    frontVideoEl,
    leftUrl,
    rightUrl,
    rearUrl,
    fps,
    pipelineMs,
    sessionSec,
    detectionsCount,
  ]);

  if (Platform.OS !== 'web') return null;
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

