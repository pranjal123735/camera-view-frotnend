/**
 * Tesla-style object detection overlay on live camera feed.
 * Shows real camera with 3D bounding boxes, labels, distances, and confidence.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

function getRiskColor(det) {
  const risk = Number(det?.risk_percent || 0);
  const ttc = Number(det?.ttc_s || 999);
  if (risk >= 75 || ttc < 1.8) return '#DC2626'; // Red
  if (risk >= 40 || ttc < 3.5) return '#D97706'; // Orange
  return '#059669'; // Green
}

function getRiskBand(det) {
  const risk = Number(det?.risk_percent || 0);
  const ttc = Number(det?.ttc_s || 999);
  if (risk >= 75 || ttc < 1.8) return 'DANGER';
  if (risk >= 40 || ttc < 3.5) return 'CAUTION';
  return 'SAFE';
}

export default function TeslaStyleView({ 
  width, 
  height, 
  detections, 
  frameSize, 
  isRunning, 
  videoElement,
  frameDiagnostics 
}) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ w: width || 640, h: height || 480 });

  useEffect(() => {
    setCanvasSize({ w: width || 640, h: height || 480 });
  }, [width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !videoElement) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      if (!isRunning) {
        animationRef.current = requestAnimationFrame(draw);
        return;
      }

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Get video dimensions
      const videoW = videoElement.videoWidth || frameSize?.w || 1280;
      const videoH = videoElement.videoHeight || frameSize?.h || 720;
      const canvasW = canvas.width;
      const canvasH = canvas.height;

      // Calculate scale factors
      const scaleX = canvasW / videoW;
      const scaleY = canvasH / videoH;

      // Draw detections
      (detections || []).forEach((det, idx) => {
        const [x1, y1, x2, y2] = det.bbox_xyxy.map(Number);
        
        // Scale coordinates to canvas
        const left = x1 * scaleX;
        const top = y1 * scaleY;
        const right = x2 * scaleX;
        const bottom = y2 * scaleY;
        const boxW = right - left;
        const boxH = bottom - top;

        const color = getRiskColor(det);
        const band = getRiskBand(det);
        const distance = Number(det.distance_m || 0);
        const confidence = Number(det.confidence || 0);
        const speed = Number(det.speed_kmh || 0);
        const isMoving = det.is_moving;

        // Tesla-style 3D bounding box
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);

        // Main bounding box
        ctx.strokeRect(left, top, boxW, boxH);

        // Corner markers (Tesla style)
        const cornerSize = Math.min(boxW, boxH) * 0.15;
        ctx.lineWidth = 3;
        
        // Top-left corner
        ctx.beginPath();
        ctx.moveTo(left, top + cornerSize);
        ctx.lineTo(left, top);
        ctx.lineTo(left + cornerSize, top);
        ctx.stroke();

        // Top-right corner
        ctx.beginPath();
        ctx.moveTo(right - cornerSize, top);
        ctx.lineTo(right, top);
        ctx.lineTo(right, top + cornerSize);
        ctx.stroke();

        // Bottom-left corner
        ctx.beginPath();
        ctx.moveTo(left, bottom - cornerSize);
        ctx.lineTo(left, bottom);
        ctx.lineTo(left + cornerSize, bottom);
        ctx.stroke();

        // Bottom-right corner
        ctx.beginPath();
        ctx.moveTo(right - cornerSize, bottom);
        ctx.lineTo(right, bottom);
        ctx.lineTo(right, bottom - cornerSize);
        ctx.stroke();

        // Center crosshair
        const centerX = left + boxW / 2;
        const centerY = top + boxH / 2;
        const crossSize = 8;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(centerX - crossSize, centerY);
        ctx.lineTo(centerX + crossSize, centerY);
        ctx.moveTo(centerX, centerY - crossSize);
        ctx.lineTo(centerX, centerY + crossSize);
        ctx.stroke();

        // Distance line from center to bottom
        if (distance > 0) {
          ctx.setLineDash([5, 5]);
          ctx.lineWidth = 1;
          ctx.strokeStyle = color;
          ctx.beginPath();
          ctx.moveTo(centerX, centerY);
          ctx.lineTo(centerX, bottom + 20);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Tesla-style info panel
        const panelX = left;
        const panelY = top - 80;
        const panelW = Math.max(boxW, 180);
        const panelH = 75;

        // Panel background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(panelX, panelY, panelW, panelH);

        // Panel border
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(panelX, panelY, panelW, panelH);

        // Text content
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px "SF Pro Display", system-ui, sans-serif';
        
        // Object label and ID
        const label = `${det.label.toUpperCase()} #${det.track_id || '?'}`;
        ctx.fillText(label, panelX + 8, panelY + 18);

        // Distance and speed
        ctx.font = '12px "SF Pro Display", system-ui, sans-serif';
        ctx.fillStyle = '#E5E7EB';
        const distText = `${distance.toFixed(1)}m`;
        const speedText = isMoving ? `${speed.toFixed(0)} km/h` : 'STATIC';
        ctx.fillText(`${distText} • ${speedText}`, panelX + 8, panelY + 35);

        // Risk and confidence
        ctx.fillStyle = color;
        ctx.font = 'bold 11px "SF Pro Display", system-ui, sans-serif';
        const riskText = `${band} ${Math.round(det.risk_percent || 0)}%`;
        ctx.fillText(riskText, panelX + 8, panelY + 50);

        ctx.fillStyle = '#9CA3AF';
        ctx.font = '10px "SF Pro Display", system-ui, sans-serif';
        const confText = `CONF ${Math.round(confidence * 100)}%`;
        ctx.fillText(confText, panelX + 8, panelY + 65);

        // Moving indicator
        if (isMoving) {
          ctx.fillStyle = '#10B981';
          ctx.font = 'bold 10px "SF Pro Display", system-ui, sans-serif';
          ctx.fillText('●', panelX + panelW - 20, panelY + 18);
        }

        // Track age indicator
        const trackAge = Number(det.track_age_s || 0);
        if (trackAge > 0) {
          ctx.fillStyle = '#6B7280';
          ctx.font = '9px "SF Pro Display", system-ui, sans-serif';
          ctx.fillText(`${trackAge.toFixed(1)}s`, panelX + panelW - 35, panelY + 65);
        }
      });

      // Frame diagnostics overlay (top-right)
      if (frameDiagnostics) {
        const diagX = canvasW - 200;
        const diagY = 10;
        const diagW = 190;
        const diagH = 80;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(diagX, diagY, diagW, diagH);

        // Border
        ctx.strokeStyle = frameDiagnostics.low_light ? '#F59E0B' : '#10B981';
        ctx.lineWidth = 1;
        ctx.strokeRect(diagX, diagY, diagW, diagH);

        // Title
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 12px "SF Pro Display", system-ui, sans-serif';
        ctx.fillText('FRAME DIAGNOSTICS', diagX + 8, diagY + 18);

        // Quality
        ctx.font = '11px "SF Pro Display", system-ui, sans-serif';
        ctx.fillStyle = '#E5E7EB';
        ctx.fillText(`Quality: ${frameDiagnostics.quality_hint.toUpperCase()}`, diagX + 8, diagY + 35);

        // Brightness
        const brightness = Math.round((frameDiagnostics.brightness_01 || 0) * 100);
        ctx.fillText(`Brightness: ${brightness}%`, diagX + 8, diagY + 50);

        // Warnings
        ctx.font = '10px "SF Pro Display", system-ui, sans-serif';
        if (frameDiagnostics.low_light) {
          ctx.fillStyle = '#F59E0B';
          ctx.fillText('⚠ LOW LIGHT', diagX + 8, diagY + 65);
        }
        if (frameDiagnostics.glare_risk) {
          ctx.fillStyle = '#EF4444';
          ctx.fillText('⚠ GLARE RISK', diagX + 100, diagY + 65);
        }
      }

      // Detection count and FPS (bottom-left)
      const statsX = 10;
      const statsY = canvasH - 60;
      const statsW = 150;
      const statsH = 50;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(statsX, statsY, statsW, statsH);

      ctx.strokeStyle = '#22D3EE';
      ctx.lineWidth = 1;
      ctx.strokeRect(statsX, statsY, statsW, statsH);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 11px "SF Pro Display", system-ui, sans-serif';
      ctx.fillText('DETECTION STATUS', statsX + 8, statsY + 15);

      ctx.font = '10px "SF Pro Display", system-ui, sans-serif';
      ctx.fillStyle = '#E5E7EB';
      const detCount = detections?.length || 0;
      const movingCount = detections?.filter(d => d.is_moving)?.length || 0;
      ctx.fillText(`Objects: ${detCount} (${movingCount} moving)`, statsX + 8, statsY + 30);
      ctx.fillText(`Frame: ${frameSize?.w || 0}×${frameSize?.h || 0}`, statsX + 8, statsY + 42);

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [detections, frameSize, isRunning, videoElement, frameDiagnostics]);

  if (Platform.OS !== 'web') {
    return null;
  }

  return (
    <View style={[StyleSheet.absoluteFillObject, { zIndex: 2 }]} pointerEvents="none">
      <canvas
        ref={canvasRef}
        width={canvasSize.w}
        height={canvasSize.h}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      />
      
      {/* Tesla-style status bar */}
      <View style={styles.statusBar} pointerEvents="none">
        <View style={styles.statusLeft}>
          <Text style={styles.statusText}>
            {isRunning ? 'AUTOPILOT ACTIVE' : 'AUTOPILOT STANDBY'}
          </Text>
          <View style={[styles.statusDot, { backgroundColor: isRunning ? '#10B981' : '#6B7280' }]} />
        </View>
        
        <View style={styles.statusCenter}>
          <Text style={styles.statusTextLarge}>
            {detections?.length || 0} OBJECTS
          </Text>
        </View>
        
        <View style={styles.statusRight}>
          <Text style={styles.statusText}>
            {frameDiagnostics?.quality_hint?.toUpperCase() || 'READY'}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statusBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(34, 211, 238, 0.5)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  statusLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusCenter: {
    flex: 1,
    alignItems: 'center',
  },
  statusRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  statusText: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'system-ui',
  },
  statusTextLarge: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: 'system-ui',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
});