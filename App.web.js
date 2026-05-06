import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import BirdseyeSceneWeb from './BirdseyeScene.web';
import Advanced3DSceneWeb from './Advanced3DScene.web';
import Realistic3DSceneWeb from './Realistic3DScene.web';
import TeslaStyleView from './TeslaStyleView.web';
import TeslaAutopilotView from './TeslaAutopilotView.web';
import Immersive360ViewWeb from './Immersive360View.web';
import Immersive360FallbackWeb from './Immersive360Fallback.web';
import Motorcycle360Vision from './Motorcycle360Vision.web';
import SurroundVisionRenderer from './SurroundVisionRenderer.web';

// Import new components
import EnhancedDashboard from './components/EnhancedDashboard';
import AdvancedSettings, { THEMES } from './components/AdvancedSettings';
import AnalyticsVisualization from './components/AnalyticsVisualization';

// Import PWA functionality
import { initializePWA, scheduleBackgroundSync, cacheManager } from './pwa-config';

const CAPTURE_INTERVAL_MS = 450;
const ALERT_COOLDOWN_MS = 5000;
const RADAR_GHOST_MS = 480;
const DEFAULT_BACKEND_URL = (() => {
  if (process.env.EXPO_PUBLIC_BACKEND_URL) return process.env.EXPO_PUBLIC_BACKEND_URL;
  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    // 0.0.0.0 is a server bind address — browsers can't connect to it; use localhost instead.
    const host = hostname === '0.0.0.0' ? 'localhost' : hostname;
    return `${protocol}//${host}:8001`;
  }
  return 'http://127.0.0.1:8001';
})();

/** Web-only glass panel (react-native-web). */
const HUD_SHEET_GLASS =
  Platform.OS === 'web'
    ? {
        backgroundColor: 'rgba(6, 11, 28, 0.88)',
        borderColor: 'rgba(45, 212, 191, 0.42)',
        borderWidth: 1,
        backdropFilter: 'blur(22px)',
        WebkitBackdropFilter: 'blur(22px)',
      }
    : {
        backgroundColor: 'rgba(6, 11, 28, 0.96)',
        borderColor: 'rgba(45, 212, 191, 0.35)',
        borderWidth: 1,
      };

function getRiskBand(det) {
  const risk = Number(det?.risk_percent || 0);
  const ttc = Number(det?.ttc_s || 999);
  if (risk >= 75 || ttc < 1.8) return 'DANGER';
  if (risk >= 40 || ttc < 3.5) return 'CAUTION';
  return 'SAFE';
}

function riskColor(band) {
  if (band === 'DANGER') return '#DC2626';
  if (band === 'CAUTION') return '#D97706';
  return '#059669';
}

function sparkBarColor(score) {
  if (score >= 72) return '#F87171';
  if (score >= 45) return '#FBBF24';
  if (score >= 22) return '#22D3EE';
  return 'rgba(45, 212, 191, 0.4)';
}

function formatSessionClock(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}

function detectionBand(det) {
  return getRiskBand(det);
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function threatScore(det) {
  const distanceM = Number(det?.distance_m || 120);
  const speedKmh = Number(det?.speed_kmh || 0);
  const risk = Number(det?.risk_percent || 0);
  const moving = !!det?.is_moving;

  const distanceFactor = clamp01((45 - distanceM) / 45);
  const speedFactor = moving ? clamp01(speedKmh / 70) : 0;
  const riskFactor = clamp01(risk / 100);

  const raw = distanceFactor * 0.45 + speedFactor * 0.25 + riskFactor * 0.3;
  return Math.round(raw * 100);
}

function radarPoint(det, frameW, frameH) {
  const [x1, y1, x2] = det.bbox_xyxy;
  const cx = (x1 + x2) / 2;
  const nx = clamp01(cx / Math.max(frameW, 1)); // 0..1 left->right
  const distanceM = Number(det?.distance_m || 120);
  const ny = clamp01(distanceM / 80); // farther => lower on radar
  return { xNorm: nx, yNorm: ny };
}

function mapBoxToOverlay(bbox, frameW, frameH, viewW, viewH) {
  const [x1, y1, x2, y2] = bbox;
  return {
    left: (x1 / frameW) * viewW,
    top: (y1 / frameH) * viewH,
    width: ((x2 - x1) / frameW) * viewW,
    height: ((y2 - y1) / frameH) * viewH,
  };
}

class SceneErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    if (this.props.onError) {
      this.props.onError(error);
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || null;
    }
    return this.props.children;
  }
}

/** COCO classes often confused with analog/digital speedometers when the lens sees the cluster. */
const DASHBOARD_INTERIOR_LABELS = new Set(['clock', 'tv']);

function filterInstrumentClusterFalsePositives(detections, frameH) {
  if (!detections?.length || frameH <= 1) {
    return detections || [];
  }
  return detections.filter((d) => {
    const lab = String(d.label || '')
      .trim()
      .toLowerCase()
      .replace(/_/g, ' ');
    if (!DASHBOARD_INTERIOR_LABELS.has(lab)) {
      return true;
    }
    const b = d.bbox_xyxy;
    if (!b || b.length < 4) {
      return true;
    }
    const [, y1, , y2] = b.map(Number);
    const cy = (y1 + y2) / 2;
    const cyNorm = cy / frameH;
    const bottomNorm = y2 / frameH;
    if (cyNorm >= 0.4 || bottomNorm >= 0.56) {
      return false;
    }
    return true;
  });
}

/**
 * Best-effort rider tuning via MediaStreamTrack.applyConstraints (Chrome/Android often exposes
 * focus distance + exposure; iOS Safari usually does not). Call from HTTPS.
 *
 * Goals: (1) continuous AE/AWB so the whole pipeline meters the scene, not a random corner;
 * (2) points-of-interest toward the road horizon to steer AF/AE away from the dash;
 * (3) pull exposure down when the server flags highlight / glare;
 * (4) optional sharpness if the device exposes it.
 */
async function applyRiderCameraTracks(stream, opts) {
  const {
    roadFocusFar,
    nightBoost,
    torch,
    sceneStable,
    roadPoiBias,
    antiHighlightBloom,
    glareRisk,
    detailBoost,
  } = opts;
  const track = stream.getVideoTracks()[0];
  if (!track?.applyConstraints) {
    return 'Camera: no constraint API';
  }
  const caps = typeof track.getCapabilities === 'function' ? track.getCapabilities() : {};
  const hints = [];

  try {
    if (sceneStable) {
      const adv = [];
      if (caps.exposureMode?.includes?.('continuous')) {
        adv.push({ exposureMode: 'continuous' });
      }
      if (caps.whiteBalanceMode?.includes?.('continuous')) {
        adv.push({ whiteBalanceMode: 'continuous' });
      }
      if (adv.length) {
        await track.applyConstraints({ advanced: adv });
        hints.push('AE/AWB');
      }
    }
  } catch {
    hints.push('AE/AWB n/a');
  }

  try {
    if (roadPoiBias) {
      const poi = { x: 0.5, y: 0.2 };
      await track.applyConstraints({ advanced: [{ pointsOfInterest: [poi] }] });
      hints.push('road POI');
    }
  } catch {
    hints.push('POI n/a');
  }

  try {
    if (roadFocusFar && caps.focusDistance) {
      const far = caps.focusDistance.max;
      await track.applyConstraints({ advanced: [{ focusMode: 'manual', focusDistance: far }] });
      hints.push('far focus');
    } else if (!roadFocusFar && caps.focusMode?.includes?.('continuous')) {
      await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      hints.push('cont.AF');
    }
  } catch {
    hints.push('focus n/a');
  }

  try {
    if (caps.exposureCompensation) {
      const ec = caps.exposureCompensation;
      const span = ec.max - ec.min;
      let target = null;
      let tag = null;
      if (antiHighlightBloom && glareRisk) {
        target = ec.min + span * 0.2;
        tag = 'anti-glare';
      } else if (nightBoost) {
        target = Math.min(ec.max, ec.min + span * 0.58);
        tag = 'night EV+';
      }
      if (target != null) {
        const clamped = Math.min(ec.max, Math.max(ec.min, target));
        await track.applyConstraints({ advanced: [{ exposureCompensation: clamped }] });
        hints.push(tag);
      }
    }
  } catch {
    hints.push('EV n/a');
  }

  try {
    if (caps.torch != null) {
      await track.applyConstraints({ advanced: [{ torch: !!torch }] });
      hints.push(torch ? 'torch' : 'no torch');
    }
  } catch {
    hints.push('torch n/a');
  }

  try {
    if (detailBoost && caps.sharpness) {
      const sh = caps.sharpness;
      const t = Math.min(sh.max, Math.max(sh.min, sh.min + (sh.max - sh.min) * 0.72));
      await track.applyConstraints({ advanced: [{ sharpness: t }] });
      hints.push('sharp+');
    }
  } catch {
    hints.push('sharp n/a');
  }

  if (!hints.length) {
    return 'Camera: defaults (Chrome/Android + HTTPS)';
  }
  return `Camera: ${hints.join(' · ')}`;
}

