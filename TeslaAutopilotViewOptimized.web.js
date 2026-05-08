/**
 * Tesla Autopilot-Style 3D Bird's-Eye View for Motorcycle
 * ULTRA LOW LATENCY VERSION - Optimized for instant response
 */

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, Dimensions } from 'react-native';
import PerformanceMonitor from './components/PerformanceMonitor';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const TeslaAutopilotViewOptimized = ({ 
  speed = 0, 
  turnDirection = 'straight', 
  roadType = 'urban',
  detections = [],
  isActive = false,
  backendUrl = '',
  processingTime = 0
}) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const roadOffsetRef = useRef(0);
  const lastRenderTime = useRef(0);
  const frameSkipCounter = useRef(0);
  
  // Performance optimization: Pre-computed canvas context
  const ctxRef = useRef(null);
  
  // Performance optimization: Object pools to avoid garbage collection
  const objectPool = useRef([]);
  const gradientCache = useRef(new Map());
  
  // Motion sensor states with debouncing
  const [deviceMotion, setDeviceMotion] = useState({
    acceleration: { x: 0, y: 0, z: 0 },
    rotationRate: { alpha: 0, beta: 0, gamma: 0 },
    isMoving: false
  });
  const [bikeAnimation, setBikeAnimation] = useState({
    lean: 0,
    bounce: 0,
    isMoving: false
  });

  // Tesla-style colors - CACHED for performance
  const COLORS = useMemo(() => ({
    background: '#f5f5f5',
    road: '#e8e8e8',
    laneLines: '#d0d0d0',
    laneCenter: '#ffffff',
    car: '#4a90e2',
    carShadow: '#00000020',
    objectNormal: '#a8a8a8',
    objectHazard: '#ff8c42',
    objectDanger: '#ff4757',
    text: '#2c2c2c',
    textSecondary: '#666666',
    textGreen: '#4CAF50',
    speedLimit: '#ff4444',
  }), []);

  // Performance: Cached object sizes to avoid repeated calculations
  const objectSizes = useMemo(() => ({
    person: { width: 8, height: 16, boxHeight: 20, shape: 'person' },
    car: { width: 35, height: 60, boxHeight: 12, shape: 'car' },
    truck: { width: 45, height: 80, boxHeight: 18, shape: 'truck' },
    bus: { width: 50, height: 100, boxHeight: 22, shape: 'bus' },
    motorcycle: { width: 15, height: 40, boxHeight: 8, shape: 'motorcycle' },
    bicycle: { width: 12, height: 35, boxHeight: 6, shape: 'bicycle' },
    traffic_light: { width: 6, height: 15, boxHeight: 25, shape: 'pole' },
    stop_sign: { width: 10, height: 10, boxHeight: 20, shape: 'sign' },
  }), []);

  // Performance: Throttled motion sensor updates (60fps max)
  const throttledMotionUpdate = useCallback((event) => {
    const now = Date.now();
    if (now - lastRenderTime.current < 16) return; // 60fps throttle
    
    const acc = event.acceleration || { x: 0, y: 0, z: 0 };
    const rot = event.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
    
    const totalAcceleration = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
    const isMoving = totalAcceleration > 0.5;
    
    setDeviceMotion({ acceleration: acc, rotationRate: rot, isMoving });
    setBikeAnimation(prev => ({
      lean: Math.max(-15, Math.min(15, rot.gamma * 0.5)),
      bounce: isMoving ? Math.sin(now * 0.01) * 2 : 0,
      isMoving
    }));
    
    lastRenderTime.current = now;
  }, []);

  // Initialize motion sensors with performance optimization
  useEffect(() => {
    if (!isActive || typeof window === 'undefined') return;

    const setupMotionListeners = () => {
      // Use passive listeners for better performance
      window.addEventListener('devicemotion', throttledMotionUpdate, { passive: true });
    };

    // Simplified permission request for faster startup
    if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
      DeviceMotionEvent.requestPermission().then(permission => {
        if (permission === 'granted') setupMotionListeners();
      }).catch(() => setupMotionListeners());
    } else {
      setupMotionListeners();
    }

    return () => {
      window.removeEventListener('devicemotion', throttledMotionUpdate);
    };
  }, [isActive, throttledMotionUpdate]);

  // Performance: Memoized object size getter
  const getObjectSize = useCallback((label) => {
    return objectSizes[label] || objectSizes.car;
  }, [objectSizes]);

  // Performance: Cached color calculation
  const getObjectColor = useCallback((detection) => {
    const risk = detection.risk_percent || 0;
    if (risk > 80) return COLORS.objectDanger;
    if (risk > 50) return COLORS.objectHazard;
    return COLORS.objectNormal;
  }, [COLORS]);

  // Performance: Pre-computed gradient cache
  const getGradient = useCallback((ctx, key, isMoving) => {
    const cacheKey = `${key}_${isMoving}`;
    if (gradientCache.current.has(cacheKey)) {
      return gradientCache.current.get(cacheKey);
    }
    
    const gradient = ctx.createLinearGradient(0, -20, 0, 20);
    if (isMoving) {
      gradient.addColorStop(0, '#6bb3ff');
      gradient.addColorStop(0.5, '#4a90e2');
      gradient.addColorStop(1, '#2d5aa0');
    } else {
      gradient.addColorStop(0, '#5ba3f5');
      gradient.addColorStop(0.5, COLORS.car);
      gradient.addColorStop(1, '#3a7bc8');
    }
    
    gradientCache.current.set(cacheKey, gradient);
    return gradient;
  }, [COLORS]);

  // ULTRA FAST 3D object drawing with minimal operations
  const draw3DObjectFast = useCallback((ctx, x, y, size, color, detection) => {
    const { width, height, boxHeight, shape } = size;
    const isoX = x;
    const isoY = y;
    const isoTop = isoY - boxHeight;
    
    // Batch drawing operations for performance
    ctx.fillStyle = color;
    
    if (shape === 'person') {
      // Simplified person shape - 2 operations only
      ctx.fillRect(isoX - width/2, isoTop + 8, width, height - 8);
      ctx.beginPath();
      ctx.arc(isoX, isoTop + 4, width/2, 0, Math.PI * 2);
      ctx.fill();
    } else if (shape === 'car') {
      // Simplified car - rounded rect only
      ctx.beginPath();
      ctx.roundRect(isoX - width/2, isoTop, width, height, 4);
      ctx.fill();
    } else {
      // Default fast box
      ctx.fillRect(isoX - width/2, isoTop, width, height);
    }
    
    // Skip labels for performance - only show distance for close objects
    const distance = detection.distance_m || 10;
    if (distance < 10) {
      ctx.fillStyle = COLORS.text;
      ctx.font = '10px Arial'; // Faster font
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(distance)}m`, isoX, isoY + height + 12);
    }
  }, [COLORS]);

  // ULTRA FAST Tesla car drawing - STATIONARY at center
  const drawTeslaCarFast = useCallback((ctx, canvasWidth, canvasHeight) => {
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2 + 20;
    
    // Car stays FIXED at center - no movement animations
    ctx.save();
    ctx.translate(centerX, centerY);
    
    // Static car body - Tesla blue
    ctx.fillStyle = getGradient(ctx, 'car', false); // Always static gradient
    ctx.beginPath();
    ctx.roundRect(-22, -15, 44, 30, 8);
    ctx.fill();
    
    // Static wheels - no rotation
    ctx.fillStyle = '#333333';
    ctx.fillRect(-20, -18, 8, 4);
    ctx.fillRect(12, -18, 8, 4);
    ctx.fillRect(-20, 14, 8, 4);
    ctx.fillRect(12, 14, 8, 4);
    
    ctx.restore();
  }, [getGradient]);

  // ULTRA FAST road drawing - MOVING road creates motion feeling
  const drawRoadFast = useCallback((ctx, canvasWidth, canvasHeight) => {
    const roadWidth = 200;
    const centerX = canvasWidth / 2;
    
    // Road surface
    ctx.fillStyle = COLORS.road;
    ctx.fillRect(centerX - roadWidth/2, 0, roadWidth, canvasHeight);
    
    // ROAD MOVES based on speed and motion - car stays still
    const actualSpeed = bikeAnimation.isMoving ? speed : 0;
    const roadSpeed = Math.max(actualSpeed * 0.15, speed * 0.1); // Road moves faster for better effect
    
    if (roadSpeed > 0) {
      roadOffsetRef.current += roadSpeed;
      if (roadOffsetRef.current > 30) roadOffsetRef.current = 0;
    }
    
    // Center lane line (white) - MOVES towards car
    ctx.strokeStyle = COLORS.laneCenter;
    ctx.lineWidth = 2;
    ctx.setLineDash([15, 15]);
    
    ctx.beginPath();
    // Road lines move from top to bottom (towards the car)
    for (let y = -roadOffsetRef.current; y < canvasHeight + 30; y += 30) {
      ctx.moveTo(centerX, y);
      ctx.lineTo(centerX, y + 15);
    }
    ctx.stroke();
    
    // Side lane lines - also moving towards car
    ctx.strokeStyle = COLORS.laneLines;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let y = -roadOffsetRef.current; y < canvasHeight + 30; y += 30) {
      ctx.moveTo(centerX - 60, y);
      ctx.lineTo(centerX - 60, y + 15);
      ctx.moveTo(centerX + 60, y);
      ctx.lineTo(centerX + 60, y + 15);
    }
    ctx.stroke();
    
    ctx.setLineDash([]);
  }, [COLORS, bikeAnimation.isMoving, speed]);

  // Add motion blur and perspective effects for enhanced movement feeling
  const drawMotionEffects = useCallback((ctx, canvasWidth, canvasHeight) => {
    const actualSpeed = bikeAnimation.isMoving ? speed : 0;
    
    if (actualSpeed > 5) { // Only show effects when moving at reasonable speed
      // Motion blur lines on sides (speed lines)
      ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(0.3, actualSpeed / 100)})`;
      ctx.lineWidth = 1;
      
      const numLines = Math.min(8, Math.floor(actualSpeed / 5));
      for (let i = 0; i < numLines; i++) {
        const x = 50 + i * 20;
        const length = 30 + (actualSpeed * 0.5);
        const offset = (roadOffsetRef.current * 2) % 40;
        
        // Left side speed lines
        ctx.beginPath();
        ctx.moveTo(x, offset + i * 40);
        ctx.lineTo(x, offset + i * 40 + length);
        ctx.stroke();
        
        // Right side speed lines
        ctx.beginPath();
        ctx.moveTo(canvasWidth - x, offset + i * 40);
        ctx.lineTo(canvasWidth - x, offset + i * 40 + length);
        ctx.stroke();
      }
      
      // Perspective grid effect (subtle)
      if (actualSpeed > 15) {
        ctx.strokeStyle = `rgba(200, 200, 200, ${Math.min(0.1, actualSpeed / 200)})`;
        ctx.lineWidth = 0.5;
        
        // Perspective lines converging to center
        const centerX = canvasWidth / 2;
        const vanishingPoint = canvasHeight * 0.3;
        
        for (let i = -3; i <= 3; i++) {
          if (i === 0) continue;
          const startX = centerX + i * 80;
          
          ctx.beginPath();
          ctx.moveTo(startX, canvasHeight);
          ctx.lineTo(centerX, vanishingPoint);
          ctx.stroke();
        }
      }
    }
  }, [bikeAnimation.isMoving, speed]);
  const drawTopUIFast = useCallback((ctx, canvasWidth) => {
    // Large speed number (shows movement)
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 72px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(speed).toString(), canvasWidth / 2, 80);
    
    // Status row with movement indication
    ctx.font = '12px Arial';
    ctx.fillStyle = COLORS.textGreen;
    
    // Show READY and movement status
    const isMoving = bikeAnimation.isMoving || speed > 0;
    const statusText = isMoving ? 'MOVING' : 'READY';
    ctx.fillText(statusText, canvasWidth / 2, 110);
    
    // Speed indicator
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText('km/h', canvasWidth / 2 + 80, 110);
    
    // Movement indicator (visual feedback)
    if (isMoving) {
      ctx.fillStyle = COLORS.textGreen;
      ctx.font = '10px Arial';
      ctx.fillText('▲ FORWARD', canvasWidth / 2, 130);
    }
  }, [COLORS, speed, bikeAnimation.isMoving]);

  // MAIN ULTRA-FAST RENDER FUNCTION
  const renderFast = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Use cached context for performance
    if (!ctxRef.current) {
      ctxRef.current = canvas.getContext('2d', { 
        alpha: false, // Disable alpha for performance
        desynchronized: true // Allow async rendering
      });
    }
    const ctx = ctxRef.current;
    
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    // Frame skipping for performance - render every other frame if needed
    frameSkipCounter.current++;
    if (frameSkipCounter.current % 2 === 0 && detections.length > 5) {
      return; // Skip frame if too many objects
    }
    
    // Clear with single operation
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw components in order of importance
    drawRoadFast(ctx, canvasWidth, canvasHeight);
    
    // Add motion effects for movement feeling
    drawMotionEffects(ctx, canvasWidth, canvasHeight);
    
    // Draw Tesla car (STATIONARY at center)
    drawTeslaCarFast(ctx, canvasWidth, canvasHeight);
    
    // PRIORITY: Draw only closest/most important detections first
    const sortedDetections = detections
      .filter(d => d.bbox_xyxy && d.bbox_xyxy.length >= 4)
      .sort((a, b) => (a.distance_m || 10) - (b.distance_m || 10))
      .slice(0, 8); // Limit to 8 objects for performance
    
    sortedDetections.forEach((detection) => {
      const centerX_norm = (detection.bbox_xyxy[0] + detection.bbox_xyxy[2]) / 2 / canvasWidth;
      const centerY_norm = (detection.bbox_xyxy[1] + detection.bbox_xyxy[3]) / 2 / canvasHeight;
      
      // Map to Tesla view coordinates - objects move towards car
      let worldX = canvasWidth / 2 + (centerX_norm - 0.5) * 300;
      let worldY = canvasHeight / 2 + 20 - (1 - centerY_norm) * 200;
      
      // OBJECTS MOVE towards car based on speed (road movement effect)
      const actualSpeed = bikeAnimation.isMoving ? speed : 0;
      const objectMovement = actualSpeed * 0.1; // Objects move towards car
      
      if (actualSpeed > 0) {
        // Objects in front move towards car (down the screen)
        if (worldY < canvasHeight / 2) {
          worldY += objectMovement * 2; // Objects ahead move faster towards car
        }
        // Objects behind move away from car (up the screen)  
        else {
          worldY -= objectMovement;
        }
        
        // Side objects also move slightly towards center (perspective effect)
        const centerDistance = Math.abs(worldX - canvasWidth / 2);
        if (centerDistance > 50) {
          const moveTowardCenter = (worldX > canvasWidth / 2) ? -objectMovement * 0.3 : objectMovement * 0.3;
          worldX += moveTowardCenter;
        }
      }
      
      const size = getObjectSize(detection.label);
      const color = getObjectColor(detection);
      
      draw3DObjectFast(ctx, worldX, worldY, size, color, detection);
    });
    
    drawTopUIFast(ctx, canvasWidth);
  }, [detections, COLORS, drawRoadFast, drawMotionEffects, drawTeslaCarFast, drawTopUIFast, getObjectSize, getObjectColor, draw3DObjectFast]);

  // ULTRA-HIGH PERFORMANCE ANIMATION LOOP
  useEffect(() => {
    if (!isActive) return;
    
    let lastFrameTime = 0;
    const targetFPS = 60;
    const frameInterval = 1000 / targetFPS;
    
    const animate = (currentTime) => {
      // Throttle to target FPS for consistent performance
      if (currentTime - lastFrameTime >= frameInterval) {
        renderFast();
        lastFrameTime = currentTime;
      }
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isActive, renderFast]);

  // Performance: Minimize re-renders by memoizing detection changes
  const detectionHash = useMemo(() => {
    return detections.map(d => `${d.label}_${d.distance_m}_${d.bbox_xyxy?.[0]}`).join('|');
  }, [detections]);

  if (!isActive) return null;

  return (
    <View style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: COLORS.background,
    }}>
      <canvas
        ref={canvasRef}
        width={screenWidth}
        height={screenHeight}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          imageRendering: 'pixelated', // Faster rendering
        }}
      />
      
      {/* Performance Monitor */}
      <PerformanceMonitor
        detections={detections}
        processingTime={processingTime}
        isActive={isActive}
        backendUrl={backendUrl}
      />
    </View>
  );
};

export default TeslaAutopilotViewOptimized;