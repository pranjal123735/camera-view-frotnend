/**
 * Tesla Autopilot-Style 3D Bird's-Eye View for Motorcycle
 * Clean, premium 3D visualization exactly like Tesla's interface
 */

import React, { useRef, useEffect, useState } from 'react';
import { View, Text, Dimensions } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const TeslaAutopilotView = ({ 
  speed = 0, 
  turnDirection = 'straight', 
  roadType = 'urban',
  detections = [],
  isActive = false 
}) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const roadOffsetRef = useRef(0);
  const [inferredObjects, setInferredObjects] = useState([]);
  
  // Motion sensor states
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

  // Tesla-style colors - LIGHT THEME like the image
  const COLORS = {
    background: '#f5f5f5',        // Light grey background like Tesla
    road: '#e8e8e8',             // Light grey road
    laneLines: '#d0d0d0',        // Subtle grey lane markings
    laneCenter: '#ffffff',       // White center line
    car: '#4a90e2',              // Tesla blue for car
    carShadow: '#00000020',      // Subtle shadow under car
    objectNormal: '#a8a8a8',     // Light grey boxes for objects
    objectHazard: '#ff8c42',     // Orange for hazard
    objectDanger: '#ff4757',     // Red for danger
    text: '#2c2c2c',             // Dark text on light background
    textSecondary: '#666666',    // Grey secondary text
    textGreen: '#4CAF50',        // Green for READY status
    speedLimit: '#ff4444',       // Red circle for speed limit
  };

  // Initialize motion sensors
  useEffect(() => {
    if (!isActive || typeof window === 'undefined') return;

    let motionHandler = null;
    let orientationHandler = null;

    // Request permission for iOS devices
    const requestMotionPermission = async () => {
      if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
        try {
          const permission = await DeviceMotionEvent.requestPermission();
          if (permission === 'granted') {
            setupMotionListeners();
          }
        } catch (error) {
          console.log('Motion permission denied');
          setupMotionListeners(); // Try anyway for other devices
        }
      } else {
        setupMotionListeners();
      }
    };

    const setupMotionListeners = () => {
      // Device motion for acceleration and movement detection
      motionHandler = (event) => {
        const acc = event.acceleration || { x: 0, y: 0, z: 0 };
        const rot = event.rotationRate || { alpha: 0, beta: 0, gamma: 0 };
        
        // Calculate if device is moving based on acceleration
        const totalAcceleration = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
        const isMoving = totalAcceleration > 0.5; // Threshold for movement detection
        
        setDeviceMotion({
          acceleration: acc,
          rotationRate: rot,
          isMoving
        });

        // Update bike animation based on motion
        setBikeAnimation(prev => ({
          lean: Math.max(-15, Math.min(15, rot.gamma * 0.5)), // Lean based on device tilt
          bounce: isMoving ? Math.sin(Date.now() * 0.01) * 2 : 0, // Bounce when moving
          isMoving
        }));
      };

      // Device orientation for turn detection
      orientationHandler = (event) => {
        // This can be used for additional turn detection if needed
      };

      window.addEventListener('devicemotion', motionHandler);
      window.addEventListener('deviceorientation', orientationHandler);
    };

    requestMotionPermission();

    return () => {
      if (motionHandler) window.removeEventListener('devicemotion', motionHandler);
      if (orientationHandler) window.removeEventListener('deviceorientation', orientationHandler);
    };
  }, [isActive]);

  // Convert camera bbox to 3D world position
  const bboxToWorldPosition = (bbox, canvasWidth, canvasHeight) => {
    const centerX = bbox.bbox_center_x || (bbox.bbox_xyxy[0] + bbox.bbox_xyxy[2]) / 2 / canvasWidth;
    const centerY = bbox.bbox_center_y || (bbox.bbox_xyxy[1] + bbox.bbox_xyxy[3]) / 2 / canvasHeight;
    
    // Map camera coordinates to 3D world
    const worldX = (centerX - 0.5) * 400; // -200 to +200 pixels from center
    const worldY = (1 - centerY) * 300 + 50; // Distance from bike (50-350 pixels)
    
    return { x: worldX, y: worldY };
  };
  const bboxToWorldPosition = (bbox, canvasWidth, canvasHeight) => {
    const centerX = bbox.bbox_center_x || (bbox.bbox_xyxy[0] + bbox.bbox_xyxy[2]) / 2 / canvasWidth;
    const centerY = bbox.bbox_center_y || (bbox.bbox_xyxy[1] + bbox.bbox_xyxy[3]) / 2 / canvasHeight;
    
    // Map camera coordinates to 3D world
    const worldX = (centerX - 0.5) * 400; // -200 to +200 pixels from center
    const worldY = (1 - centerY) * 300 + 50; // Distance from bike (50-350 pixels)
    
    return { x: worldX, y: worldY };
  };

  // Get object size and shape based on actual detected type
  const getObjectSize = (label) => {
    const sizes = {
      person: { width: 8, height: 16, boxHeight: 20, shape: 'person' },
      car: { width: 35, height: 60, boxHeight: 12, shape: 'car' },
      truck: { width: 45, height: 80, boxHeight: 18, shape: 'truck' },
      bus: { width: 50, height: 100, boxHeight: 22, shape: 'bus' },
      motorcycle: { width: 15, height: 40, boxHeight: 8, shape: 'motorcycle' },
      bicycle: { width: 12, height: 35, boxHeight: 6, shape: 'bicycle' },
      traffic_light: { width: 6, height: 15, boxHeight: 25, shape: 'pole' },
      stop_sign: { width: 10, height: 10, boxHeight: 20, shape: 'sign' },
    };
    return sizes[label] || sizes.car;
  };

  // Get object color based on risk
  const getObjectColor = (detection) => {
    const risk = detection.risk_percent || 0;
    if (risk > 80) return COLORS.objectDanger;
    if (risk > 50) return COLORS.objectHazard;
    return COLORS.objectNormal;
  };

  // Generate inferred objects for side/rear based on context
  const generateInferredObjects = () => {
    const inferred = [];
    
    if (roadType === 'urban') {
      // Add 1-2 objects in side lanes
      inferred.push({
        id: 'inferred_left',
        x: -120,
        y: 200,
        size: getObjectSize('car'),
        color: COLORS.objectNormal + '80', // More transparent
        distance: 15,
      });
    } else if (roadType === 'highway') {
      // Add objects in adjacent lanes with motion
      inferred.push({
        id: 'inferred_right',
        x: 100,
        y: 180,
        size: getObjectSize('car'),
        color: COLORS.objectNormal + '80',
        distance: 12,
      });
    }
    
    // Add rear object if traffic detected in front
    if (detections.length > 0) {
      inferred.push({
        id: 'inferred_rear',
        x: 0,
        y: -80,
        size: getObjectSize('car'),
        color: COLORS.objectNormal + '60',
        distance: 8,
      });
    }
    
    return inferred;
  };

  // Draw 3D object based on actual detected type
  const draw3DObject = (ctx, x, y, size, color, detection) => {
    const { width, height, boxHeight, shape } = size;
    const label = detection.label;
    const distance = Math.round(detection.distance_m || 10);
    
    // 3D isometric projection
    const isoX = x;
    const isoY = y;
    const isoTop = isoY - boxHeight;
    
    // Draw shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
    ctx.fillRect(isoX - width/2, isoY, width, height/4);
    
    if (shape === 'person') {
      // Draw person shape
      ctx.fillStyle = color;
      // Body
      ctx.fillRect(isoX - width/2, isoTop + 8, width, height - 8);
      // Head
      ctx.beginPath();
      ctx.arc(isoX, isoTop + 4, width/2, 0, Math.PI * 2);
      ctx.fill();
      
    } else if (shape === 'car') {
      // Draw car shape
      ctx.fillStyle = color;
      // Main body
      ctx.beginPath();
      ctx.roundRect(isoX - width/2, isoTop, width, height, 4);
      ctx.fill();
      
      // Car roof (darker)
      ctx.fillStyle = color.replace(')', ', 0.8)').replace('rgb', 'rgba');
      ctx.beginPath();
      ctx.roundRect(isoX - width/2 + 4, isoTop + 2, width - 8, height/2, 3);
      ctx.fill();
      
    } else if (shape === 'truck') {
      // Draw truck shape
      ctx.fillStyle = color;
      // Main body
      ctx.fillRect(isoX - width/2, isoTop, width, height);
      // Truck cab
      ctx.fillStyle = color.replace(')', ', 0.9)').replace('rgb', 'rgba');
      ctx.fillRect(isoX - width/2, isoTop, width, height/3);
      
    } else if (shape === 'motorcycle') {
      // Draw motorcycle shape
      ctx.fillStyle = color;
      // Slim body
      ctx.fillRect(isoX - width/2, isoTop + 4, width, height - 8);
      // Wheels
      ctx.fillStyle = '#333333';
      ctx.fillRect(isoX - width/2, isoTop, width/3, 4);
      ctx.fillRect(isoX - width/2, isoTop + height - 4, width/3, 4);
      
    } else if (shape === 'bicycle') {
      // Draw bicycle shape
      ctx.fillStyle = color;
      ctx.fillRect(isoX - width/2, isoTop + 6, width, 4);
      // Wheels
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(isoX - width/3, isoTop + height - 4, 3, 0, Math.PI * 2);
      ctx.arc(isoX + width/3, isoTop + height - 4, 3, 0, Math.PI * 2);
      ctx.stroke();
      
    } else if (shape === 'pole') {
      // Draw traffic light pole
      ctx.fillStyle = color;
      ctx.fillRect(isoX - width/2, isoTop, width, height);
      // Light
      ctx.fillStyle = '#ffff00';
      ctx.beginPath();
      ctx.arc(isoX, isoTop + 4, width/2, 0, Math.PI * 2);
      ctx.fill();
      
    } else {
      // Default box shape
      ctx.fillStyle = color;
      ctx.fillRect(isoX - width/2, isoTop, width, height);
    }
    
    // 3D depth effect (right face)
    ctx.fillStyle = color.replace(')', ', 0.7)').replace('rgb', 'rgba');
    ctx.beginPath();
    ctx.moveTo(isoX + width/2, isoTop);
    ctx.lineTo(isoX + width/2 + 6, isoTop - 6);
    ctx.lineTo(isoX + width/2 + 6, isoTop + height - 6);
    ctx.lineTo(isoX + width/2, isoTop + height);
    ctx.closePath();
    ctx.fill();
    
    // Distance label
    ctx.fillStyle = COLORS.text;
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "SF Pro Display"';
    ctx.textAlign = 'center';
    ctx.fillText(`${distance}m`, isoX, isoY + height + 15);
    
    // Object label
    ctx.fillStyle = COLORS.textSecondary;
    ctx.font = '8px -apple-system, BlinkMacSystemFont, "SF Pro Display"';
    ctx.fillText(label.toUpperCase(), isoX, isoY + height + 25);
  };

  // Draw Tesla car at center (with real motion animation)
  const drawTeslaCar = (ctx, canvasWidth, canvasHeight) => {
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2 + 20;
    
    // Use real device motion for lean and bounce
    const leanAngle = bikeAnimation.lean || (turnDirection === 'left' ? -3 : turnDirection === 'right' ? 3 : 0);
    const bounceOffset = bikeAnimation.bounce || 0;
    const isMoving = bikeAnimation.isMoving || speed > 0;
    
    ctx.save();
    ctx.translate(centerX, centerY + bounceOffset);
    ctx.rotate(leanAngle * Math.PI / 180);
    
    // Car shadow (more pronounced when moving)
    ctx.fillStyle = isMoving ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.1)';
    ctx.fillRect(-25, 15, 50, isMoving ? 10 : 8);
    
    // Main car body (Tesla blue with movement glow)
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
    ctx.fillStyle = gradient;
    
    // Car body shape (more realistic Tesla-like)
    ctx.beginPath();
    ctx.roundRect(-22, -15, 44, 30, 8);
    ctx.fill();
    
    // Car roof (darker)
    ctx.fillStyle = isMoving ? '#1e4a8c' : '#2d5aa0';
    ctx.beginPath();
    ctx.roundRect(-18, -12, 36, 15, 6);
    ctx.fill();
    
    // Windshield (brighter when moving)
    ctx.fillStyle = isMoving ? '#87ceeb60' : '#87ceeb40';
    ctx.beginPath();
    ctx.roundRect(-16, -10, 32, 8, 4);
    ctx.fill();
    
    // Wheels (spinning effect when moving)
    ctx.fillStyle = '#333333';
    if (isMoving) {
      // Add wheel rotation effect
      const wheelRotation = (Date.now() * 0.02) % (Math.PI * 2);
      ctx.save();
      ctx.translate(-16, -16);
      ctx.rotate(wheelRotation);
      ctx.fillRect(-4, -2, 8, 4);
      ctx.restore();
      
      ctx.save();
      ctx.translate(16, -16);
      ctx.rotate(wheelRotation);
      ctx.fillRect(-4, -2, 8, 4);
      ctx.restore();
      
      ctx.save();
      ctx.translate(-16, 16);
      ctx.rotate(wheelRotation);
      ctx.fillRect(-4, -2, 8, 4);
      ctx.restore();
      
      ctx.save();
      ctx.translate(16, 16);
      ctx.rotate(wheelRotation);
      ctx.fillRect(-4, -2, 8, 4);
      ctx.restore();
    } else {
      // Static wheels
      ctx.beginPath();
      ctx.roundRect(-20, -18, 8, 4, 2);
      ctx.roundRect(12, -18, 8, 4, 2);
      ctx.roundRect(-20, 14, 8, 4, 2);
      ctx.roundRect(12, 14, 8, 4, 2);
      ctx.fill();
    }
    
    // Movement glow effect
    if (isMoving) {
      const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 40);
      glowGradient.addColorStop(0, 'rgba(74, 144, 226, 0.3)');
      glowGradient.addColorStop(1, 'transparent');
      ctx.fillStyle = glowGradient;
      ctx.fillRect(-30, -25, 60, 50);
    }
    
    ctx.restore();
  };

  // Draw road with lanes (animation based on real speed and motion)
  const drawRoad = (ctx, canvasWidth, canvasHeight) => {
    const roadWidth = 200;
    const centerX = canvasWidth / 2;
    
    // Road surface (light grey like Tesla)
    ctx.fillStyle = COLORS.road;
    ctx.fillRect(centerX - roadWidth/2, 0, roadWidth, canvasHeight);
    
    // Lane markings (subtle dashed lines)
    ctx.strokeStyle = COLORS.laneLines;
    ctx.lineWidth = 1;
    ctx.setLineDash([15, 15]);
    
    // Animate road scrolling based on REAL speed and motion
    const actualSpeed = bikeAnimation.isMoving ? speed : 0;
    roadOffsetRef.current += actualSpeed * 0.08;
    if (roadOffsetRef.current > 30) roadOffsetRef.current = 0;
    
    // Center lane line (white) - only animate when actually moving
    ctx.strokeStyle = COLORS.laneCenter;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (actualSpeed > 0) {
      for (let y = -roadOffsetRef.current; y < canvasHeight + 30; y += 30) {
        ctx.moveTo(centerX, y);
        ctx.lineTo(centerX, y + 15);
      }
    } else {
      // Static lines when not moving
      for (let y = 0; y < canvasHeight; y += 30) {
        ctx.moveTo(centerX, y);
        ctx.lineTo(centerX, y + 15);
      }
    }
    ctx.stroke();
    
    // Side lane lines (subtle) - also based on motion
    ctx.strokeStyle = COLORS.laneLines;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const offset = actualSpeed > 0 ? roadOffsetRef.current : 0;
    for (let y = -offset; y < canvasHeight + 30; y += 30) {
      ctx.moveTo(centerX - 60, y);
      ctx.lineTo(centerX - 60, y + 15);
      ctx.moveTo(centerX + 60, y);
      ctx.lineTo(centerX + 60, y + 15);
    }
    ctx.stroke();
    
    ctx.setLineDash([]);
  };

  // Draw Tesla-style top UI bar (exactly like image)
  const drawTopUI = (ctx, canvasWidth) => {
    // Large speed number (center top)
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 72px -apple-system, BlinkMacSystemFont, "SF Pro Display"';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(speed).toString(), canvasWidth / 2, 80);
    
    // Status indicators row (like Tesla image)
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "SF Pro Display"';
    ctx.textAlign = 'center';
    
    // P R N D status
    const statusY = 110;
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText('P', canvasWidth / 2 - 60, statusY);
    ctx.fillText('R', canvasWidth / 2 - 40, statusY);
    ctx.fillText('N', canvasWidth / 2 - 20, statusY);
    
    // D (Drive) - highlighted in green
    ctx.fillStyle = COLORS.textGreen;
    ctx.fillText('D', canvasWidth / 2, statusY);
    
    // READY status
    ctx.fillStyle = COLORS.textGreen;
    ctx.fillText('READY', canvasWidth / 2 + 30, statusY);
    
    // km/h indicator
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText('km/h', canvasWidth / 2 + 80, statusY);
    
    // Battery indicator (like Tesla)
    ctx.fillStyle = COLORS.textGreen;
    ctx.fillText('245 km', canvasWidth / 2 + 120, statusY);
    
    // Speed limit sign (top right)
    const speedLimitX = canvasWidth - 60;
    const speedLimitY = 50;
    
    // Red circle
    ctx.strokeStyle = COLORS.speedLimit;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(speedLimitX, speedLimitY, 25, 0, Math.PI * 2);
    ctx.stroke();
    
    // Speed limit number
    ctx.fillStyle = COLORS.speedLimit;
    ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "SF Pro Display"';
    ctx.textAlign = 'center';
    ctx.fillText('40', speedLimitX, speedLimitY + 7);
  };

  // Main render function
  const render = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    
    // Clear with Tesla background
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw road
    drawRoad(ctx, canvasWidth, canvasHeight);
    
    // Draw REAL detected objects as 3D shapes based on actual detection data
    detections.forEach((detection, index) => {
      if (!detection.bbox_xyxy || detection.bbox_xyxy.length < 4) return;
      
      // Convert real camera coordinates to 3D world position
      const centerX_norm = (detection.bbox_xyxy[0] + detection.bbox_xyxy[2]) / 2 / canvasWidth;
      const centerY_norm = (detection.bbox_xyxy[1] + detection.bbox_xyxy[3]) / 2 / canvasHeight;
      
      // Map to Tesla view coordinates
      const worldX = canvasWidth / 2 + (centerX_norm - 0.5) * 300;
      const worldY = canvasHeight / 2 + 20 - (1 - centerY_norm) * 200;
      
      const size = getObjectSize(detection.label);
      const color = getObjectColor(detection);
      
      // Draw the actual detected object with correct shape
      draw3DObject(ctx, worldX, worldY, size, color, detection);
      
      // Draw distance arc for very close objects
      const distance = detection.distance_m || 10;
      if (distance < 5) {
        ctx.strokeStyle = distance < 2 ? COLORS.objectDanger : COLORS.objectHazard;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(canvasWidth / 2, canvasHeight / 2 + 20, distance * 30, -Math.PI/6, Math.PI/6);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });
    
    // Draw inferred objects
    inferredObjects.forEach(obj => {
      const worldX = canvasWidth / 2 + obj.x;
      const worldY = canvasHeight / 2 + 50 + obj.y;
      draw3DBox(ctx, worldX, worldY, obj.size, obj.color, '', obj.distance);
    });
    
    // Draw Tesla car at center
    drawTeslaCar(ctx, canvasWidth, canvasHeight);
    
    // Draw top UI
    drawTopUI(ctx, canvasWidth);
  };

  // Animation loop
  useEffect(() => {
    if (!isActive) return;
    
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
  }, [isActive, speed, turnDirection, detections, bikeAnimation, deviceMotion]);

  // Update inferred objects based on context
  useEffect(() => {
    setInferredObjects(generateInferredObjects());
  }, [roadType, detections.length]);

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
        }}
      />
    </View>
  );
};

export default TeslaAutopilotView;