export default function App() {
  const { width: winW, height: winH } = useWindowDimensions();
  const compact = winW < 520;
  const hostRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const timerRef = useRef(0);
  const inFlightRef = useRef(false);
  const [backendUrl, setBackendUrl] = useState(DEFAULT_BACKEND_URL);
  const [status, setStatus] = useState('Starting camera...');
  const [detections, setDetections] = useState([]);
  const [layout, setLayout] = useState({ w: 0, h: 0 });
  const [error, setError] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [frameSize, setFrameSize] = useState({ w: 1280, h: 720 });
  const [globalBand, setGlobalBand] = useState('SAFE');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [mobilityMode, setMobilityMode] = useState('riding');
  const [fullscreenSceneMode, setFullscreenSceneMode] = useState('surround360');
  const [loopFeedUrls, setLoopFeedUrls] = useState({
    left: '',
    right: '',
    rear: '',
  });

  // Enhanced state for new features
  const [settings, setSettings] = useState({
    theme: 'dark',
    sensitivity_person: 0.8,
    sensitivity_vehicle: 0.85,
    alert_distance: 15,
    voice_alerts: true,
    haptic_feedback: true,
    hud_opacity: 0.9,
    font_size: 'medium',
    fps_limit: '30',
    processing_quality: 'medium',
    battery_optimization: true
  });
  const [analytics, setAnalytics] = useState({
    performance: {},
    safety: {},
    ai: {},
    trends: {}
  });
  const [userProfile, setUserProfile] = useState(null);
  const [pwaFeatures, setPwaFeatures] = useState({
    installPrompt: null,
    pushEnabled: false,
    offline: false
  });
  const [surroundVisionData, setSurroundVisionData] = useState(null);

  // Existing state variables...
  /** Prefer infinity / far focus so the road stays sharp instead of the speedometer (browser-dependent). */
  const [roadFocusFarEnabled, setRoadFocusFarEnabled] = useState(true);
  /** Push exposure compensation up when the scene is dark (device-dependent). */
  const [nightExposureBoost, setNightExposureBoost] = useState(false);
  /** Rear LED; helps in very dark lots but can add glare on the cluster — optional. */
  const [torchEnabled, setTorchEnabled] = useState(false);
  /** Continuous auto-exposure + auto white balance so the whole frame meters consistently. */
  const [sceneStableMeteringEnabled, setSceneStableMeteringEnabled] = useState(true);
  /** Bias AF / metering toward upper-center (road ahead in portrait mount). */
  const [roadPoiBiasEnabled, setRoadPoiBiasEnabled] = useState(true);
  /** When the API reports highlight glare, pull EV down to reduce bloom (needs detection running). */
  const [antiHighlightBloomEnabled, setAntiHighlightBloomEnabled] = useState(true);
  /** Request higher sharpness if the driver exposes it (subtle, device-dependent). */
  const [detailBoostEnabled, setDetailBoostEnabled] = useState(true);
  const [cameraTuningNote, setCameraTuningNote] = useState('');
  const streamRef = useRef(null);
  const [cameraStreamGeneration, setCameraStreamGeneration] = useState(0);
  const [calibration, setCalibration] = useState({
    focal_like: '900',
    meters_per_px: '0.05',
    default_object_height_m: '1.5',
  });
  const lastAlertAtRef = useRef(0);
  const lastAlertKeyRef = useRef('');
  const scanPhase = useRef(new Animated.Value(0)).current;
  const sessionStartMs = useRef(Date.now());
  const [sessionSec, setSessionSec] = useState(0);
  const lastFrameAtRef = useRef(0);
  const [fps, setFps] = useState(0);
  const [pipelineMs, setPipelineMs] = useState(0);
  /** @type {null | 'main' | 'radar' | 'cal' | 'trip' | 'threat'} */
  const [expandedPanel, setExpandedPanel] = useState(null);
  /** Full-screen animated ride view (front-cam sim); opened from floating control. */
  const [rideScreenOpen, setRideScreenOpen] = useState(false);
  const [lastTripSnapshot, setLastTripSnapshot] = useState(null);
  const [tripDetail, setTripDetail] = useState(null);
  /** Rolling threat score 0–100 for bottom sparkline (client-side). */
  const [threatHistory, setThreatHistory] = useState([]);
  /** Backend frame quality hints (glare / low light / low contrast). */
  const [frameDiagnostics, setFrameDiagnostics] = useState(null);
  /** Fading radar dots for tracks that just disappeared (reduces empty flicker). */
  const [radarGhosts, setRadarGhosts] = useState([]);
  const prevDetectionsRef = useRef([]);
  /** Previous `/analyze-image` diagnostics — used to pick JPEG quality before the next capture. */
  const lastFrameDiagnosticsRef = useRef(null);

  // Computed values
  const normalizedUrl = useMemo(() => backendUrl.replace(/\/+$/, ''), [backendUrl]);
  const immersive360Available = useMemo(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return false;
    }
    try {
      const canvas = document.createElement('canvas');
      const gl =
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl') ||
        canvas.getContext('webgl2');
      return !!gl;
    } catch {
      return false;
    }
  }, []);
  const ngrokHeaders = useMemo(
    () =>
      normalizedUrl.includes('ngrok-free.dev') ? { 'ngrok-skip-browser-warning': 'true' } : null,
    [normalizedUrl]
  );
  const withTunnelHeaders = (init = {}) => {
    if (!ngrokHeaders) return init;
    return { ...init, headers: { ...(init.headers || {}), ...ngrokHeaders } };
  };

  const generateSurroundVisionData = async () => {
    if (!isRunning) return;

    try {
      // Prepare detected objects data
      const detectedObjectsData = detections.map(d => ({
        label: d.label,
        confidence: d.confidence || 0.8,
        bbox: d.bbox_xyxy || [0, 0, 100, 100],
        distance_m: Number(d.distance_m) || 10.0,
        position: d.bbox_xyxy ? 
          (d.bbox_xyxy[0] < frameSize.w / 3 ? 'left' : 
           d.bbox_xyxy[0] > frameSize.w * 2/3 ? 'right' : 'center') : 'center',
        is_moving: d.is_moving || false
      }));

      // Determine road type based on context (simplified)
      const roadType = 'urban'; // Could be enhanced with actual detection

      // Determine turn direction (simplified - could use gyroscope data)
      const turnDirection = 'straight';

      // Mock speed (replace with actual speed sensor data)
      const speed = 45.0;

      // Call surround vision API
      const response = await fetch(`${normalizedUrl}/surround-vision/render-mock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          road_type: roadType,
          speed: speed,
          turn_direction: turnDirection,
          detected_objects: detectedObjectsData
        }),
        ...withTunnelHeaders()
      });

      if (response.ok) {
        const surroundData = await response.json();
        setSurroundVisionData(surroundData);
      }
    } catch (error) {
      console.error('Failed to generate surround vision data:', error);
    }
  };

  // Generate surround vision data periodically
  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(generateSurroundVisionData, 500); // Update every 500ms
    return () => clearInterval(interval);
  }, [isRunning, detections, frameSize]);

  // Helper functions for new features
  const handleSettingsChange = async (newSettings) => {
    setSettings(newSettings);
    
    // Apply theme change immediately
    if (newSettings.theme !== settings.theme) {
      document.body.className = `theme-${newSettings.theme}`;
    }
    
    // Save settings to backend
    try {
      await fetch(`${normalizedUrl}/learning/personalized-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'default',
          context: { settings: newSettings }
        }),
        ...withTunnelHeaders()
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  // Initialize PWA features
  useEffect(() => {
    const initPWA = async () => {
      try {
        const pwaResult = await initializePWA();
        setPwaFeatures(pwaResult);
        
        // Cache detection models
        await cacheManager.cacheModels();
        
        // Setup connection monitoring
        window.addEventListener('connectionchange', (event) => {
          setPwaFeatures(prev => ({ ...prev, offline: !event.detail.online }));
        });
        
      } catch (error) {
        console.error('PWA initialization failed:', error);
      }
    };
    
    initPWA();
  }, []);

  // Load user profile and analytics
  useEffect(() => {
    const loadUserData = async () => {
      try {
        // Load user profile
        const profileResponse = await fetch(`${normalizedUrl}/learning/user-profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: 'default', mobility_mode: mobilityMode })
        });
        
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          setUserProfile(profileData.profile);
        }
        
        // Load analytics data
        const [performanceRes, safetyRes, aiRes, trendsRes] = await Promise.all([
          fetch(`${normalizedUrl}/analytics/performance`),
          fetch(`${normalizedUrl}/analytics/safety`),
          fetch(`${normalizedUrl}/analytics/ai-enhancements`),
          fetch(`${normalizedUrl}/analytics/trends`)
        ]);
        
        const analyticsData = {
          performance: performanceRes.ok ? await performanceRes.json() : {},
          safety: safetyRes.ok ? await safetyRes.json() : {},
          ai: aiRes.ok ? await aiRes.json() : {},
          trends: trendsRes.ok ? await trendsRes.json() : {}
        };
        
        setAnalytics(analyticsData);
        
      } catch (error) {
        console.error('Failed to load user data:', error);
      }
    };
    
    loadUserData();
  }, [normalizedUrl, mobilityMode]);

  useEffect(() => {
    if (
      Platform.OS === 'web' &&
      fullscreenSceneMode === 'immersive360' &&
      !immersive360Available
    ) {
      setFullscreenSceneMode('birdseye');
      setStatus('Immersive 360 unavailable on this browser/device. Switched to Birds-Eye.');
      setError('WebGL is disabled, so 360 immersive mode cannot run here.');
    }
  }, [fullscreenSceneMode, immersive360Available]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    meta.setAttribute(
      'content',
      'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover'
    );
    const fontId = 'hud-fonts-ride';
    if (!document.getElementById(fontId)) {
      const link = document.createElement('link');
      link.id = fontId;
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700;800&family=Rajdhani:wght@500;600;700&display=swap';
      document.head.appendChild(link);
    }
    return undefined;
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined' || !hostRef.current) {
      return undefined;
    }

    const host = hostRef.current;
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');

    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.muted = true;
    video.autoplay = true;
    video.style.position = 'absolute';
    video.style.left = '0';
    video.style.top = '0';
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.objectFit = 'cover';
    video.style.zIndex = '1';
    host.appendChild(video);
    videoRef.current = video;
    canvasRef.current = canvas;

    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        video.srcObject = stream;
        streamRef.current = stream;
        await video.play();
        setFrameSize({
          w: Math.max(1, video.videoWidth || 1280),
          h: Math.max(1, video.videoHeight || 720),
        });
        setCameraStreamGeneration((n) => n + 1);
        setStatus('Camera ready. Press Start Detection.');
      } catch (e) {
        setStatus('Camera error');
        setError(e.message);
      }
    })();

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      streamRef.current = null;
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
      videoRef.current = null;
      canvasRef.current = null;
    };
  }, []);

  useEffect(() => {
    const stream = streamRef.current;
    if (!stream || typeof navigator === 'undefined') {
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const note = await applyRiderCameraTracks(stream, {
        roadFocusFar: roadFocusFarEnabled,
        nightBoost: nightExposureBoost,
        torch: torchEnabled,
        sceneStable: sceneStableMeteringEnabled,
        roadPoiBias: roadPoiBiasEnabled,
        antiHighlightBloom: antiHighlightBloomEnabled,
        glareRisk: !!frameDiagnostics?.glare_risk,
        detailBoost: detailBoostEnabled,
      });
      if (!cancelled) {
        setCameraTuningNote(note);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    cameraStreamGeneration,
    roadFocusFarEnabled,
    nightExposureBoost,
    torchEnabled,
    sceneStableMeteringEnabled,
    roadPoiBiasEnabled,
    antiHighlightBloomEnabled,
    detailBoostEnabled,
    frameDiagnostics?.glare_risk,
  ]);

/**
 * Client-side frame enhancement for better YOLO detection accuracy.
 * Applies real-time preprocessing to improve object visibility without latency.
 */
function enhanceFrameForDetection(ctx, width, height, diagnostics) {
  if (!ctx || !width || !height) return;

  // Skip enhancement for very small frames to avoid overhead
  if (width * height < 50000) return;

  // Get image data for processing
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  
  // Quick brightness analysis (sample every 4th pixel for speed)
  let totalBrightness = 0;
  let darkPixels = 0;
  let brightPixels = 0;
  let sampleCount = 0;
  
  for (let i = 0; i < data.length; i += 16) { // Sample every 4th pixel
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const brightness = (r + g + b) / 3;
    totalBrightness += brightness;
    sampleCount++;
    
    if (brightness < 60) darkPixels++;
    if (brightness > 200) brightPixels++;
  }
  
  const avgBrightness = totalBrightness / sampleCount;
  const darkRatio = darkPixels / sampleCount;
  const brightRatio = brightPixels / sampleCount;
  
  // Determine enhancement strategy
  const isLowLight = avgBrightness < 80 || darkRatio > 0.4;
  const hasGlare = brightRatio > 0.05;
  const needsContrast = diagnostics?.low_contrast || avgBrightness < 100;
  
  // Skip enhancement if scene is already good
  if (!isLowLight && !hasGlare && !needsContrast) return;
  
  // Apply enhancements
  if (isLowLight || needsContrast) {
    // Brightness and contrast enhancement for dark scenes
    const brightnessFactor = isLowLight ? 1.25 : 1.1;
    const contrastFactor = needsContrast ? 1.3 : 1.15;
    
    for (let i = 0; i < data.length; i += 4) {
      // Apply brightness boost
      data[i] = Math.min(255, data[i] * brightnessFactor);
      data[i + 1] = Math.min(255, data[i + 1] * brightnessFactor);
      data[i + 2] = Math.min(255, data[i + 2] * brightnessFactor);
      
      // Apply contrast enhancement
      data[i] = Math.min(255, Math.max(0, (data[i] - 128) * contrastFactor + 128));
      data[i + 1] = Math.min(255, Math.max(0, (data[i + 1] - 128) * contrastFactor + 128));
      data[i + 2] = Math.min(255, Math.max(0, (data[i + 2] - 128) * contrastFactor + 128));
    }
  }
  
  if (hasGlare) {
    // Glare reduction - compress bright regions
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = (r + g + b) / 3;
      
      if (brightness > 180) {
        // Compress bright pixels to reduce glare
        const compressionFactor = 0.75;
        data[i] = Math.min(255, r * compressionFactor + 50);
        data[i + 1] = Math.min(255, g * compressionFactor + 50);
        data[i + 2] = Math.min(255, b * compressionFactor + 50);
      }
    }
  }
  
  // Put the enhanced data back
  ctx.putImageData(imageData, 0, 0);
  
  // Light sharpening for better edge detection (only in challenging conditions)
  if ((isLowLight || needsContrast) && width * height < 500000) { // Only for smaller frames
    // Simple sharpening using canvas filters (faster than manual processing)
    const originalData = ctx.getImageData(0, 0, width, height);
    
    // Apply slight blur
    ctx.filter = 'blur(0.5px)';
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(ctx.canvas, 0, 0);
    
    // Reset filter and blend for sharpening effect
    ctx.filter = 'none';
    ctx.putImageData(originalData, 0, 0);
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.2;
    ctx.drawImage(tempCanvas, 0, 0);
    
    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;
  }
}

  useEffect(() => {
    const loadCalibration = async () => {
      try {
        const res = await fetch(`${normalizedUrl}/calibration`, withTunnelHeaders());
        if (!res.ok) return;
        const cfg = await res.json();
        setCalibration({
          focal_like: String(cfg.focal_like ?? 900),
          meters_per_px: String(cfg.meters_per_px ?? 0.05),
          default_object_height_m: String(cfg.default_object_height_m ?? 1.5),
        });
      } catch {
        // Ignore calibration prefetch errors; user can still run detection.
      }
    };
    loadCalibration();
  }, [normalizedUrl]);

  useEffect(() => {
    if (expandedPanel !== 'trip') {
      setTripDetail(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${normalizedUrl}/trip/stats`, withTunnelHeaders());
        if (!res.ok || cancelled) return;
        const j = await res.json();
        if (!cancelled) setTripDetail(j);
      } catch {
        if (!cancelled) setTripDetail(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [expandedPanel, normalizedUrl]);

  const analyzeFrame = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2 || inFlightRef.current) {
      return;
    }

    const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
    inFlightRef.current = true;
    try {
      const fw = Math.max(1, video.videoWidth || frameSize.w);
      const fh = Math.max(1, video.videoHeight || frameSize.h);
      setFrameSize({ w: fw, h: fh });
      canvas.width = fw;
      canvas.height = fh;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, fw, fh);

      // Client-side frame enhancement for better detection accuracy
      enhanceFrameForDetection(ctx, fw, fh, lastFrameDiagnosticsRef.current);

      const jpegQ = lastFrameDiagnosticsRef.current?.low_light ? 0.84 : 0.76;
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', jpegQ));
      if (!blob) {
        throw new Error('Unable to capture frame blob');
      }

      const form = new FormData();
      form.append('file', blob, 'frame.jpg');
      const res = await fetch(
        `${normalizedUrl}/analyze-image`,
        withTunnelHeaders({
        method: 'POST',
        body: form,
        })
      );
      if (!res.ok) {
        throw new Error(`Backend HTTP ${res.status}`);
      }
      const body = await res.json();
      const raw = body.detections || [];
      const all = filterInstrumentClusterFalsePositives(raw, fh);
      lastFrameDiagnosticsRef.current = body.frame_diagnostics ?? null;
      setFrameDiagnostics(body.frame_diagnostics ?? null);

      const gNow = Date.now();
      const liveIds = new Set(all.map((d) => d.track_id));
      setRadarGhosts((ghosts) => {
        let next = ghosts.filter((g) => g.expiresAt > gNow && !liveIds.has(g.track_id));
        const prev = prevDetectionsRef.current;
        for (const pd of prev) {
          if (!liveIds.has(pd.track_id)) {
            const p = radarPoint(pd, fw, fh);
            next = next.filter((g) => g.track_id !== pd.track_id);
            next.push({
              track_id: pd.track_id,
              xNorm: p.xNorm,
              yNorm: p.yNorm,
              band: detectionBand(pd),
              expiresAt: gNow + RADAR_GHOST_MS,
            });
          }
        }
        prevDetectionsRef.current = all;
        return next.slice(-24);
      });

      const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now();
      setPipelineMs((prev) => (prev ? prev * 0.72 + (t1 - t0) * 0.28 : t1 - t0));
      const nowMs = Date.now();
      if (lastFrameAtRef.current > 0) {
        const inst = 1000 / Math.max(1, nowMs - lastFrameAtRef.current);
        const capped = Math.max(0, Math.min(inst, 60));
        setFps((prev) => (prev ? prev * 0.75 + capped * 0.25 : capped));
      }
      lastFrameAtRef.current = nowMs;
      if (body.trip) {
        setLastTripSnapshot(body.trip);
      }
      setDetections(all);
      setStatus(`Detecting... ${all.length || 0} objects`);
      setError(null);

      let band = 'SAFE';
      let topThreat = null;
      let histScore = 0;
      if (all.length) {
        const ranked = [...all].sort((a, b) => threatScore(b) - threatScore(a));
        topThreat = ranked[0];
        band = getRiskBand(topThreat);
        histScore = threatScore(topThreat);
      }
      setGlobalBand(band);
      setThreatHistory((prev) => [...prev, histScore].slice(-56));

      if (!all.length || !topThreat) {
        return;
      }

      if (
        voiceEnabled &&
        typeof window !== 'undefined' &&
        window.speechSynthesis &&
        (band === 'DANGER' || band === 'CAUTION')
      ) {
        const now = Date.now();
        const key = `${topThreat.label}-${topThreat.track_id}-${band}`;
        const canSpeak =
          now - lastAlertAtRef.current > ALERT_COOLDOWN_MS && key !== lastAlertKeyRef.current;
        if (canSpeak) {
          const msg =
            band === 'DANGER'
              ? `Danger. ${topThreat.label} ahead.`
              : `Caution. ${topThreat.label} ahead.`;
          window.speechSynthesis.cancel();
          const utter = new window.SpeechSynthesisUtterance(msg);
          utter.rate = 1.08;
          utter.pitch = 1.0;
          window.speechSynthesis.speak(utter);
          lastAlertAtRef.current = now;
          lastAlertKeyRef.current = key;
        }
      }
    } catch (e) {
      setStatus('Detection paused');
      setError(e.message);
      setIsRunning(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = 0;
      }
    } finally {
      inFlightRef.current = false;
    }
  };

  const toggleRun = () => {
    if (isRunning) {
      setIsRunning(false);
      setStatus('Detection stopped');
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = 0;
      }
      return;
    }

    if (!mobilityMode) {
      setStatus('Select Riding or Walking first');
      setError('Choose mode before starting detection');
      return;
    }

    setStatus('Detection running...');
    setIsRunning(true);
    analyzeFrame();
    timerRef.current = window.setInterval(analyzeFrame, CAPTURE_INTERVAL_MS);
  };

  const switchMobilityMode = (nextMode) => {
    if (!nextMode || nextMode === mobilityMode) {
      return;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = 0;
    }
    setIsRunning(false);
    setRideScreenOpen(false);
    setExpandedPanel('main');
    setMobilityMode(nextMode);
    setDetections([]);
    prevDetectionsRef.current = [];
    setRadarGhosts([]);
    setGlobalBand('SAFE');
    setStatus(`Mode changed: ${nextMode === 'walking' ? 'Walking' : 'Riding'}. Press Start.`);
    setError(null);
  };

  const resetTripStats = async () => {
    try {
      await fetch(`${normalizedUrl}/trip/reset`, withTunnelHeaders({ method: 'POST' }));
      const res = await fetch(`${normalizedUrl}/trip/stats`, withTunnelHeaders());
      if (res.ok) {
        const j = await res.json();
        setTripDetail(j);
        setLastTripSnapshot({
          frames: j.frames,
          danger_frames: j.danger_frames,
          caution_frames: j.caution_frames,
          safe_frames: j.safe_frames,
          near_miss_count: j.near_miss_count,
          trip_elapsed_s: j.trip_elapsed_s,
        });
      }
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };

  const saveCalibration = async () => {
    try {
      const payload = {
        focal_like: Number(calibration.focal_like),
        meters_per_px: Number(calibration.meters_per_px),
        default_object_height_m: Number(calibration.default_object_height_m),
      };
      const res = await fetch(
        `${normalizedUrl}/calibration`,
        withTunnelHeaders({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        })
      );
      if (!res.ok) throw new Error(`Calibration HTTP ${res.status}`);
      setStatus('Calibration saved');
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };

  const top = useMemo(() => {
    if (!detections?.length) {
      return null;
    }
    return [...detections].sort((a, b) => threatScore(b) - threatScore(a))[0];
  }, [detections]);
  const modeLabel = mobilityMode === 'walking' ? 'WALK' : 'RIDE';
  const controlsTitle = mobilityMode === 'walking' ? 'Walk controls' : 'Ride controls';
  const riskTitle = mobilityMode === 'walking' ? 'Walk Risk' : 'Ride Risk';
  const sceneModeTitle =
    fullscreenSceneMode === 'surround360'
      ? 'SURROUND 360° VISION'
      : fullscreenSceneMode === 'motorcycle360'
      ? 'MOTORCYCLE 360° VISION'
      : fullscreenSceneMode === 'immersive360'
      ? immersive360Available
        ? 'IMMERSIVE 360'
        : 'IMMERSIVE 360 (FALLBACK)'
      : fullscreenSceneMode === 'autopilot'
      ? 'TESLA AUTOPILOT'
      : fullscreenSceneMode === 'tesla'
      ? 'TESLA STYLE'
      : fullscreenSceneMode === 'realistic3d'
      ? 'REALISTIC 3D'
      : fullscreenSceneMode === 'advanced3d'
      ? 'ADVANCED 3D'
      : 'BIRDS-EYE';
  const radarSheetH = Math.min(compact ? 140 : 160, Math.max(96, winH * 0.22));
  const BOTTOM_HUD_HEIGHT = 118;
  const FAB_COLUMN_W = 78;
  const FAB_SIZE = 54;
  const FAB_GAP = 12;
  const fabBaseBottom = BOTTOM_HUD_HEIGHT + 10;
  const sheetBottom = expandedPanel ? 14 : fabBaseBottom;
  const sheetMaxH = Math.min(560, winH * 0.88);
  const labelMaxW = Math.min(layout.w > 0 ? layout.w * 0.92 : 320, 360);

  const sparkSamples = useMemo(() => {
    const s = threatHistory.slice(-48);
    if (s.length >= 12) return s;
    return [...Array(Math.max(0, 12 - s.length)).fill(0), ...s];
  }, [threatHistory]);

  const dockDots = useMemo(() => {
    return [...detections].sort((a, b) => threatScore(b) - threatScore(a)).slice(0, 12);
  }, [detections]);

  const fabStack = useMemo(() => {
    const row = [
      { id: 'main', a11y: 'Open ride controls', glyph: '☰', tint: 'main' },
      { id: 'radar', a11y: 'Open mini radar', glyph: '◎', tint: 'radar' },
      { id: 'cal', a11y: 'Open calibration', glyph: '⚙', tint: 'cal' },
      { id: 'trip', a11y: 'Open trip stats and near-miss log', glyph: '▣', tint: 'trip' },
    ];
    if (top) {
      row.push({ id: 'threat', a11y: 'Open top threat details', glyph: '◆', tint: 'threat' });
    }
    return row;
  }, [top]);

  useEffect(() => {
    if (expandedPanel === 'threat' && !top) {
      setExpandedPanel(null);
    }
  }, [expandedPanel, top]);

  useEffect(() => {
    if (expandedPanel) {
      return undefined;
    }
    const id = setInterval(() => {
      setSessionSec((Date.now() - sessionStartMs.current) / 1000);
    }, 1000);
    return () => clearInterval(id);
  }, [expandedPanel]);

  useEffect(() => {
    if (expandedPanel) {
      scanPhase.stopAnimation();
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(scanPhase, {
        toValue: 1,
        duration: 2800,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => {
      loop.stop();
      scanPhase.setValue(0);
    };
  }, [expandedPanel, scanPhase]);

  const sweepTranslateY = scanPhase.interpolate({
    inputRange: [0, 1],
    outputRange: [2, 40],
  });
  const idleRingOpacity = scanPhase.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.12, 0.28, 0.12],
  });

  const nearestDistanceM = useMemo(() => {
    if (!detections.length) return null;
    return Math.min(...detections.map((d) => Number(d.distance_m || 999)));
  }, [detections]);

  const movingCount = useMemo(() => detections.filter((d) => d.is_moving).length, [detections]);

  const avgRisk = useMemo(() => {
    if (!detections.length) return 0;
    return detections.reduce((acc, d) => acc + Number(d.risk_percent || 0), 0) / detections.length;
  }, [detections]);

  const threatLadder = useMemo(() => {
    return [...detections]
      .sort((a, b) => threatScore(b) - threatScore(a))
      .slice(0, 3)
      .map((d) => ({
        id: d.track_id,
        label: d.label,
        dist: Number(d.distance_m || 0),
        ttc: Number(d.ttc_s || 999),
        risk: Number(d.risk_percent || 0),
        band: detectionBand(d),
      }));
  }, [detections]);

  const laneOffsetPct = useMemo(() => {
    if (!top || !frameSize.w) return 50;
    const [x1, , x2] = top.bbox_xyxy || [frameSize.w * 0.45, 0, frameSize.w * 0.55];
    const cx = (Number(x1) + Number(x2)) / 2;
    return Math.max(0, Math.min(100, (cx / Math.max(1, frameSize.w)) * 100));
  }, [top, frameSize.w]);

  const showIdleAtmosphere =
    !expandedPanel && !rideScreenOpen && detections.length === 0 && !isRunning;
  const showMainHud = !expandedPanel && !rideScreenOpen;

  useEffect(() => {
    if (expandedPanel) {
      setRideScreenOpen(false);
    }
  }, [expandedPanel]);

  /** Hide live camera under birds-eye so the 3D view is full-screen (Tesla-style). */
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return undefined;
    }
    const v = videoRef.current;
    if (!v) return undefined;
    if (rideScreenOpen) {
      v.style.visibility = 'hidden';
    } else {
      v.style.visibility = 'visible';
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.style.visibility = 'visible';
      }
    };
  }, [rideScreenOpen]);

  // Apply theme to document body
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.className = `theme-${settings.theme}`;
    }
  }, [settings.theme]);

  // Navigation handler for view switching
  const handleViewChange = (newView) => {
    setExpandedSections(prev => ({
      ...prev,
      [newView]: !prev[newView]
    }));
  };

  // PWA Install Button
  const PWAInstallButton = () => {
    if (!pwaFeatures.installPrompt) return null;
    
    return (
      <Pressable
        style={styles.pwaInstallButton}
        onPress={() => pwaFeatures.installPrompt.showInstallPrompt()}
      >
        <Text style={styles.pwaInstallText}>📱 Install App</Text>
      </Pressable>
    );
  };

  // Offline Indicator
  const OfflineIndicator = () => {
    if (!pwaFeatures.offline) return null;
    
    return (
      <View style={styles.offlineIndicator}>
        <Text style={styles.offlineText}>📡 Offline Mode</Text>
      </View>
    );
  };

  // Floating Control System
  const [navBarVisible, setNavBarVisible] = useState(false);
  const [controlPanelOpen, setControlPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const navBarAnim = useRef(new Animated.Value(0)).current;
  const controlPanelAnim = useRef(new Animated.Value(0)).current;
  const floatingIconAnim = useRef(new Animated.Value(1)).current;

  const toggleNavBar = () => {
    console.log('toggleNavBar called, navBarVisible:', navBarVisible);
    const newNavBarVisible = !navBarVisible;
    setNavBarVisible(newNavBarVisible);
    
    // Animate the navigation bar
    Animated.spring(navBarAnim, {
      toValue: newNavBarVisible ? 1 : 0,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
    
    // If opening nav bar, close control panel
    if (newNavBarVisible && controlPanelOpen) {
      setControlPanelOpen(false);
    }
  };

  const toggleControlPanel = () => {
    console.log('toggleControlPanel called, controlPanelOpen:', controlPanelOpen);
    const newControlPanelOpen = !controlPanelOpen;
    setControlPanelOpen(newControlPanelOpen);
    
    // Animate the control panel
    Animated.spring(controlPanelAnim, {
      toValue: newControlPanelOpen ? 1 : 0,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start();
  };

  // Floating Control System
  const FloatingControlSystem = () => {
    console.log('FloatingControlSystem render - rideScreenOpen:', rideScreenOpen, 'navBarVisible:', navBarVisible);
    if (rideScreenOpen) return null;

    const tabs = [
      { id: 'camera', label: 'Camera', icon: '📷', isCamera: true },
      { id: 'dashboard', label: 'Dashboard', icon: '📊' },
      { id: 'analytics', label: 'Analytics', icon: '📈' },
      { id: 'settings', label: 'Settings', icon: '⚙️' }
    ];

    const navBarTranslateY = navBarAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [100, 0], // Slide up from bottom
    });

    console.log('navBarVisible:', navBarVisible, 'navBarAnim current value should animate to:', navBarVisible ? 1 : 0);

    const panelTranslateY = controlPanelAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [400, 0], // Slide up from bottom
    });

    const floatingIconScale = floatingIconAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.8, 1],
    });

    return (
      <>
        {/* Floating Action Button */}
        <Animated.View
          style={[
            styles.floatingButton,
            {
              transform: [{ scale: floatingIconScale }],
              opacity: navBarVisible ? 0.7 : 1,
            }
          ]}
        >
          <Pressable
            style={[
              styles.floatingButtonInner,
              navBarVisible && styles.floatingButtonActive
            ]}
            onPress={toggleNavBar}
          >
            <Text style={styles.floatingButtonIcon}>
              {navBarVisible ? '✕' : '⚡'}
            </Text>
          </Pressable>
        </Animated.View>

        {/* Bottom Navigation Bar */}
        {navBarVisible && (
          <Animated.View 
            style={[
              styles.bottomNavBar,
              {
                transform: [{ translateY: navBarTranslateY }],
                opacity: navBarVisible ? 1 : 0,
              }
            ]}
          >
            {tabs.map(tab => (
              <Pressable
                key={tab.id}
                style={[
                  styles.bottomNavItem,
                  (tab.isCamera && !controlPanelOpen) && styles.bottomNavItemActive,
                  (!tab.isCamera && controlPanelOpen && activeTab === tab.id) && styles.bottomNavItemActive
                ]}
                onPress={() => {
                  if (tab.isCamera) {
                    if (controlPanelOpen) {
                      toggleControlPanel();
                    } else {
                      // Close nav bar when camera is selected and panel is closed
                      toggleNavBar();
                    }
                  } else {
                    if (!controlPanelOpen) {
                      setActiveTab(tab.id);
                      toggleControlPanel();
                    } else if (activeTab === tab.id) {
                      toggleControlPanel();
                    } else {
                      setActiveTab(tab.id);
                    }
                  }
                }}
              >
                <Text style={[
                  styles.bottomNavIcon,
                  ((tab.isCamera && !controlPanelOpen) || (!tab.isCamera && controlPanelOpen && activeTab === tab.id)) && styles.bottomNavIconActive
                ]}>
                  {tab.icon}
                </Text>
                <Text style={[
                  styles.bottomNavLabel,
                  ((tab.isCamera && !controlPanelOpen) || (!tab.isCamera && controlPanelOpen && activeTab === tab.id)) && styles.bottomNavLabelActive
                ]}>
                  {tab.label}
                </Text>
                {/* Active indicator dot */}
                {((tab.isCamera && !controlPanelOpen) || (!tab.isCamera && controlPanelOpen && activeTab === tab.id)) && (
                  <View style={styles.activeIndicator} />
                )}
              </Pressable>
            ))}
          </Animated.View>
        )}

        {/* Expandable Control Panel */}
        {controlPanelOpen && (
          <Animated.View 
            style={[
              styles.expandablePanel,
              {
                transform: [{ translateY: panelTranslateY }],
                opacity: controlPanelOpen ? 1 : 0,
              }
            ]}
          >
            {/* Panel Header */}
            <View style={styles.panelHeader}>
              <View style={styles.panelHandle} />
              <Text style={styles.panelTitle}>
                {activeTab === 'dashboard' && '📊 Dashboard'}
                {activeTab === 'analytics' && '📈 Analytics'}
                {activeTab === 'settings' && '⚙️ Settings'}
              </Text>
              <View style={styles.panelStatus}>
                <View style={[
                  styles.statusDot, 
                  { backgroundColor: isRunning ? '#10B981' : '#6B7280' }
                ]} />
                <Text style={styles.statusLabel}>
                  {isRunning ? 'LIVE' : 'STANDBY'}
                </Text>
              </View>
            </View>

            {/* Panel Content */}
            <View style={styles.panelContent}>
              {activeTab === 'dashboard' && (
                <EnhancedDashboard
                  detections={detections}
                  analytics={analytics}
                  safetyMetrics={analytics.safety}
                  aiStats={analytics.ai}
                  isRunning={isRunning}
                  frameDiagnostics={frameDiagnostics}
                  compact={true}
                />
              )}
              {activeTab === 'analytics' && (
                <AnalyticsVisualization
                  analytics={analytics}
                  detections={detections}
                  isRunning={isRunning}
                  timeRange="24h"
                  compact={true}
                />
              )}
              {activeTab === 'settings' && (
                <AdvancedSettings
                  settings={settings}
                  onSettingsChange={handleSettingsChange}
                  userProfile={userProfile}
                  onClose={() => {
                    toggleControlPanel();
                    setTimeout(() => toggleNavBar(), 300);
                  }}
                  compact={true}
                />
              )}
            </View>
          </Animated.View>
        )}
      </>
    );
  };

  return (
    <View
      ref={hostRef}
      collapsable={false}
      style={styles.container}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setLayout({ w: width, h: height });
      }}
    >
      {!mobilityMode ? (
        <View style={styles.modePickerOverlay}>
          <View style={styles.modePickerCard}>
            <Text style={styles.modePickerTitle}>How are you moving?</Text>
            <Text style={styles.modePickerSub}>
              Choose once before detection. This switches center avatar and HUD behavior.
            </Text>
            <Pressable
              style={styles.modePickerButton}
              onPress={() => {
                setMobilityMode('riding');
                setStatus('Mode set: Riding');
                setError(null);
              }}
            >
              <Text style={styles.modePickerButtonText}>I am Riding</Text>
            </Pressable>
            <Pressable
              style={[styles.modePickerButton, styles.modePickerButtonAlt]}
              onPress={() => {
                setMobilityMode('walking');
                setStatus('Mode set: Walking');
                setError(null);
              }}
            >
              <Text style={styles.modePickerButtonText}>I am Walking</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {!expandedPanel && !rideScreenOpen ? (
        <View
          pointerEvents="none"
          style={[styles.hudStateTint, isRunning ? styles.hudStateTintLive : styles.hudStateTintIdle]}
        />
      ) : null}

      {rideScreenOpen && !expandedPanel ? (
        <>
          <View style={styles.rideVideoCurtain} pointerEvents="none" />
          <View style={styles.rideFullscreenShell} pointerEvents="none">
            <View pointerEvents="none" style={[styles.rideVisionLayer, styles.rideVisionLayerFullscreen]}>
              {Platform.OS === 'web' ? (
                fullscreenSceneMode === 'immersive360' && immersive360Available ? (
                  <SceneErrorBoundary
                    onError={(err) => {
                      setFullscreenSceneMode('birdseye');
                      setStatus('Immersive 360 failed on this browser/device. Switched to Birds-Eye.');
                      setError(`360 disabled: ${err?.message || 'WebGL renderer init failed'}`);
                    }}
                    fallback={null}
                  >
                    <Immersive360ViewWeb
                      width={layout.w || winW}
                      height={layout.h || winH}
                      mode={mobilityMode || 'riding'}
                      isRunning={isRunning}
                      frontVideoEl={videoRef.current}
                      leftUrl={loopFeedUrls.left}
                      rightUrl={loopFeedUrls.right}
                      rearUrl={loopFeedUrls.rear}
                      fps={fps}
                      pipelineMs={pipelineMs}
                      sessionSec={sessionSec}
                      frameDiagnostics={frameDiagnostics}
                      detectionsCount={detections.length}
                      movingCount={movingCount}
                    />
                  </SceneErrorBoundary>
                ) : fullscreenSceneMode === 'immersive360' ? (
                  <Immersive360FallbackWeb
                    mode={mobilityMode || 'riding'}
                    isRunning={isRunning}
                    frontVideoEl={videoRef.current}
                    leftUrl={loopFeedUrls.left}
                    rightUrl={loopFeedUrls.right}
                    rearUrl={loopFeedUrls.rear}
                    fps={fps}
                    pipelineMs={pipelineMs}
                    sessionSec={sessionSec}
                    detectionsCount={detections.length}
                  />
                ) : fullscreenSceneMode === 'surround360' ? (
                  <SurroundVisionRenderer
                    width={layout.w || winW}
                    height={layout.h || winH}
                    sceneData={surroundVisionData}
                    frontVideoElement={videoRef.current}
                    isRunning={isRunning}
                  />
                ) : fullscreenSceneMode === 'motorcycle360' ? (
                  <Motorcycle360Vision
                    width={layout.w || winW}
                    height={layout.h || winH}
                    visionData={{
                      timestamp: Date.now(),
                      speed: 45, // Mock speed - replace with actual
                      road_type: "urban",
                      weather: "clear",
                      bike: {
                        position: "center",
                        heading: 0
                      },
                      cameras: {
                        front: {
                          objects: detections.map(d => ({
                            label: d.label,
                            confidence: d.confidence || 0.8,
                            position_in_frame: "center",
                            distance: Number(d.distance_m) < 3 ? "near" : Number(d.distance_m) < 10 ? "mid" : "far",
                            motion: d.is_moving ? "slow" : "static",
                            bbox: d.bbox_xyxy || [0, 0, 100, 100]
                          })),
                          lane_detected: true,
                          road_surface: "asphalt",
                          hazard_level: detections.length > 0 ? 1 : 0,
                          hazard_note: detections.length > 0 ? `${detections.length} objects detected` : "All clear"
                        },
                        left: { objects: [], lane_detected: false, road_surface: "asphalt", hazard_level: 0, hazard_note: "All clear" },
                        right: { objects: [], lane_detected: false, road_surface: "asphalt", hazard_level: 0, hazard_note: "All clear" },
                        rear: { objects: [], lane_detected: false, road_surface: "asphalt", hazard_level: 0, hazard_note: "All clear" }
                      },
                      global_hazard: {
                        level: detections.length > 2 ? 2 : detections.length > 0 ? 1 : 0,
                        direction: detections.length > 0 ? "front" : "none",
                        note: detections.length > 2 ? "Multiple objects detected" : detections.length > 0 ? "Objects ahead" : "All clear",
                        alert_color: detections.length > 2 ? "yellow" : detections.length > 0 ? "blue" : "green"
                      }
                    }}
                    cameraFeeds={{
                      front: videoRef.current,
                      left: null,
                      right: null,
                      rear: null
                    }}
                    isRunning={isRunning}
                    fallbackMode={true}
                  />
                ) : fullscreenSceneMode === 'autopilot' ? (
                  <TeslaAutopilotView
                    width={layout.w || winW}
                    height={layout.h || winH}
                    detections={detections}
                    frameSize={frameSize}
                    isRunning={isRunning}
                    mode="driving"
                  />
                ) : fullscreenSceneMode === 'tesla' ? (
                  <TeslaStyleView
                    width={layout.w || winW}
                    height={layout.h || winH}
                    detections={detections}
                    frameSize={frameSize}
                    isRunning={isRunning}
                    videoElement={videoRef.current}
                    frameDiagnostics={frameDiagnostics}
                  />
                ) : fullscreenSceneMode === 'realistic3d' ? (
                  <Realistic3DSceneWeb
                    width={layout.w || winW}
                    height={layout.h || winH}
                    detections={detections}
                    frameSize={frameSize}
                    isRunning={isRunning}
                    mode={mobilityMode || 'sitting'}
                  />
                ) : fullscreenSceneMode === 'advanced3d' ? (
                  <Advanced3DSceneWeb
                    width={layout.w || winW}
                    height={layout.h || winH}
                    detections={detections}
                    frameSize={frameSize}
                    isRunning={isRunning}
                    mode={mobilityMode || 'riding'}
                  />
                ) : (
                  <BirdseyeSceneWeb
                    width={layout.w || winW}
                    height={layout.h || winH}
                    detections={detections}
                    frameSize={frameSize}
                    isRunning={isRunning}
                    mode={mobilityMode || 'riding'}
                  />
                )
              ) : null}
              <View style={styles.rideTopBadge} pointerEvents="none">
                <Text style={styles.rideTopBadgeTitle}>{sceneModeTitle} · LIVE</Text>
                <Text style={styles.rideTopBadgeSub}>
                  {`${modeLabel} · `}
                  {fullscreenSceneMode === 'surround360'
                    ? isRunning
                      ? 'AI-generated 360° scenes · animated roads · inferred objects · seamless stitching'
                      : 'STBY · surround vision renderer · generates left/right/rear scenes from front camera'
                    : fullscreenSceneMode === 'motorcycle360'
                    ? isRunning
                      ? 'Tesla-style 360° surround vision · 4-camera feeds · distance rings · hazard detection'
                      : 'STBY · 360° motorcycle vision system · start detection for full surround awareness'
                    : fullscreenSceneMode === 'autopilot'
                    ? isRunning
                      ? '3D car model · objects move around ego vehicle · Tesla autopilot style'
                      : 'STBY · Tesla autopilot visualization · 3D car in center · start detection'
                    : fullscreenSceneMode === 'tesla'
                    ? isRunning
                      ? 'Live camera · 3D bounding boxes · Tesla-style overlays · real-time detection'
                      : 'STBY · Tesla autopilot style · start detection to see live overlays'
                    : fullscreenSceneMode === 'realistic3d'
                    ? isRunning
                      ? 'Room-based 3D · objects from camera · realistic avatar · no defaults'
                      : 'STBY · realistic 3D scene · builds environment from camera detections'
                    : fullscreenSceneMode === 'advanced3d'
                    ? isRunning
                      ? '360° rotating camera · animated avatar · 3D vehicles · environment rendering'
                      : 'STBY · 360° view · animated avatar ready · start detection to see 3D world'
                    : fullscreenSceneMode === 'immersive360' && immersive360Available
                    ? 'front live + 3 side feeds around center avatar'
                    : fullscreenSceneMode === 'immersive360'
                    ? 'CSS fallback mode (no WebGL): front + side/rear feed panes'
                    : isRunning
                    ? 'Camera hidden · full-screen sim · rings · sweep · tethers'
                    : 'STBY · camera hidden in this view · start tracking for voxels'}
                </Text>
              </View>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close ride view"
            onPress={() => setRideScreenOpen(false)}
            style={({ pressed }) => [styles.rideFullscreenClose, pressed && styles.rideFullscreenClosePressed]}
          >
            <Text style={styles.rideFullscreenCloseGlyph}>✕</Text>
          </Pressable>
        </>
      ) : null}

      {showMainHud ? (
        <Pressable
          accessibilityRole="button"
            accessibilityLabel={`Open full-screen ${modeLabel.toLowerCase()} view`}
          onPress={() => setRideScreenOpen(true)}
          style={({ pressed }) => [
            styles.rideFloatFab,
            { bottom: fabBaseBottom },
            pressed && styles.rideFloatFabPressed,
          ]}
        >
          <Text style={styles.rideFloatFabGlyph}>◉</Text>
        </Pressable>
      ) : null}

      {showIdleAtmosphere ? (
        <View style={styles.idleAtmosphere} pointerEvents="none">
          <View style={styles.idleVignette} />
          {[12, 24, 36, 48, 60, 72, 84].map((pct) => (
            <View
              key={`hgrid-${pct}`}
              style={[styles.idleGridH, { top: `${pct}%` }]}
            />
          ))}
          {[14, 28, 42, 56, 70].map((pct) => (
            <View
              key={`vgrid-${pct}`}
              style={[styles.idleGridV, { left: `${pct}%` }]}
            />
          ))}
          <View style={styles.idleCornerTL}>
            <View style={styles.idleCornerH} />
            <View style={styles.idleCornerV} />
          </View>
          <View style={styles.idleCornerTR}>
            <View style={[styles.idleCornerH, { alignSelf: 'flex-end' }]} />
            <View style={[styles.idleCornerV, { alignSelf: 'flex-end' }]} />
          </View>
          <View style={styles.idleCornerBL}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <View style={styles.idleCornerV} />
              <View style={[styles.idleCornerH, { marginLeft: -2 }]} />
            </View>
          </View>
          <View style={styles.idleCornerBR}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
              <View style={styles.idleCornerV} />
              <View style={[styles.idleCornerH, { marginRight: -2 }]} />
            </View>
          </View>
          <View style={styles.idleMiddle}>
            <Animated.View
              style={[styles.idleCenterRing, { opacity: idleRingOpacity }]}
              pointerEvents="none"
            />
            <View style={styles.idleCenterBlock} pointerEvents="none">
              <Text style={styles.idleTagline}>
                {isRunning ? 'ACTIVE SCAN' : 'OPTICAL ARRAY'}
              </Text>
              <Text style={styles.idleTaglineDim}>
                {isRunning ? 'AWAITING TARGETS' : 'SYSTEM STANDBY'}
              </Text>
              <Text style={styles.idleStatusEcho} numberOfLines={2}>
                {status}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {showMainHud ? (
        <View style={[styles.hudTelemetryBar, compact && styles.hudTelemetryBarCompact]} pointerEvents="none">
          <Text style={styles.hudTelLeft}>{isRunning ? `LIVE ${fps.toFixed(1)} FPS` : 'STANDBY'}</Text>
          <Text style={[styles.hudTelMid, compact && styles.hudTelMidCompact]}>
            {compact
              ? `${globalBand} · ${movingCount}/${detections.length} MOV`
              : `${movingCount}/${detections.length} MOV · ${globalBand} · RISK ${avgRisk.toFixed(0)}%`}
          </Text>
          <Text style={[styles.hudTelRight, compact && styles.hudTelRightCompact]}>
            {nearestDistanceM == null
              ? compact
                ? `${pipelineMs.toFixed(0)}ms`
                : `LAT ${pipelineMs.toFixed(0)}ms`
              : compact
                ? `${nearestDistanceM.toFixed(1)}m`
                : `${nearestDistanceM.toFixed(1)}m · ${pipelineMs.toFixed(0)}ms`}
          </Text>
        </View>
      ) : null}

      {showMainHud ? (
        <View style={[styles.hudThreatLadder, compact && styles.hudThreatLadderCompact]} pointerEvents="none">
          <Text style={styles.hudPanelTitle}>THREAT LADDER</Text>
          {threatLadder.length === 0 ? (
            <Text style={styles.hudPanelEmpty}>No active tracks</Text>
          ) : (
            threatLadder.slice(0, compact ? 2 : 3).map((t, idx) => (
              <View key={`lad-${t.id}-${idx}`} style={styles.hudLadderRow}>
                <View style={[styles.hudLadderPill, { backgroundColor: riskColor(t.band) }]} />
                <Text style={[styles.hudLadderText, compact && styles.hudLadderTextCompact]} numberOfLines={1}>
                  {idx + 1}. {t.label} · {t.dist.toFixed(1)}m
                  {!compact ? ` · ${t.ttc >= 900 ? 'TTC N/A' : `TTC ${t.ttc.toFixed(1)}s`}` : ''}
                </Text>
              </View>
            ))
          )}
        </View>
      ) : null}

      {showMainHud ? (
        <View style={[styles.hudGuidanceBar, compact && styles.hudGuidanceBarCompact]} pointerEvents="none">
          <Text style={styles.hudPanelTitle}>LANE GUIDANCE</Text>
          <View style={styles.hudGuidanceTrack}>
            <View style={styles.hudGuidanceCenter} />
            <View style={[styles.hudGuidanceMarker, { left: `${laneOffsetPct}%` }]} />
          </View>
          <Text style={[styles.hudGuidanceMeta, compact && styles.hudGuidanceMetaCompact]} numberOfLines={1}>
            {top ? `${top.label} offset ${(laneOffsetPct - 50).toFixed(0)}%` : 'No target lock'}
          </Text>
        </View>
      ) : null}

      {showMainHud ? (
        <View style={[styles.hudSystemCard, compact && styles.hudSystemCardCompact]} pointerEvents="none">
          <Text style={styles.hudPanelTitle}>SYSTEM</Text>
          <Text style={[styles.hudSystemLine, compact && styles.hudSystemLineCompact]}>
            Frame {Math.round(frameSize.w)}x{Math.round(frameSize.h)}
          </Text>
          <Text style={[styles.hudSystemLine, compact && styles.hudSystemLineCompact]}>
            Latency {pipelineMs.toFixed(0)}ms
          </Text>
          <Text style={[styles.hudSystemLine, compact && styles.hudSystemLineCompact]}>
            Voice {voiceEnabled ? 'ON' : 'OFF'}
          </Text>
          {frameDiagnostics ? (
            <Text style={[styles.hudSystemLine, compact && styles.hudSystemLineCompact]} numberOfLines={1}>
              Scene {frameDiagnostics.quality_hint}
              {!compact
                ? ` · br ${Math.round((frameDiagnostics.brightness_01 || 0) * 100)}%`
                : ''}
            </Text>
          ) : null}
          {cameraTuningNote ? (
            <Text style={[styles.hudSystemLine, compact && styles.hudSystemLineCompact]} numberOfLines={2}>
              {cameraTuningNote.replace(/^Camera: /, 'Cam ')}
            </Text>
          ) : null}
          {!compact ? (
            <Text style={styles.hudSystemLine}>Backend {backendUrl.replace(/^https?:\/\//, '')}</Text>
          ) : null}
        </View>
      ) : null}

      {!rideScreenOpen ? (
        <View style={styles.boxLayer} pointerEvents="none">
        {detections.map((d, idx) => {
          const box = mapBoxToOverlay(d.bbox_xyxy, frameSize.w, frameSize.h, layout.w, layout.h);
          const band = detectionBand(d);
          const color = riskColor(band);
          const score = threatScore(d);
          return (
            <View
              key={`${d.track_id}-${idx}`}
              style={[
                styles.detectionBox,
                {
                  left: box.left,
                  top: box.top,
                  width: box.width,
                  height: box.height,
                  borderColor: color,
                  ...createInlineShadowStyle(color),
                },
              ]}
            >
              <View style={[styles.detectionLabel, { backgroundColor: color, maxWidth: labelMaxW }]}>
                <Text
                  style={[styles.detectionLabelText, compact && styles.detectionLabelTextCompact]}
                  numberOfLines={compact ? 3 : 2}
                >
                  {d.label} #{d.track_id} | {Number(d.distance_m).toFixed(1)}m |{' '}
                  {d.is_moving ? `${Number(d.speed_kmh).toFixed(0)}km/h` : 'static'} |{' '}
                  {Math.round(Number(d.risk_percent))}% | {band} | T{score} | A{' '}
                  {Number(d.track_age_s ?? 0).toFixed(1)}s
                </Text>
              </View>
            </View>
          );
        })}
        </View>
      ) : null}

      {showMainHud ? (
        <View
          pointerEvents="none"
          style={[
            styles.hudBottomDock,
            compact && styles.hudBottomDockCompact,
            { height: BOTTOM_HUD_HEIGHT, paddingRight: FAB_COLUMN_W },
          ]}
        >
          <View style={styles.hudDockTickBar}>
            {Array.from({ length: 36 }).map((_, i) => (
              <View key={`tick-${i}`} style={styles.hudDockTickCell}>
                <View style={[styles.hudDockTick, i % 6 === 0 ? styles.hudDockTickMajor : null]} />
              </View>
            ))}
          </View>
          <View style={styles.hudDockMetricRow}>
            <Text style={styles.hudDockMetricLeft}>
              MODE {modeLabel} · {isRunning ? 'TRACK' : 'STBY'} · SESSION {formatSessionClock(sessionSec)}
            </Text>
            <Text style={styles.hudDockMetricRight}>
              OBJ {detections.length} · MOV {movingCount} · FPS {fps.toFixed(1)}
            </Text>
          </View>
          <View style={styles.hudDockSparkRow}>
            {sparkSamples.map((v, i) => (
              <View key={`spark-${i}`} style={styles.hudSparkCell}>
                <View
                  style={[
                    styles.hudSparkBar,
                    { height: Math.max(2, (v / 100) * 14), backgroundColor: sparkBarColor(v) },
                  ]}
                />
              </View>
            ))}
          </View>
          <View style={styles.hudDockRadar}>
            <View style={styles.hudDockRadarLine} />
            {dockDots.length === 0 ? (
              <Animated.View
                style={[
                  styles.hudDockSweep,
                  { transform: [{ translateY: sweepTranslateY }] },
                ]}
              />
            ) : null}
            {dockDots.map((d, idx) => {
              const p = radarPoint(d, frameSize.w, frameSize.h);
              const left = p.xNorm * 100;
              const topPct = p.yNorm * 100;
              const band = detectionBand(d);
              return (
                <View
                  key={`dock-${d.track_id}-${idx}`}
                  style={[
                    styles.hudDockDot,
                    {
                      left: `${left}%`,
                      top: `${topPct}%`,
                      backgroundColor: riskColor(band),
                    },
                  ]}
                />
              );
            })}
            {radarGhosts.map((g) => {
              const left = g.xNorm * 100;
              const topPct = g.yNorm * 100;
              const fade = Math.max(0.08, Math.min(0.45, (g.expiresAt - Date.now()) / RADAR_GHOST_MS * 0.45));
              return (
                <View
                  key={`dock-ghost-${g.track_id}`}
                  style={[
                    styles.hudDockDot,
                    {
                      left: `${left}%`,
                      top: `${topPct}%`,
                      backgroundColor: riskColor(g.band),
                      opacity: fade,
                    },
                  ]}
                />
              );
            })}
          </View>
          <View style={styles.hudDockFooter}>
            <Text style={styles.hudDockTitle}>LANE · RANGE</Text>
            <Text style={styles.hudDockMeta}>
              {globalBand} · {detections.length} track{detections.length === 1 ? '' : 's'}
            </Text>
          </View>
        </View>
      ) : null}

      {showMainHud ? (
        <View
          pointerEvents="none"
          style={[
            styles.hudFabRail,
            {
              height: fabStack.length * (FAB_SIZE + FAB_GAP) - FAB_GAP + 36,
              bottom: fabBaseBottom - 10,
            },
          ]}
        />
      ) : null}

      {showMainHud
        ? fabStack.map((fab, i) => (
            <Pressable
              key={fab.id}
              accessibilityRole="button"
              accessibilityLabel={fab.a11y}
              onPress={() => setExpandedPanel(fab.id)}
              style={[
                styles.panelFab,
                fab.tint === 'main' && styles.panelFabMain,
                fab.tint === 'radar' && styles.panelFabRadar,
                fab.tint === 'cal' && styles.panelFabCal,
                fab.tint === 'trip' && styles.panelFabTrip,
                fab.tint === 'threat' && styles.panelFabThreat,
                { bottom: fabBaseBottom + i * (FAB_SIZE + FAB_GAP) },
              ]}
            >
              <Text style={styles.panelFabGlyph}>{fab.glyph}</Text>
              {fab.id === 'radar' && detections.length > 0 ? (
                <View style={styles.panelFabBadge}>
                  <Text style={styles.panelFabBadgeText}>{Math.min(99, detections.length)}</Text>
                </View>
              ) : null}
              {fab.id === 'main' && error ? (
                <View style={styles.panelFabBadge}>
                  <Text style={styles.panelFabBadgeText}>!</Text>
                </View>
              ) : null}
              {fab.id === 'main' && globalBand === 'DANGER' && !error ? <View style={styles.panelFabDot} /> : null}
              {fab.id === 'trip' && (lastTripSnapshot?.near_miss_count ?? 0) > 0 ? (
                <View style={styles.panelFabBadge}>
                  <Text style={styles.panelFabBadgeText}>
                    {Math.min(99, lastTripSnapshot.near_miss_count)}
                  </Text>
                </View>
              ) : null}
              {fab.id === 'threat' && globalBand === 'DANGER' ? <View style={styles.panelFabDot} /> : null}
            </Pressable>
          ))
        : null}

      {expandedPanel ? (
        <>
          <Pressable
            style={styles.panelFabBackdrop}
            onPress={() => setExpandedPanel(null)}
            accessibilityRole="button"
            accessibilityLabel="Close panel"
          />
          <View style={[styles.panelFabSheet, HUD_SHEET_GLASS, { bottom: sheetBottom, maxHeight: sheetMaxH }]}>
            <View style={styles.hudSheetAccentTop} pointerEvents="none" />
            <View style={styles.panelFabSheetHeader}>
              <Text
                style={[
                  styles.hudSheetTitle,
                  styles.panelFabSheetTitle,
                  compact && styles.sectionTitleSmall,
                ]}
              >
                {expandedPanel === 'main' && controlsTitle}
                {expandedPanel === 'radar' && 'Mini radar'}
                {expandedPanel === 'cal' && 'Calibration'}
                {expandedPanel === 'trip' && 'Trip · Phase 4'}
                {expandedPanel === 'threat' && top && 'Top threat'}
              </Text>
              <Pressable onPress={() => setExpandedPanel(null)} hitSlop={12} style={styles.panelFabCloseHit}>
                <Text style={styles.panelFabClose}>CLOSE</Text>
              </Pressable>
            </View>

            {expandedPanel === 'main' ? (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                style={[styles.mainSheetScroll, { maxHeight: sheetMaxH - 52 }]}
                contentContainerStyle={styles.mainSheetScrollContent}
              >
                <TextInput
                  style={[styles.input, compact && styles.inputCompact]}
                  value={backendUrl}
                  onChangeText={setBackendUrl}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="http://127.0.0.1:8001"
                  placeholderTextColor="#A5B4FC"
                />
                {compact ? (
                  <View style={styles.quickRow}>
                    <Pressable style={[styles.button, styles.buttonHalf, styles.buttonHalfLeft]} onPress={toggleRun}>
                      <Text style={[styles.buttonText, styles.buttonTextSmall]}>
                        {isRunning ? 'Stop' : 'Start'}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.buttonAlt, styles.buttonHalf]}
                      onPress={() => setVoiceEnabled((v) => !v)}
                    >
                      <Text style={[styles.buttonText, styles.buttonTextSmall]}>
                        Voice: {voiceEnabled ? 'ON' : 'OFF'}
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Pressable style={styles.button} onPress={toggleRun}>
                      <Text style={styles.buttonText}>
                        {isRunning ? 'Stop Detection' : 'Start Detection'}
                      </Text>
                    </Pressable>
                    <Pressable style={styles.buttonAlt} onPress={() => setVoiceEnabled((v) => !v)}>
                      <Text style={styles.buttonText}>Voice Alerts: {voiceEnabled ? 'ON' : 'OFF'}</Text>
                    </Pressable>
                  </>
                )}
                <Pressable
                  style={styles.buttonAlt}
                  onPress={() => {
                    const modes = ['surround360', 'motorcycle360', 'autopilot', 'tesla', 'realistic3d', 'advanced3d', 'birdseye', 'immersive360'];
                    const currentIdx = modes.indexOf(fullscreenSceneMode);
                    const nextIdx = (currentIdx + 1) % modes.length;
                    const nextMode = modes[nextIdx];
                    
                    if (nextMode === 'immersive360' && !immersive360Available) {
                      setFullscreenSceneMode('autopilot');
                      setStatus('Immersive 360 unavailable on this browser/device.');
                      setError('WebGL is disabled, so 360 immersive mode cannot run here.');
                      return;
                    }
                    setFullscreenSceneMode(nextMode);
                  }}
                >
                  <Text style={styles.buttonText}>
                    Fullscreen Scene:{' '}
                    {fullscreenSceneMode === 'surround360'
                      ? 'Surround 360°'
                      : fullscreenSceneMode === 'motorcycle360'
                      ? 'Motorcycle 360°'
                      : fullscreenSceneMode === 'autopilot'
                      ? 'Tesla Autopilot'
                      : fullscreenSceneMode === 'tesla'
                      ? 'Tesla Style'
                      : fullscreenSceneMode === 'realistic3d'
                      ? 'Realistic 3D'
                      : fullscreenSceneMode === 'advanced3d'
                      ? 'Advanced 3D'
                      : fullscreenSceneMode === 'immersive360' && immersive360Available
                      ? 'Immersive 360'
                      : 'Birds-Eye'}
                  </Text>
                </Pressable>
                <Text style={[styles.status, compact && styles.statusSmall]}>
                  Side feed URLs (optional). If blank, placeholder panels are shown.
                </Text>
                <TextInput
                  style={[styles.input, compact && styles.inputCompact]}
                  value={loopFeedUrls.left}
                  onChangeText={(v) => setLoopFeedUrls((s) => ({ ...s, left: v }))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Left video URL (mp4/webm)"
                  placeholderTextColor="#A5B4FC"
                />
                <TextInput
                  style={[styles.input, compact && styles.inputCompact]}
                  value={loopFeedUrls.right}
                  onChangeText={(v) => setLoopFeedUrls((s) => ({ ...s, right: v }))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Right video URL (mp4/webm)"
                  placeholderTextColor="#A5B4FC"
                />
                <TextInput
                  style={[styles.input, compact && styles.inputCompact]}
                  value={loopFeedUrls.rear}
                  onChangeText={(v) => setLoopFeedUrls((s) => ({ ...s, rear: v }))}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="Rear video URL (mp4/webm)"
                  placeholderTextColor="#A5B4FC"
                />
                <View style={[styles.riskBadge, { backgroundColor: riskColor(globalBand) }]}>
                  <Text style={[styles.riskBadgeText, compact && styles.riskBadgeTextSmall]}>
                    {riskTitle}: {globalBand}
                  </Text>
                </View>
                <Text style={[styles.status, compact && styles.statusSmall]}>{status}</Text>
                {error ? (
                  <Text style={[styles.error, compact && styles.statusSmall]}>Error: {error}</Text>
                ) : null}
                <Text style={[styles.rideHint, compact && styles.rideHintSmall]}>
                  One lens cannot keep every depth tack-sharp at once; we steer metering and AF toward the
                  upper road, keep AE/AWB on the whole scene, tame highlight bloom when the server sees
                  glare, and still recommend a solid mount for vibration blur.
                </Text>
                <Pressable
                  style={styles.buttonAlt}
                  onPress={() => setSceneStableMeteringEnabled((v) => !v)}
                >
                  <Text style={styles.buttonText}>
                    Full-scene metering (AE/AWB): {sceneStableMeteringEnabled ? 'ON' : 'OFF'}
                  </Text>
                </Pressable>
                <Pressable style={styles.buttonAlt} onPress={() => setRoadPoiBiasEnabled((v) => !v)}>
                  <Text style={styles.buttonText}>
                    Road bias (metering point): {roadPoiBiasEnabled ? 'ON' : 'OFF'}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.buttonAlt}
                  onPress={() => setAntiHighlightBloomEnabled((v) => !v)}
                >
                  <Text style={styles.buttonText}>
                    Anti highlight bloom: {antiHighlightBloomEnabled ? 'ON' : 'OFF'}
                  </Text>
                </Pressable>
                <Pressable style={styles.buttonAlt} onPress={() => setDetailBoostEnabled((v) => !v)}>
                  <Text style={styles.buttonText}>Detail / sharpness: {detailBoostEnabled ? 'ON' : 'OFF'}</Text>
                </Pressable>
                <Pressable
                  style={styles.buttonAlt}
                  onPress={() => setRoadFocusFarEnabled((v) => !v)}
                >
                  <Text style={styles.buttonText}>
                    Road focus (far): {roadFocusFarEnabled ? 'ON' : 'OFF'}
                  </Text>
                </Pressable>
                <Pressable
                  style={styles.buttonAlt}
                  onPress={() => setNightExposureBoost((v) => !v)}
                >
                  <Text style={styles.buttonText}>
                    Night exposure boost: {nightExposureBoost ? 'ON' : 'OFF'}
                  </Text>
                </Pressable>
                <Pressable style={styles.buttonAlt} onPress={() => setTorchEnabled((v) => !v)}>
                  <Text style={styles.buttonText}>Rear light (torch): {torchEnabled ? 'ON' : 'OFF'}</Text>
                </Pressable>
                <Pressable
                  style={styles.buttonAlt}
                  onPress={() => switchMobilityMode(mobilityMode === 'walking' ? 'riding' : 'walking')}
                >
                  <Text style={styles.buttonText}>
                    Change mode: {mobilityMode === 'walking' ? 'Switch to Riding' : 'Switch to Walking'}
                  </Text>
                </Pressable>
                {cameraTuningNote ? (
                  <Text style={[styles.cameraNote, compact && styles.rideHintSmall]}>{cameraTuningNote}</Text>
                ) : null}
              </ScrollView>
            ) : null}

            {expandedPanel === 'radar' ? (
              <>
                <View style={[styles.radarBody, { height: radarSheetH }]}>
                  <View style={styles.radarSweepLine} />
                  {detections.slice(0, 12).map((d, idx) => {
                    const p = radarPoint(d, frameSize.w, frameSize.h);
                    const left = p.xNorm * 100;
                    const topPct = p.yNorm * 100;
                    const band = detectionBand(d);
                    return (
                      <View
                        key={`radar-${d.track_id}-${idx}`}
                        style={[
                          styles.radarDot,
                          compact && styles.radarDotSmall,
                          {
                            left: `${left}%`,
                            top: `${topPct}%`,
                            backgroundColor: riskColor(band),
                          },
                        ]}
                      />
                    );
                  })}
                  {radarGhosts.map((g) => {
                    const left = g.xNorm * 100;
                    const topPct = g.yNorm * 100;
                    const fade = Math.max(0.08, Math.min(0.45, (g.expiresAt - Date.now()) / RADAR_GHOST_MS * 0.45));
                    return (
                      <View
                        key={`radar-ghost-${g.track_id}`}
                        style={[
                          styles.radarDot,
                          compact && styles.radarDotSmall,
                          {
                            left: `${left}%`,
                            top: `${topPct}%`,
                            backgroundColor: riskColor(g.band),
                            opacity: fade,
                          },
                        ]}
                      />
                    );
                  })}
                </View>
                <Text style={[styles.radarHint, compact && styles.radarHintSmall]}>
                  Bottom near · Top far · Left/right lane
                </Text>
              </>
            ) : null}

            {expandedPanel === 'cal' ? (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={[styles.panelFabSheetScroll, { maxHeight: Math.min(360, winH * 0.42) }]}
              >
                <View style={[styles.calibrationCard, styles.calibrationCardInSheet]}>
                  <View style={[styles.calibrationRow, compact && styles.calibrationRowStack]}>
                    <Text style={[styles.calibrationLabel, compact && styles.calibrationLabelStack]}>
                      Focal-like
                    </Text>
                    <TextInput
                      style={[styles.calibrationInput, compact && styles.calibrationInputFull]}
                      value={calibration.focal_like}
                      onChangeText={(v) => setCalibration((c) => ({ ...c, focal_like: v }))}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.calibrationRow, compact && styles.calibrationRowStack]}>
                    <Text style={[styles.calibrationLabel, compact && styles.calibrationLabelStack]}>
                      Meters / pixel
                    </Text>
                    <TextInput
                      style={[styles.calibrationInput, compact && styles.calibrationInputFull]}
                      value={calibration.meters_per_px}
                      onChangeText={(v) => setCalibration((c) => ({ ...c, meters_per_px: v }))}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={[styles.calibrationRow, compact && styles.calibrationRowStack]}>
                    <Text style={[styles.calibrationLabel, compact && styles.calibrationLabelStack]}>
                      Default height (m)
                    </Text>
                    <TextInput
                      style={[styles.calibrationInput, compact && styles.calibrationInputFull]}
                      value={calibration.default_object_height_m}
                      onChangeText={(v) => setCalibration((c) => ({ ...c, default_object_height_m: v }))}
                      keyboardType="numeric"
                    />
                  </View>
                  <Pressable style={styles.saveCalButton} onPress={saveCalibration}>
                    <Text style={styles.saveCalButtonText}>Save calibration</Text>
                  </Pressable>
                </View>
              </ScrollView>
            ) : null}

            {expandedPanel === 'threat' && top ? (
              <View style={styles.topCard}>
                <Text style={[styles.topTitle, compact && styles.sectionTitleSmall]}>
                  {top.label} #{top.track_id}
                </Text>
                <Text style={[styles.topLine, compact && styles.topLineSmall]}>
                  Distance: {Number(top.distance_m).toFixed(2)} m
                </Text>
                <Text style={[styles.topLine, compact && styles.topLineSmall]}>
                  Speed: {top.is_moving ? `${Number(top.speed_kmh).toFixed(1)} km/h` : 'static'}
                </Text>
                <Text style={[styles.topLine, compact && styles.topLineSmall]}>
                  Threat: {threatScore(top)}/100
                </Text>
                <Text style={[styles.topLine, compact && styles.topLineSmall]}>
                  TTC: {Number(top.ttc_s) >= 900 ? 'N/A' : `${Number(top.ttc_s).toFixed(2)} s`}
                </Text>
                <Text style={[styles.topLine, compact && styles.topLineSmall]}>
                  Risk: {Math.round(Number(top.risk_percent))}%
                </Text>
              </View>
            ) : null}

            {expandedPanel === 'trip' ? (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
                style={[styles.tripSheetScroll, { maxHeight: sheetMaxH - 52 }]}
                contentContainerStyle={styles.tripSheetScrollContent}
              >
                <Text style={styles.tripIntro}>
                  Session counters and a debounced near-miss log (moving vehicles, caution/danger
                  only). Stored in memory on the server until you reset.
                </Text>
                {!tripDetail && !lastTripSnapshot ? (
                  <Text style={[styles.statusSmall, styles.tripMuted]}>Start detection to load trip data.</Text>
                ) : null}
                {tripDetail || lastTripSnapshot ? (
                  <>
                    <View style={styles.tripStatsBlock}>
                      <Text style={styles.tripStatLine}>
                        Trip time:{' '}
                        {(tripDetail || lastTripSnapshot).trip_elapsed_s != null
                          ? `${Number((tripDetail || lastTripSnapshot).trip_elapsed_s).toFixed(0)} s`
                          : '—'}
                      </Text>
                      <Text style={styles.tripStatLine}>
                        Frames: {(tripDetail || lastTripSnapshot).frames ?? 0}
                      </Text>
                      <Text style={styles.tripStatLine}>
                        Danger / caution / safe frames:{' '}
                        {(tripDetail || lastTripSnapshot).danger_frames ?? 0} /{' '}
                        {(tripDetail || lastTripSnapshot).caution_frames ?? 0} /{' '}
                        {(tripDetail || lastTripSnapshot).safe_frames ?? 0}
                      </Text>
                      <Text style={styles.tripStatLine}>
                        Logged events: {(tripDetail || lastTripSnapshot).near_miss_count ?? 0}
                      </Text>
                    </View>
                    <Pressable style={styles.tripResetBtn} onPress={resetTripStats}>
                      <Text style={styles.tripResetBtnText}>Reset trip</Text>
                    </Pressable>
                    <Text style={styles.tripSectionTitle}>Recent events</Text>
                    {!tripDetail ? (
                      <Text style={[styles.statusSmall, styles.tripMuted]}>Loading…</Text>
                    ) : (tripDetail.events || []).length === 0 ? (
                      <Text style={[styles.statusSmall, styles.tripMuted]}>
                        No caution or danger vehicle events yet.
                      </Text>
                    ) : (
                      (tripDetail.events || []).map((ev, idx) => (
                        <View key={`${ev.ts_s}-${ev.track_id}-${idx}`} style={styles.tripEventCard}>
                          <Text style={styles.tripEventTitle}>
                            {ev.severity} · {ev.label} #{ev.track_id}
                          </Text>
                          <Text style={styles.tripEventMeta}>
                            {new Date(ev.ts_s * 1000).toLocaleTimeString()} ·{' '}
                            {Number(ev.distance_m).toFixed(1)} m · risk {Number(ev.risk_percent).toFixed(0)}%
                            {ev.ttc_s != null ? ` · TTC ${Number(ev.ttc_s).toFixed(1)} s` : ''}
                          </Text>
                        </View>
                      ))
                    )}
                  </>
                ) : null}
              </ScrollView>
            ) : null}
          </View>
        </>
      ) : null}

      {/* PWA Features */}
      <PWAInstallButton />
      <OfflineIndicator />

      {/* Floating Control System */}
      <FloatingControlSystem />
    </View>
  );
}

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Helper function for platform-specific shadow styles
const createShadowStyle = (color, opacity, radius, offset = { width: 0, height: 0 }) => {
  if (Platform.OS === 'web') {
    return {
      boxShadow: `${offset.width}px ${offset.height}px ${radius}px rgba(${
        color === '#22D3EE' ? '34, 211, 238' :
        color === '#A78BFA' ? '167, 139, 250' :
        color === '#94A3B8' ? '148, 163, 184' :
        color === '#2DD4BF' ? '45, 212, 191' :
        color === '#FB923C' ? '251, 146, 60' :
        color === '#FACC15' ? '250, 204, 21' :
        '34, 211, 238'
      }, ${opacity})`
    };
  }
  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: offset,
  };
};

