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

  // Tesla-style colors
  const COLORS = {
    background: '#1a1a1a',        // Dark charcoal like Tesla
    backgroundLight: '#ffffff',   // Clean white alternative
    road: '#2a2a2a',             // Dark road
    laneLines: '#ffffff',        // White lane markings
    bike: '#4a9eff',             // Tesla blue for bike
    bikeGlow: '#4a9eff40',       // Blue glow under bike
    objectNormal: '#888888',     // Grey boxes for objects
    objectHazard: '#ff8c42',     // Orange for hazard
    objectDanger: '#ff4757',     // Red for danger
    text: '#ffffff',             // White text
    textSecondary: '#aaaaaa',    // Grey secondary text
    laneHighlight: '#4a9eff20',  // Blue tint for current lane
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

  // Draw motorcycle at center
  const drawMotorcycle = (ctx, canvasWidth, canvasHeight) => {
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2 + 50;
    
    // Bike lean angle based on turn
    const leanAngle = turnDirection === 'left' ? -5 : turnDirection === 'right' ? 5 : 0;
    
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(leanAngle * Math.PI / 180);
    
    // Blue glow under bike
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 40);
    gradient.addColorStop(0, COLORS.bikeGlow);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(-30, -20, 60, 40);
    
    // Bike body (slim rectangle)
    ctx.fillStyle = COLORS.bike;
    ctx.fillRect(-4, -25, 8, 50);
    
    // Wheels
    ctx.fillStyle = '#333333';
    ctx.fillRect(-6, -30, 12, 6); // Front wheel
    ctx.fillRect(-6, 24, 12, 6);  // Rear wheel
    
    // Handlebars
    ctx.fillStyle = COLORS.bike;
    ctx.fillRect(-15, -28, 30, 3);
    
    ctx.restore();
    
    // Speed display above bike
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 36px -apple-system, BlinkMacSystemFont, "SF Pro Display"';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(speed).toString(), centerX, centerY - 80);
    
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "SF Pro Display"';
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText('km/h', centerX, centerY - 55);
  };

  // Draw road with lanes
  const drawRoad = (ctx, canvasWidth, canvasHeight) => {
    const roadWidth = 300;
    const centerX = canvasWidth / 2;
    
    // Road curve based on turn direction
    const curveOffset = turnDirection === 'left' ? -20 : turnDirection === 'right' ? 20 : 0;
    
    // Road surface
    ctx.fillStyle = COLORS.road;
    ctx.fillRect(centerX - roadWidth/2 + curveOffset, 0, roadWidth, canvasHeight);
    
    // Current lane highlight
    ctx.fillStyle = COLORS.laneHighlight;
    ctx.fillRect(centerX - 50 + curveOffset, 0, 100, canvasHeight);
    
    // Lane markings (dashed lines)
    ctx.strokeStyle = COLORS.laneLines;
    ctx.lineWidth = 2;
    ctx.setLineDash([20, 20]);
    
    // Animate road scrolling
    roadOffsetRef.current += speed * 0.1;
    if (roadOffsetRef.current > 40) roadOffsetRef.current = 0;
    
    // Left lane line
    ctx.beginPath();
    for (let y = -roadOffsetRef.current; y < canvasHeight + 40; y += 40) {
      ctx.moveTo(centerX - 75 + curveOffset, y);
      ctx.lineTo(centerX - 75 + curveOffset, y + 20);
    }
    ctx.stroke();
    
    // Right lane line
    ctx.beginPath();
    for (let y = -roadOffsetRef.current; y < canvasHeight + 40; y += 40) {
      ctx.moveTo(centerX + 75 + curveOffset, y);
      ctx.lineTo(centerX + 75 + curveOffset, y + 20);
    }
    ctx.stroke();
    
    // Road edges (solid lines)
    ctx.setLineDash([]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centerX - roadWidth/2 + curveOffset, 0);
    ctx.lineTo(centerX - roadWidth/2 + curveOffset, canvasHeight);
    ctx.moveTo(centerX + roadWidth/2 + curveOffset, 0);
    ctx.lineTo(centerX + roadWidth/2 + curveOffset, canvasHeight);
    ctx.stroke();
  };

  // Draw Tesla-style top UI bar
  const drawTopUI = (ctx, canvasWidth) => {
    // Speed (center)
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "SF Pro Display"';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(speed).toString(), canvasWidth / 2, 40);
    
    ctx.font = '12px -apple-system, BlinkMacSystemFont, "SF Pro Display"';
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText('km/h', canvasWidth / 2, 55);
    
    // Status (left)
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.text;
    ctx.font = '14px -apple-system, BlinkMacSystemFont, "SF Pro Display"';
    ctx.fillText('D', 20, 35);
    ctx.fillStyle = COLORS.textSecondary;
    ctx.fillText('READY', 20, 55);
    
    // Speed limit (right)
    ctx.textAlign = 'right';
    ctx.strokeStyle = COLORS.text;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(canvasWidth - 40, 35, 20, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "SF Pro Display"';
    ctx.textAlign = 'center';
    ctx.fillText('50', canvasWidth - 40, 40);
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
    
    // Draw motorcycle at center
    drawMotorcycle(ctx, canvasWidth, canvasHeight);
    
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