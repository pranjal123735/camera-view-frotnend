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

  // Convert camera bbox to 3D world position
  const bboxToWorldPosition = (bbox, canvasWidth, canvasHeight) => {
    const centerX = bbox.bbox_center_x || (bbox.bbox_xyxy[0] + bbox.bbox_xyxy[2]) / 2 / canvasWidth;
    const centerY = bbox.bbox_center_y || (bbox.bbox_xyxy[1] + bbox.bbox_xyxy[3]) / 2 / canvasHeight;
    
    // Map camera coordinates to 3D world
    const worldX = (centerX - 0.5) * 400; // -200 to +200 pixels from center
    const worldY = (1 - centerY) * 300 + 50; // Distance from bike (50-350 pixels)
    
    return { x: worldX, y: worldY };
  };

  // Get object size based on type
  const getObjectSize = (label) => {
    const sizes = {
      car: { width: 40, height: 80, boxHeight: 12 },
      truck: { width: 50, height: 120, boxHeight: 20 },
      bus: { width: 60, height: 140, boxHeight: 25 },
      motorcycle: { width: 20, height: 60, boxHeight: 8 },
      bicycle: { width: 15, height: 50, boxHeight: 6 },
      person: { width: 12, height: 20, boxHeight: 15 },
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

  // Draw 3D isometric box
  const draw3DBox = (ctx, x, y, size, color, label = '', distance = 0) => {
    const { width, height, boxHeight } = size;
    
    // 3D isometric projection
    const isoX = x;
    const isoY = y;
    const isoTop = isoY - boxHeight;
    
    // Draw shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(isoX - width/2, isoY, width, height/3);
    
    // Draw main box (top face)
    ctx.fillStyle = color;
    ctx.fillRect(isoX - width/2, isoTop, width, height);
    
    // Draw 3D depth (right face)
    ctx.fillStyle = color.replace(')', ', 0.7)').replace('rgb', 'rgba');
    ctx.beginPath();
    ctx.moveTo(isoX + width/2, isoTop);
    ctx.lineTo(isoX + width/2 + 8, isoTop - 8);
    ctx.lineTo(isoX + width/2 + 8, isoTop + height - 8);
    ctx.lineTo(isoX + width/2, isoTop + height);
    ctx.closePath();
    ctx.fill();
    
    // Draw 3D depth (top face)
    ctx.fillStyle = color.replace(')', ', 0.9)').replace('rgb', 'rgba');
    ctx.beginPath();
    ctx.moveTo(isoX - width/2, isoTop);
    ctx.lineTo(isoX - width/2 + 8, isoTop - 8);
    ctx.lineTo(isoX + width/2 + 8, isoTop - 8);
    ctx.lineTo(isoX + width/2, isoTop);
    ctx.closePath();
    ctx.fill();
    
    // Distance label
    if (distance > 0) {
      ctx.fillStyle = COLORS.text;
      ctx.font = '12px -apple-system, BlinkMacSystemFont, "SF Pro Display"';
      ctx.textAlign = 'center';
      ctx.fillText(`${distance}m`, isoX, isoY + height + 20);
    }
  };

  // Draw Tesla car at center (realistic 3D model like in image)
  const drawTeslaCar = (ctx, canvasWidth, canvasHeight) => {
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2 + 20;
    
    // Car lean angle based on turn
    const leanAngle = turnDirection === 'left' ? -3 : turnDirection === 'right' ? 3 : 0;
    
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(leanAngle * Math.PI / 180);
    
    // Car shadow
    ctx.fillStyle = COLORS.carShadow;
    ctx.fillRect(-25, 15, 50, 8);
    
    // Main car body (Tesla blue like in image)
    const gradient = ctx.createLinearGradient(0, -20, 0, 20);
    gradient.addColorStop(0, '#5ba3f5');
    gradient.addColorStop(0.5, COLORS.car);
    gradient.addColorStop(1, '#3a7bc8');
    ctx.fillStyle = gradient;
    
    // Car body shape (more realistic Tesla-like)
    ctx.beginPath();
    ctx.roundRect(-22, -15, 44, 30, 8);
    ctx.fill();
    
    // Car roof (darker)
    ctx.fillStyle = '#2d5aa0';
    ctx.beginPath();
    ctx.roundRect(-18, -12, 36, 15, 6);
    ctx.fill();
    
    // Windshield
    ctx.fillStyle = '#87ceeb40';
    ctx.beginPath();
    ctx.roundRect(-16, -10, 32, 8, 4);
    ctx.fill();
    
    // Wheels
    ctx.fillStyle = '#333333';
    ctx.beginPath();
    ctx.roundRect(-20, -18, 8, 4, 2);
    ctx.roundRect(12, -18, 8, 4, 2);
    ctx.roundRect(-20, 14, 8, 4, 2);
    ctx.roundRect(12, 14, 8, 4, 2);
    ctx.fill();
    
    ctx.restore();
  };

  // Draw road with lanes (exactly like Tesla image)
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
    
    // Animate road scrolling
    roadOffsetRef.current += speed * 0.05;
    if (roadOffsetRef.current > 30) roadOffsetRef.current = 0;
    
    // Center lane line (white)
    ctx.strokeStyle = COLORS.laneCenter;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = -roadOffsetRef.current; y < canvasHeight + 30; y += 30) {
      ctx.moveTo(centerX, y);
      ctx.lineTo(centerX, y + 15);
    }
    ctx.stroke();
    
    // Side lane lines (subtle)
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
    
    // Draw detected objects as 3D boxes
    detections.forEach((detection, index) => {
      const pos = bboxToWorldPosition(detection, canvasWidth, canvasHeight);
      const worldX = canvasWidth / 2 + pos.x;
      const worldY = canvasHeight / 2 + 50 - pos.y;
      
      const size = getObjectSize(detection.label);
      const color = getObjectColor(detection);
      const distance = Math.round(detection.distance_m || 10);
      
      draw3DBox(ctx, worldX, worldY, size, color, detection.label, distance);
      
      // Draw distance arc for closest object
      if (distance < 10) {
        ctx.strokeStyle = distance < 3 ? COLORS.objectDanger : COLORS.objectHazard;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(canvasWidth / 2, canvasHeight / 2 + 50, distance * 20, -Math.PI/4, Math.PI/4);
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
  }, [isActive, speed, turnDirection, detections]);

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