// Helper function for inline shadow styles with dynamic colors
const createInlineShadowStyle = (color, opacity = 0.35, radius = 6, offset = { width: 0, height: 0 }) => {
  if (Platform.OS === 'web') {
    // Extract RGB values from hex color
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    return {
      boxShadow: `${offset.width}px ${offset.height}px ${radius}px rgba(${r}, ${g}, ${b}, ${opacity})`
    };
  }
  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: offset,
  };
};

// Helper function for platform-specific text shadow styles
const createTextShadowStyle = (color, offset, radius) => {
  if (Platform.OS === 'web') {
    return {
      textShadow: `${offset.width}px ${offset.height}px ${radius}px ${color}`
    };
  }
  return {
    textShadowColor: color,
    textShadowOffset: offset,
    textShadowRadius: radius,
  };
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    minHeight: '100%',
    backgroundColor: '#030712',
    position: 'relative',
  },
  idleAtmosphere: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9,
  },
  idleVignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.28)',
  },
  idleGridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(34, 211, 238, 0.07)',
  },
  idleGridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(167, 139, 250, 0.06)',
  },
  idleCornerTL: {
    position: 'absolute',
    top: '7%',
    left: '4%',
  },
  idleCornerTR: {
    position: 'absolute',
    top: '7%',
    right: '4%',
    alignItems: 'flex-end',
  },
  idleCornerBL: {
    position: 'absolute',
    bottom: '22%',
    left: '4%',
  },
  idleCornerBR: {
    position: 'absolute',
    bottom: '22%',
    right: '4%',
    alignItems: 'flex-end',
  },
  idleCornerH: {
    width: 36,
    height: 2,
    backgroundColor: 'rgba(34, 211, 238, 0.65)',
    borderRadius: 1,
  },
  idleCornerV: {
    width: 2,
    height: 36,
    marginTop: -2,
    backgroundColor: 'rgba(34, 211, 238, 0.65)',
    borderRadius: 1,
  },
  idleMiddle: {
    ...StyleSheet.absoluteFillObject,
    bottom: 128,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  idleCenterRing: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.35)',
    marginBottom: 14,
    ...createShadowStyle('#22D3EE', 0.2, 20),
  },
  idleCenterBlock: {
    alignItems: 'center',
    maxWidth: 320,
    backgroundColor: 'rgba(3, 7, 18, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.22)',
    borderRadius: 4,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  idleTagline: {
    color: '#E0F2FE',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
  },
  idleTaglineDim: {
    color: '#67E8F9',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3,
    marginTop: 6,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
  },
  idleStatusEcho: {
    color: '#A5F3FC',
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
    lineHeight: 18,
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
    fontWeight: '600',
    opacity: 0.9,
  },
  boxLayer: { ...StyleSheet.absoluteFillObject, zIndex: 16 },
  detectionBox: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 2,
    borderColor: '#22D3EE',
    backgroundColor: 'rgba(2, 6, 23, 0.12)',
    ...createShadowStyle('#22D3EE', 0.35, 6),
  },
  detectionLabel: {
    position: 'absolute',
    left: -2,
    top: -26,
    backgroundColor: 'rgba(8, 15, 35, 0.92)',
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderLeftWidth: 3,
    borderLeftColor: '#2DD4BF',
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: 'rgba(45, 212, 191, 0.35)',
    borderRightColor: 'rgba(45, 212, 191, 0.2)',
    borderBottomColor: 'rgba(45, 212, 191, 0.2)',
  },
  detectionLabelText: {
    color: '#F0FDFA',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
    letterSpacing: 0.4,
  },
  detectionLabelTextCompact: { fontSize: 10, lineHeight: 13 },
  mainSheetScroll: {
    width: '100%',
  },
  mainSheetScrollContent: {
    paddingBottom: 12,
  },
  quickRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 6,
  },
  buttonHalf: {
    flex: 1,
    marginBottom: 0,
    marginHorizontal: 0,
    minHeight: 44,
    justifyContent: 'center',
  },
  buttonHalfLeft: {
    marginRight: 8,
  },
  buttonTextSmall: { fontSize: 13 },
  inputCompact: {
    paddingVertical: 8,
    marginBottom: 6,
    fontSize: 13,
  },
  riskBadgeTextSmall: { fontSize: 14 },
  sectionTitleSmall: { fontSize: 13, marginBottom: 4 },
  statusSmall: { fontSize: 12 },
  topLineSmall: { fontSize: 11 },
  radarDotSmall: {
    width: 8,
    height: 8,
    marginLeft: -4,
    marginTop: -4,
  },
  radarHintSmall: { fontSize: 10, marginTop: 4 },
  calibrationRowStack: {
    flexDirection: 'column',
    alignItems: 'stretch',
    marginBottom: 8,
  },
  calibrationLabelStack: {
    marginRight: 0,
    marginBottom: 4,
    flex: 0,
  },
  calibrationInputFull: {
    width: '100%',
    alignSelf: 'stretch',
    textAlign: 'left',
  },
  modePickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 60,
    backgroundColor: 'rgba(2, 6, 23, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modePickerCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.5)',
    backgroundColor: 'rgba(6, 11, 28, 0.96)',
    padding: 16,
  },
  modePickerTitle: {
    color: '#F0F9FF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 0.6,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
  },
  modePickerSub: {
    color: '#A5F3FC',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
  },
  modePickerButton: {
    minHeight: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34, 211, 238, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.5)',
    marginBottom: 10,
  },
  modePickerButtonAlt: {
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
    borderColor: 'rgba(125, 211, 252, 0.5)',
    marginBottom: 0,
  },
  modePickerButtonText: {
    color: '#F0F9FF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.6,
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
  },
  saveCalButton: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 4,
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.45)',
  },
  saveCalButtonText: {
    color: '#CCFBF1',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 1,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.35)',
    borderRadius: 4,
    color: '#ECFEFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
    fontSize: 15,
    fontWeight: '600',
  },
  button: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 4,
    backgroundColor: 'rgba(8, 145, 178, 0.55)',
    marginBottom: 8,
    minHeight: 46,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.65)',
    ...createShadowStyle('#22D3EE', 0.25, 10),
  },
  buttonAlt: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 4,
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    marginBottom: 8,
    minHeight: 46,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.45)',
  },
  buttonText: {
    color: '#F8FAFC',
    fontWeight: '700',
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
    letterSpacing: 0.8,
    fontSize: 15,
  },
  riskBadge: {
    alignItems: 'center',
    borderRadius: 4,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  riskBadgeText: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 2,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
    fontSize: 13,
  },
  status: {
    color: '#A5F3FC',
    marginBottom: 4,
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
    fontSize: 14,
  },
  error: {
    color: '#FCA5A5',
    marginBottom: 4,
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
  },
  rideHint: {
    color: 'rgba(186, 230, 253, 0.82)',
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
  },
  rideHintSmall: {
    fontSize: 11,
    lineHeight: 15,
  },
  cameraNote: {
    color: 'rgba(167, 243, 208, 0.95)',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 6,
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
  },
  topCard: {
    borderRadius: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.25)',
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(34, 211, 238, 0.7)',
  },
  topTitle: {
    color: '#F0F9FF',
    fontWeight: '800',
    marginBottom: 4,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
    letterSpacing: 0.6,
  },
  topLine: {
    color: '#BAE6FD',
    fontSize: 13,
    marginBottom: 2,
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
    fontWeight: '600',
  },
  hudStateTint: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  hudStateTintLive: {
    backgroundColor: 'rgba(6, 182, 212, 0.07)',
  },
  hudStateTintIdle: {
    backgroundColor: 'rgba(99, 102, 241, 0.055)',
  },
  hudTelemetryBar: {
    position: 'absolute',
    top: 4,
    left: 8,
    right: 8,
    zIndex: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.28)',
    backgroundColor: 'rgba(3, 7, 18, 0.72)',
  },
  hudTelemetryBarCompact: {
    top: 6,
    left: 6,
    right: 6,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  hudTelLeft: {
    color: '#A5F3FC',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
  },
  hudTelMid: {
    color: '#E0F2FE',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.6,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
  },
  hudTelMidCompact: {
    fontSize: 9,
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  hudTelRight: {
    color: '#7DD3FC',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
  },
  hudTelRightCompact: {
    fontSize: 9,
    letterSpacing: 0.8,
  },
  hudPanelTitle: {
    color: '#67E8F9',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 4,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
  },
  hudThreatLadder: {
    position: 'absolute',
    left: 8,
    top: 34,
    width: 210,
    zIndex: 12,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.26)',
    backgroundColor: 'rgba(3, 7, 18, 0.62)',
    borderRadius: 4,
  },
  hudThreatLadderCompact: {
    top: 35,
    left: 6,
    width: '55%',
    minWidth: 160,
    maxWidth: 220,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  hudPanelEmpty: {
    color: '#94A3B8',
    fontSize: 11,
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
  },
  hudLadderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  hudLadderPill: {
    width: 6,
    height: 6,
    borderRadius: 2,
    marginRight: 6,
  },
  hudLadderText: {
    color: '#BAE6FD',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
  },
  hudLadderTextCompact: {
    fontSize: 10,
  },
  hudGuidanceBar: {
    position: 'absolute',
    left: '24%',
    right: '24%',
    top: 34,
    zIndex: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.26)',
    backgroundColor: 'rgba(3, 7, 18, 0.55)',
    borderRadius: 4,
  },
  hudGuidanceBarCompact: {
    left: 6,
    right: 6,
    top: 112,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  hudGuidanceTrack: {
    height: 16,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.3)',
    backgroundColor: 'rgba(2, 6, 23, 0.8)',
    borderRadius: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  hudGuidanceCenter: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(167, 139, 250, 0.85)',
  },
  hudGuidanceMarker: {
    position: 'absolute',
    top: 1,
    width: 10,
    height: 12,
    marginLeft: -5,
    borderRadius: 2,
    backgroundColor: '#22D3EE',
  },
  hudGuidanceMeta: {
    marginTop: 4,
    color: '#A5F3FC',
    fontSize: 11,
    textAlign: 'center',
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
  },
  hudGuidanceMetaCompact: {
    fontSize: 10,
    marginTop: 3,
  },
  hudSystemCard: {
    position: 'absolute',
    right: 86,
    top: 34,
    width: 175,
    zIndex: 12,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.26)',
    backgroundColor: 'rgba(3, 7, 18, 0.62)',
    borderRadius: 4,
  },
  hudSystemCardCompact: {
    right: 6,
    top: 35,
    width: 132,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  hudSystemLine: {
    color: '#A5F3FC',
    fontSize: 11,
    marginBottom: 2,
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
  },
  hudSystemLineCompact: {
    fontSize: 10,
    marginBottom: 1,
  },
  rideVideoCurtain: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 35,
    backgroundColor: '#020617',
  },
  rideFullscreenShell: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  rideVisionLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 6,
    overflow: 'visible',
  },
  rideVisionLayerFullscreen: {
    ...StyleSheet.absoluteFillObject,
    bottom: 0,
  },
  rideFullscreenClose: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 50,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(3, 7, 18, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.45)',
  },
  rideFullscreenClosePressed: {
    backgroundColor: 'rgba(8, 51, 68, 0.92)',
  },
  rideFullscreenCloseGlyph: {
    color: '#E0F2FE',
    fontSize: 22,
    fontWeight: '700',
    marginTop: -1,
  },
  rideFloatFab: {
    position: 'absolute',
    left: 12,
    width: 52,
    height: 52,
    borderRadius: 26,
    zIndex: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(3, 7, 18, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.55)',
    ...createShadowStyle('#22D3EE', 0.25, 10),
  },
  rideFloatFabPressed: {
    backgroundColor: 'rgba(8, 51, 68, 0.95)',
    borderColor: 'rgba(34, 211, 238, 0.75)',
  },
  rideFloatFabGlyph: {
    color: '#5EEAD4',
    fontSize: 22,
    fontWeight: '800',
  },
  rideTopBadge: {
    position: 'absolute',
    top: 50,
    left: 12,
    zIndex: 4,
    maxWidth: 220,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.35)',
    backgroundColor: 'rgba(3, 7, 18, 0.55)',
  },
  rideTopBadgeTitle: {
    color: '#22D3EE',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
  },
  rideTopBadgeSub: {
    color: 'rgba(165, 243, 252, 0.85)',
    fontSize: 9,
    marginTop: 3,
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
    fontWeight: '600',
  },
  hudBottomDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 13,
    flexDirection: 'column',
    backgroundColor: 'rgba(3, 7, 18, 0.92)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(34, 211, 238, 0.4)',
    paddingTop: 6,
    paddingLeft: 8,
    justifyContent: 'flex-end',
  },
  hudBottomDockCompact: {
    paddingLeft: 6,
    paddingTop: 5,
  },
  hudDockTickBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 6,
    marginBottom: 3,
    paddingHorizontal: 2,
  },
  hudDockTickCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: 6,
  },
  hudDockTick: {
    width: 1,
    height: 3,
    backgroundColor: 'rgba(34, 211, 238, 0.35)',
    borderRadius: 1,
  },
  hudDockTickMajor: {
    height: 5,
    backgroundColor: 'rgba(34, 211, 238, 0.65)',
  },
  hudDockMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  hudDockMetricLeft: {
    color: '#7DD3FC',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
  },
  hudDockMetricRight: {
    color: '#A5F3FC',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
  },
  hudDockSparkRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 16,
    marginBottom: 4,
    paddingHorizontal: 2,
    gap: 1,
  },
  hudSparkCell: {
    flex: 1,
    height: 16,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  hudSparkBar: {
    width: '72%',
    maxWidth: 5,
    borderRadius: 1,
  },
  hudDockRadar: {
    flex: 1,
    minHeight: 38,
    maxHeight: 46,
    marginBottom: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.3)',
    backgroundColor: 'rgba(2, 6, 23, 0.95)',
    position: 'relative',
    overflow: 'hidden',
  },
  hudDockRadarLine: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(34, 211, 238, 0.35)',
  },
  hudDockSweep: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: 0,
    height: 2,
    backgroundColor: 'rgba(34, 211, 238, 0.85)',
    borderRadius: 1,
    ...createShadowStyle('#22D3EE', 0.9, 6),
  },
  hudDockDot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 2,
    marginLeft: -4,
    marginTop: -4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  hudDockFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 4,
    paddingBottom: 2,
  },
  hudDockTitle: {
    color: '#67E8F9',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
  },
  hudDockMeta: {
    color: '#A5F3FC',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
  },
  hudFabRail: {
    position: 'absolute',
    right: 36,
    width: 3,
    zIndex: 21,
    backgroundColor: 'rgba(34, 211, 238, 0.18)',
    borderRadius: 2,
    borderWidth: 1,
    borderColor: 'rgba(6, 182, 212, 0.35)',
    ...createShadowStyle('#22D3EE', 0.5, 8),
  },
  panelFab: {
    position: 'absolute',
    right: 16,
    width: 54,
    height: 54,
    borderRadius: 14,
    zIndex: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    backgroundColor: 'rgba(6, 10, 22, 0.92)',
    overflow: 'visible',
  },
  panelFabMain: {
    borderColor: 'rgba(167, 139, 250, 0.95)',
    ...createShadowStyle('#A78BFA', 0.55, 14),
    backgroundColor: 'rgba(46, 16, 80, 0.75)',
  },
  panelFabRadar: {
    borderColor: 'rgba(34, 211, 238, 0.9)',
    ...createShadowStyle('#22D3EE', 0.5, 14),
    backgroundColor: 'rgba(8, 47, 73, 0.85)',
  },
  panelFabCal: {
    borderColor: 'rgba(148, 163, 184, 0.85)',
    ...createShadowStyle('#94A3B8', 0.35, 10),
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
  },
  panelFabTrip: {
    borderColor: 'rgba(45, 212, 191, 0.9)',
    ...createShadowStyle('#2DD4BF', 0.45, 12),
    backgroundColor: 'rgba(6, 78, 59, 0.75)',
  },
  panelFabThreat: {
    borderColor: 'rgba(251, 146, 60, 0.95)',
    ...createShadowStyle('#FB923C', 0.5, 14),
    backgroundColor: 'rgba(67, 20, 7, 0.8)',
  },
  panelFabGlyph: {
    color: '#F8FAFC',
    fontSize: 21,
    fontWeight: '800',
    ...createTextShadowStyle('rgba(0, 0, 0, 0.75)', { width: 0, height: 1 }, 3),
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
  },
  panelFabBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(127, 29, 29, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(254, 202, 202, 0.9)',
  },
  panelFabBadgeText: {
    color: '#FFFBEB',
    fontSize: 10,
    fontWeight: '800',
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
  },
  panelFabDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 9,
    height: 9,
    borderRadius: 2,
    backgroundColor: '#FACC15',
    borderWidth: 1,
    borderColor: '#FDE047',
    ...createShadowStyle('#FACC15', 0.9, 6),
  },
  panelFabBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 25,
    backgroundColor: 'rgba(2, 6, 18, 0.78)',
  },
  panelFabSheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    zIndex: 30,
    borderRadius: 6,
    padding: 14,
    maxWidth: 520,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  hudSheetAccentTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#22D3EE',
    opacity: 0.85,
  },
  hudSheetTitle: {
    color: '#ECFEFF',
    fontWeight: '800',
    marginBottom: 0,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
    letterSpacing: 1.4,
    fontSize: 14,
    textTransform: 'uppercase',
  },
  panelFabSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 4,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(34, 211, 238, 0.2)',
  },
  panelFabCloseHit: { paddingVertical: 6, paddingHorizontal: 6 },
  panelFabClose: {
    color: '#67E8F9',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
  },
  panelFabSheetTitle: { marginBottom: 0 },
  panelFabSheetScroll: {
    width: '100%',
  },
  calibrationCardInSheet: {
    marginBottom: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  tripSheetScroll: { width: '100%' },
  tripSheetScrollContent: { paddingBottom: 16 },
  tripIntro: {
    color: '#7DD3FC',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
    fontWeight: '500',
  },
  tripMuted: { color: '#94A3B8', fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined },
  tripStatsBlock: {
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.25)',
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(167, 139, 250, 0.8)',
  },
  tripStatLine: {
    color: '#E0F2FE',
    fontSize: 14,
    marginBottom: 4,
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
    fontWeight: '600',
  },
  tripResetBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 4,
    backgroundColor: 'rgba(69, 10, 10, 0.85)',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.55)',
  },
  tripResetBtnText: {
    color: '#FECACA',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1.2,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
  },
  tripSectionTitle: {
    color: '#F0F9FF',
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 6,
    letterSpacing: 1.5,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
    textTransform: 'uppercase',
  },
  tripEventCard: {
    backgroundColor: 'rgba(8, 15, 35, 0.88)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
    padding: 10,
    marginBottom: 6,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(251, 191, 36, 0.75)',
  },
  tripEventTitle: {
    color: '#F8FAFC',
    fontWeight: '800',
    fontSize: 13,
    marginBottom: 2,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
    letterSpacing: 0.4,
  },
  tripEventMeta: {
    color: '#7DD3FC',
    fontSize: 12,
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
    fontWeight: '500',
  },
  radarBody: {
    height: 120,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.35)',
    backgroundColor: 'rgba(2, 6, 23, 0.95)',
    position: 'relative',
    overflow: 'hidden',
  },
  radarSweepLine: {
    position: 'absolute',
    left: '50%',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(34, 211, 238, 0.45)',
  },
  radarDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 999,
    marginLeft: -5,
    marginTop: -5,
  },
  radarHint: {
    color: '#7DD3FC',
    fontSize: 11,
    marginTop: 6,
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
    letterSpacing: 0.5,
  },
  calibrationCard: {
    marginBottom: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.2)',
    padding: 8,
  },
  calibrationTitle: {
    color: '#E0F2FE',
    fontWeight: '800',
    marginBottom: 6,
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
    letterSpacing: 1,
    fontSize: 12,
    textTransform: 'uppercase',
  },
  calibrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  calibrationLabel: {
    color: '#BAE6FD',
    fontSize: 13,
    flex: 1,
    marginRight: 8,
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
    fontWeight: '600',
  },
  calibrationInput: {
    width: 110,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.35)',
    borderRadius: 4,
    color: '#F0FDFA',
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    textAlign: 'right',
    fontSize: 14,
    fontFamily: Platform.OS === 'web' ? 'Rajdhani, system-ui, sans-serif' : undefined,
    fontWeight: '600',
  },

  // Floating Control System Styles
  floatingButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 60,
    height: 60,
    zIndex: 200,
  },
  floatingButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderWidth: 2,
    borderColor: 'rgba(45, 212, 191, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 4px 12px rgba(34, 211, 238, 0.4)',
      animation: 'pulse 2s infinite',
    } : {
      shadowColor: '#22D3EE',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 12,
      elevation: 8,
    }),
  },
  floatingButtonActive: {
    backgroundColor: 'rgba(34, 211, 238, 0.2)',
    borderColor: 'rgba(34, 211, 238, 0.8)',
    shadowOpacity: 0.6,
    shadowRadius: 16,
    transform: [{ scale: 1.1 }],
  },
  floatingButtonIcon: {
    fontSize: 28,
    color: '#22D3EE',
    fontWeight: 'bold',
    ...(Platform.OS === 'web' ? {
      textShadow: '0 0 8px rgba(34, 211, 238, 0.5)',
    } : {
      textShadowColor: 'rgba(34, 211, 238, 0.5)',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 8,
    }),
  },
  bottomNavBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'rgba(255, 0, 0, 0.8)', // Temporary red background for debugging
    borderTopWidth: 1,
    borderTopColor: 'rgba(45, 212, 191, 0.3)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: Platform.OS === 'web' ? 8 : 20, // Account for safe area
    zIndex: 100,
    // Add backdrop blur effect for web
    ...(Platform.OS === 'web' && {
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
    }),
  },
  bottomNavItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
    marginHorizontal: 2,
    position: 'relative',
    transition: 'all 0.2s ease',
  },
  bottomNavItemActive: {
    backgroundColor: 'rgba(34, 211, 238, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.4)',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 2px 4px rgba(34, 211, 238, 0.3)',
    } : {
      shadowColor: '#22D3EE',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 4,
    }),
  },
  bottomNavIcon: {
    fontSize: 20,
    marginBottom: 2,
    color: '#94A3B8',
    transition: 'color 0.2s ease',
  },
  bottomNavIconActive: {
    color: '#22D3EE',
    ...(Platform.OS === 'web' ? {
      textShadow: '0 0 8px rgba(34, 211, 238, 0.5)',
    } : {
      textShadowColor: 'rgba(34, 211, 238, 0.5)',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 8,
    }),
  },
  bottomNavLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    transition: 'color 0.2s ease',
  },
  bottomNavLabelActive: {
    color: '#22D3EE',
    fontWeight: '600',
  },
  activeIndicator: {
    position: 'absolute',
    top: 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#22D3EE',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 0 4px rgba(34, 211, 238, 0.8)',
    } : {
      shadowColor: '#22D3EE',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 4,
    }),
  },
  expandablePanel: {
    position: 'absolute',
    bottom: 80, // Above the nav bar
    left: 0,
    right: 0,
    height: screenHeight * 0.6, // 60% of screen height
    backgroundColor: 'rgba(15, 23, 42, 0.98)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(45, 212, 191, 0.4)',
    zIndex: 90,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? {
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      boxShadow: '0 -4px 16px rgba(0, 0, 0, 0.3)',
    } : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 16,
    }),
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(45, 212, 191, 0.3)',
    position: 'relative',
  },
  panelHandle: {
    position: 'absolute',
    top: 8,
    left: '50%',
    marginLeft: -20,
    width: 40,
    height: 4,
    backgroundColor: 'rgba(148, 163, 184, 0.5)',
    borderRadius: 2,
  },
  panelTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'web' ? 'Orbitron, sans-serif' : undefined,
    ...createTextShadowStyle('rgba(34, 211, 238, 0.3)', { width: 0, height: 1 }, 2),
  },
  panelStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
    // Add pulsing animation for active status
    ...(Platform.OS === 'web' && {
      animation: 'pulse 1.5s infinite',
    }),
  },
  statusLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  panelContent: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    overflow: 'hidden',
  },

  pwaInstallButton: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(34, 211, 238, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 150,
  },
  pwaInstallText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },

  offlineIndicator: {
    position: 'absolute',
    top: 20,
    left: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 150,
  },
  offlineText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});

// Add CSS animations for web platform
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse {
      0% {
        opacity: 1;
        transform: scale(1);
      }
      50% {
        opacity: 0.8;
        transform: scale(1.05);
      }
      100% {
        opacity: 1;
        transform: scale(1);
      }
    }
    
    @keyframes slideUp {
      from {
        transform: translateY(100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }
    
    @keyframes slideDown {
      from {
        transform: translateY(0);
        opacity: 1;
      }
      to {
        transform: translateY(100%);
        opacity: 0;
      }
    }
    
    @keyframes fadeIn {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    
    @keyframes glow {
      0% {
        box-shadow: 0 0 5px rgba(34, 211, 238, 0.3);
      }
      50% {
        box-shadow: 0 0 20px rgba(34, 211, 238, 0.6);
      }
      100% {
        box-shadow: 0 0 5px rgba(34, 211, 238, 0.3);
      }
    }
    
    @keyframes bounce {
      0%, 20%, 50%, 80%, 100% {
        transform: translateY(0);
      }
      40% {
        transform: translateY(-4px);
      }
      60% {
        transform: translateY(-2px);
      }
    }
  `;
  document.head.appendChild(style);
}
