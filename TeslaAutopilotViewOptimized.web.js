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

  // ULTRA FAST Tesla car drawing
  const drawTeslaCarFast = useCallback((ctx, canvasWidth, canvasHeight) => {
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2 + 20;
    const isMoving = bikeAnimation.isMoving || speed > 0;
    
    ctx.save();
    ctx.translate(centerX, centerY);
    
    // Simplified car body - single gradient
    ctx.fillStyle = getGradient(ctx, 'car', isMoving);
    ctx.beginPath();
    ctx.roundRect(-22, -15, 44, 30, 8);
    ctx.fill();
    
    // Simple wheels - no rotation animation for performance
    ctx.fillStyle = '#333333';
    ctx.fillRect(-20, -18, 8, 4);
    ctx.fillRect(12, -18, 8, 4);
    ctx.fillRect(-20, 14, 8, 4);
    ctx.fillRect(12, 14, 8, 4);
    
    ctx.restore();
  }, [bikeAnimation.isMoving, speed, getGradient]);

  // ULTRA FAST road drawing - minimal operations
  const drawRoadFast = useCallback((ctx, canvasWidth, canvasHeight) => {
    const roadWidth = 200;
    const centerX = canvasWidth / 2;
    
    // Road surface
    ctx.fillStyle = COLORS.road;
    ctx.fillRect(centerX - roadWidth/2, 0, roadWidth, canvasHeight);
    
    // Only draw center line for performance
    ctx.strokeStyle = COLORS.laneCenter;
    ctx.lineWidth = 2;
    ctx.setLineDash([15, 15]);
    
    const actualSpeed = bikeAnimation.isMoving ? speed : 0;
    if (actualSpeed > 0) {
      roadOffsetRef.current += actualSpeed * 0.08;
      if (roadOffsetRef.current > 30) roadOffsetRef.current = 0;
    }
    
    ctx.beginPath();
    for (let y = -roadOffsetRef.current; y < canvasHeight + 30; y += 30) {
      ctx.moveTo(centerX, y);
      ctx.lineTo(centerX, y + 15);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }, [COLORS, bikeAnimation.isMoving, speed]);

  // ULTRA FAST UI drawing - minimal text operations
  const drawTopUIFast = useCallback((ctx, canvasWidth) => {
    // Only essential UI elements
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 72px Arial'; // Faster font
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(speed).toString(), canvasWidth / 2, 80);
    
    // Simplified status
    ctx.font = '12px Arial';
    ctx.fillStyle = COLORS.textGreen;
    ctx.fillText('READY', canvasWidth / 2, 110);
  }, [COLORS, speed]);

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
    drawTeslaCarFast(ctx, canvasWidth, canvasHeight);
    
    // PRIORITY: Draw only closest/most important detections first
    const sortedDetections = detections
      .filter(d => d.bbox_xyxy && d.bbox_xyxy.length >= 4)
      .sort((a, b) => (a.distance_m || 10) - (b.distance_m || 10))
      .slice(0, 8); // Limit to 8 objects for performance
    
    sortedDetections.forEach((detection) => {
      const centerX_norm = (detection.bbox_xyxy[0] + detection.bbox_xyxy[2]) / 2 / canvasWidth;
      const centerY_norm = (detection.bbox_xyxy[1] + detection.bbox_xyxy[3]) / 2 / canvasHeight;
      
      const worldX = canvasWidth / 2 + (centerX_norm - 0.5) * 300;
      const worldY = canvasHeight / 2 + 20 - (1 - centerY_norm) * 200;
      
      const size = getObjectSize(detection.label);
      const color = getObjectColor(detection);
      
      draw3DObjectFast(ctx, worldX, worldY, size, color, detection);
    });
    
    drawTopUIFast(ctx, canvasWidth);
  }, [detections, COLORS, drawRoadFast, drawTeslaCarFast, drawTopUIFast, getObjectSize, getObjectColor, draw3DObjectFast]);

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