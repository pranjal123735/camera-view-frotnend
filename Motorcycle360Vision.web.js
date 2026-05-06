/**
 * Tesla-style 360° Surround Vision System - 3D Renderer
 * Displays 4 camera feeds in a 360° ring around a motorcycle model
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import voiceAlertSystem from './VoiceAlertSystem';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Hazard level colors
const HAZARD_COLORS = {
  0: '#00ff88', // Clear - Green
  1: '#ffcc00', // Watch - Yellow
  2: '#ff8800', // Warning - Orange
  3: '#ff0000'  // Danger - Red
};

// Alert colors for global hazard
const ALERT_COLORS = {
  green: '#00ff88',
  blue: '#00ccff',
  yellow: '#ffcc00',
  red: '#ff0000'
};

const Motorcycle360Vision = ({ 
  width = screenWidth, 
  height = screenHeight,
  visionData = null,
  cameraFeeds = {},
  isRunning = false,
  fallbackMode = false
}) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const [ctx, setCtx] = useState(null);
  const [bikeRotation, setBikeRotation] = useState(0);
  const [cameraRotation, setCameraRotation] = useState(0);
  const [alertPulse, setAlertPulse] = useState(0);

  // Initialize canvas
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    setCtx(context);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [width, height]);

  // Animation loop
  useEffect(() => {
    if (!ctx || !isRunning) return;

    const animate = () => {
      render();
      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [ctx, isRunning, visionData, cameraFeeds]);

  // Process voice alerts when vision data changes
  useEffect(() => {
    if (visionData && isRunning) {
      voiceAlertSystem.processVisionData(visionData);
    }
  }, [visionData, isRunning]);

  // Process voice alerts when vision data changes
  useEffect(() => {
    if (visionData && isRunning) {
      voiceAlertSystem.processVisionData(visionData);
    }
  }, [visionData, isRunning]);

  // Update rotations based on bike data
  useEffect(() => {
    if (visionData?.bike?.heading !== undefined) {
      setBikeRotation(visionData.bike.heading);
    }

    // Auto-rotate camera when stopped
    if (visionData?.speed === null || visionData?.speed < 5) {
      const rotateInterval = setInterval(() => {
        setCameraRotation(prev => (prev + 1) % 360);
      }, 50);
      return () => clearInterval(rotateInterval);
    } else {
      setCameraRotation(0); // Lock behind front when moving
    }
  }, [visionData]);

  // Pulse animation for alerts
  useEffect(() => {
    if (visionData?.global_hazard?.level >= 2) {
      const pulseInterval = setInterval(() => {
        setAlertPulse(prev => (prev + 0.1) % (Math.PI * 2));
      }, 50);
      return () => clearInterval(pulseInterval);
    }
  }, [visionData?.global_hazard?.level]);

  const render = useCallback(() => {
    if (!ctx) return;

    // Clear canvas
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    // Draw distance rings
    drawDistanceRings(ctx, centerX, centerY, radius);

    // Draw camera panels
    drawCameraPanels(ctx, centerX, centerY, radius);

    // Draw motorcycle at center
    drawMotorcycle(ctx, centerX, centerY);

    // Draw object overlays
    drawObjectOverlays(ctx, centerX, centerY, radius);

    // Draw global hazard alerts
    drawGlobalHazard(ctx);

    // Draw UI elements
    drawUI(ctx);

  }, [ctx, width, height, visionData, cameraFeeds, bikeRotation, cameraRotation, alertPulse]);

  const drawDistanceRings = (ctx, centerX, centerY, baseRadius) => {
    const rings = [
      { radius: baseRadius * 0.3, label: '3m', color: 'rgba(0, 255, 136, 0.3)' },
      { radius: baseRadius * 0.6, label: '10m', color: 'rgba(255, 204, 0, 0.3)' },
      { radius: baseRadius * 0.9, label: '30m', color: 'rgba(255, 136, 0, 0.3)' }
    ];

    rings.forEach(ring => {
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(centerX, centerY, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw distance labels
      ctx.fillStyle = ring.color;
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(ring.label, centerX, centerY - ring.radius - 10);
    });
  };

  const drawCameraPanels = (ctx, centerX, centerY, radius) => {
    const panels = [
      { name: 'front', angle: -Math.PI / 2, x: centerX, y: centerY - radius },
      { name: 'right', angle: 0, x: centerX + radius, y: centerY },
      { name: 'rear', angle: Math.PI / 2, x: centerX, y: centerY + radius },
      { name: 'left', angle: Math.PI, x: centerX - radius, y: centerY }
    ];

    panels.forEach(panel => {
      const panelWidth = 120;
      const panelHeight = 80;
      const x = panel.x - panelWidth / 2;
      const y = panel.y - panelHeight / 2;

      // Panel background
      ctx.fillStyle = 'rgba(20, 30, 50, 0.8)';
      ctx.fillRect(x, y, panelWidth, panelHeight);

      // Panel border
      const hazardLevel = visionData?.cameras?.[panel.name]?.hazard_level || 0;
      ctx.strokeStyle = HAZARD_COLORS[hazardLevel];
      ctx.lineWidth = hazardLevel >= 2 ? 3 : 1;
      ctx.strokeRect(x, y, panelWidth, panelHeight);

      // Camera feed (mock - replace with actual video texture)
      if (cameraFeeds[panel.name]) {
        // In a real implementation, you would draw the video frame here
        ctx.fillStyle = 'rgba(50, 50, 50, 0.5)';
        ctx.fillRect(x + 5, y + 5, panelWidth - 10, panelHeight - 10);
      } else if (fallbackMode && panel.name !== 'front') {
        // Estimated view indicator
        ctx.fillStyle = 'rgba(100, 100, 100, 0.3)';
        ctx.fillRect(x + 5, y + 5, panelWidth - 10, panelHeight - 10);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(x + 5, y + 5, panelWidth - 10, panelHeight - 10);
        ctx.setLineDash([]);
        
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('ESTIMATED', panel.x, panel.y);
      }

      // Panel label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(panel.name.toUpperCase(), panel.x, y - 10);

      // Hazard level indicator
      if (hazardLevel > 0) {
        const pulseScale = hazardLevel >= 3 ? 1 + Math.sin(alertPulse) * 0.2 : 1;
        ctx.save();
        ctx.translate(panel.x, panel.y);
        ctx.scale(pulseScale, pulseScale);
        
        ctx.fillStyle = HAZARD_COLORS[hazardLevel];
        ctx.beginPath();
        ctx.arc(panelWidth / 2 - 10, -panelHeight / 2 + 10, 6, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = '#000';
        ctx.font = 'bold 10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(hazardLevel.toString(), panelWidth / 2 - 10, -panelHeight / 2 + 15);
        
        ctx.restore();
      }
    });
  };

  const drawMotorcycle = (ctx, centerX, centerY) => {
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((bikeRotation * Math.PI) / 180);

    // Motorcycle body (simplified top-down view)
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(-15, -25, 30, 50);

    // Handlebars
    ctx.fillStyle = '#374151';
    ctx.fillRect(-20, -25, 40, 5);

    // Wheels
    ctx.fillStyle = '#1f2937';
    ctx.beginPath();
    ctx.arc(-8, -20, 6, 0, Math.PI * 2);
    ctx.arc(8, -20, 6, 0, Math.PI * 2);
    ctx.arc(0, 20, 8, 0, Math.PI * 2);
    ctx.fill();

    // Direction indicator (front)
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(0, -30);
    ctx.lineTo(-5, -35);
    ctx.lineTo(5, -35);
    ctx.closePath();
    ctx.fill();

    // Glow effect
    ctx.shadowColor = '#2563eb';
    ctx.shadowBlur = 20;
    ctx.fillStyle = 'rgba(37, 99, 235, 0.3)';
    ctx.beginPath();
    ctx.arc(0, 0, 40, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // Speed badge
    if (visionData?.speed !== null) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(centerX - 30, centerY - 60, 60, 20);
      
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${visionData.speed || 0} km/h`, centerX, centerY - 45);
    }
  };

  const drawObjectOverlays = (ctx, centerX, centerY, radius) => {
    if (!visionData?.cameras) return;

    Object.entries(visionData.cameras).forEach(([cameraName, cameraData]) => {
      if (!cameraData.objects) return;

      // Get panel position
      const panelAngles = {
        front: -Math.PI / 2,
        right: 0,
        rear: Math.PI / 2,
        left: Math.PI
      };

      const angle = panelAngles[cameraName];
      if (angle === undefined) return;

      const panelX = centerX + Math.cos(angle) * radius;
      const panelY = centerY + Math.sin(angle) * radius;

      cameraData.objects.forEach((obj, index) => {
        // Calculate object position on distance ring
        const distanceMultiplier = {
          near: 0.3,
          mid: 0.6,
          far: 0.9
        };

        const objRadius = radius * (distanceMultiplier[obj.distance] || 0.6);
        const objAngle = angle + (index - cameraData.objects.length / 2) * 0.2;
        const objX = centerX + Math.cos(objAngle) * objRadius;
        const objY = centerY + Math.sin(objAngle) * objRadius;

        // Draw object indicator
        const hazardLevel = cameraData.hazard_level || 0;
        ctx.fillStyle = HAZARD_COLORS[hazardLevel];
        
        // Pulsing effect for approaching objects
        const pulseScale = obj.motion === 'approaching' ? 1 + Math.sin(Date.now() * 0.01) * 0.3 : 1;
        
        ctx.save();
        ctx.translate(objX, objY);
        ctx.scale(pulseScale, pulseScale);
        
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        
        // Object label
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(obj.label, 0, 25);
        ctx.fillText(`${obj.distance}`, 0, 35);
        
        // Velocity trail for fast objects
        if (obj.motion === 'fast' || obj.motion === 'approaching') {
          ctx.strokeStyle = HAZARD_COLORS[hazardLevel];
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-Math.cos(objAngle) * 15, -Math.sin(objAngle) * 15);
          ctx.stroke();
        }
        
        ctx.restore();
      });
    });
  };

  const drawGlobalHazard = (ctx) => {
    const globalHazard = visionData?.global_hazard;
    if (!globalHazard || globalHazard.level < 2) return;

    const alertColor = ALERT_COLORS[globalHazard.alert_color] || '#ff0000';
    
    // Full screen border pulse for level 3
    if (globalHazard.level >= 3) {
      const pulseAlpha = 0.3 + Math.sin(alertPulse) * 0.2;
      ctx.strokeStyle = `${alertColor}${Math.floor(pulseAlpha * 255).toString(16).padStart(2, '0')}`;
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, width - 8, height - 8);
    }

    // Direction arrow
    if (globalHazard.direction !== 'none') {
      const directionAngles = {
        front: -Math.PI / 2,
        right: 0,
        rear: Math.PI / 2,
        left: Math.PI
      };

      const angle = directionAngles[globalHazard.direction];
      if (angle !== undefined) {
        const centerX = width / 2;
        const centerY = height / 2;
        const arrowDistance = Math.min(width, height) * 0.15;
        const arrowX = centerX + Math.cos(angle) * arrowDistance;
        const arrowY = centerY + Math.sin(angle) * arrowDistance;

        ctx.save();
        ctx.translate(arrowX, arrowY);
        ctx.rotate(angle + Math.PI);
        
        ctx.fillStyle = alertColor;
        ctx.beginPath();
        ctx.moveTo(0, -15);
        ctx.lineTo(-8, 5);
        ctx.lineTo(8, 5);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
      }
    }
  };

  const drawUI = (ctx) => {
    // System status
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(10, 10, 200, 80);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('360° VISION SYSTEM', 20, 30);
    
    ctx.font = '12px Arial';
    ctx.fillText(`Mode: ${fallbackMode ? 'FALLBACK' : '4-CAMERA'}`, 20, 50);
    ctx.fillText(`Road: ${visionData?.road_type || 'Unknown'}`, 20, 65);
    ctx.fillText(`Weather: ${visionData?.weather || 'Unknown'}`, 20, 80);

    // Global hazard status
    const globalHazard = visionData?.global_hazard;
    if (globalHazard) {
      const statusWidth = 250;
      const statusHeight = 60;
      const statusX = width - statusWidth - 10;
      const statusY = 10;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(statusX, statusY, statusWidth, statusHeight);

      ctx.fillStyle = ALERT_COLORS[globalHazard.alert_color] || '#00ff88';
      ctx.font = 'bold 16px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(`HAZARD LEVEL: ${globalHazard.level}`, statusX + 10, statusY + 25);

      ctx.fillStyle = '#ffffff';
      ctx.font = '12px Arial';
      ctx.fillText(globalHazard.note, statusX + 10, statusY + 45);
    }

    // Timestamp
    if (visionData?.timestamp) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '10px Arial';
      ctx.textAlign = 'right';
      ctx.fillText(`T: ${visionData.timestamp}ms`, width - 10, height - 10);
    }
  };

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          360° Vision System requires web platform
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { width, height }]}>
      <canvas
        ref={canvasRef}
        style={styles.canvas}
        width={width}
        height={height}
      />
      
      {/* Voice Alert Overlay */}
      {visionData?.global_hazard?.level >= 2 && (
        <View style={styles.voiceAlertOverlay}>
          <Text style={[
            styles.voiceAlertText,
            { color: ALERT_COLORS[visionData.global_hazard.alert_color] }
          ]}>
            🔊 {visionData.global_hazard.note}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000000',
    position: 'relative',
  },
  canvas: {
    display: 'block',
  },
  errorText: {
    color: '#ffffff',
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
  },
  voiceAlertOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 2,
    borderColor: '#ff0000',
  },
  voiceAlertText: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default Motorcycle360Vision;