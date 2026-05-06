/**
 * 360° Surround Vision Renderer - Frontend Canvas Renderer
 * Renders animated scenes for left, right, and rear panels based on backend data
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, Dimensions, Platform } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const SurroundVisionRenderer = ({ 
  width = screenWidth, 
  height = screenHeight,
  sceneData = null,
  frontVideoElement = null,
  isRunning = false
}) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const [ctx, setCtx] = useState(null);
  const [animationTime, setAnimationTime] = useState(0);

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

    const animate = (timestamp) => {
      setAnimationTime(timestamp);
      render(timestamp);
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [ctx, isRunning, sceneData]);

  const render = useCallback((timestamp) => {
    if (!ctx || !sceneData) return;

    // Clear canvas
    ctx.fillStyle = sceneData.stitch?.sky_color || '#87CEEB';
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const panelSize = Math.min(width, height) * 0.25;

    // Draw 4 panels in 360° arrangement
    drawPanel(ctx, 'front', centerX, centerY - panelSize * 1.2, panelSize, timestamp);
    drawPanel(ctx, 'right', centerX + panelSize * 1.2, centerY, panelSize, timestamp);
    drawPanel(ctx, 'rear', centerX, centerY + panelSize * 1.2, panelSize, timestamp);
    drawPanel(ctx, 'left', centerX - panelSize * 1.2, centerY, panelSize, timestamp);

    // Draw motorcycle at center
    drawMotorcycle(ctx, centerX, centerY, sceneData.bike, timestamp);

    // Draw distance rings
    drawDistanceRings(ctx, centerX, centerY, panelSize * 1.5);

    // Draw connecting roads between panels
    drawConnectingRoads(ctx, centerX, centerY, panelSize);

  }, [ctx, width, height, sceneData, frontVideoElement]);

  const drawPanel = (ctx, panelName, x, y, size, timestamp) => {
    const panelData = sceneData[panelName];
    if (!panelData && panelName !== 'front') return;

    ctx.save();
    ctx.translate(x - size/2, y - size/2);

    // Panel background
    if (panelName === 'front' && frontVideoElement) {
      // Draw real video for front panel
      try {
        ctx.drawImage(frontVideoElement, 0, 0, size, size);
      } catch (e) {
        // Fallback if video not ready
        ctx.fillStyle = '#333333';
        ctx.fillRect(0, 0, size, size);
      }
    } else if (panelData) {
      // Draw generated scene for other panels
      drawGeneratedScene(ctx, panelData, size, timestamp);
    }

    // Panel border
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, size, size);

    // Panel label
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(panelName.toUpperCase(), size/2, -5);

    ctx.restore();
  };

  const drawGeneratedScene = (ctx, panelData, size, timestamp) => {
    // Sky background
    ctx.fillStyle = panelData.bg_color || '#87CEEB';
    ctx.fillRect(0, 0, size, size * 0.4);

    // Road surface
    ctx.fillStyle = panelData.road_color || '#404040';
    ctx.fillRect(0, size * 0.6, size, size * 0.4);

    // Draw scene elements (buildings, trees, etc.)
    if (panelData.scene_elements) {
      panelData.scene_elements.forEach(element => {
        drawSceneElement(ctx, element, size, timestamp, panelData.scroll_speed);
      });
    }

    // Draw road markings
    if (panelData.road_markings) {
      panelData.road_markings.forEach(marking => {
        drawRoadMarking(ctx, marking, size, timestamp, panelData.scroll_speed);
      });
    }

    // Draw inferred objects
    if (panelData.objects) {
      panelData.objects.forEach(obj => {
        drawInferredObject(ctx, obj, size, timestamp);
      });
    }

    // Draw weather effects
    if (panelData.weather_effects) {
      panelData.weather_effects.forEach(effect => {
        drawWeatherEffect(ctx, effect, size, timestamp);
      });
    }
  };

  const drawSceneElement = (ctx, element, panelSize, timestamp, scrollSpeed) => {
    if (!element) return;

    ctx.save();

    // Calculate animated position
    const scrollOffset = (timestamp * scrollSpeed * 0.001) % panelSize;
    let x = (element.x / 320) * panelSize; // Scale from 320px reference
    let y = ((element.y + scrollOffset) % panelSize);

    // Parallax effect based on distance layer
    const parallaxMultiplier = element.distance_layer === 0 ? 0.3 : 
                              element.distance_layer === 1 ? 0.6 : 1.0;
    y = ((element.y + scrollOffset * parallaxMultiplier) % panelSize);

    // Scale size
    const w = (element.width / 320) * panelSize;
    const h = (element.height / 400) * panelSize;

    // Draw element based on type
    ctx.fillStyle = element.color || '#888888';
    
    switch (element.type) {
      case 'building':
        ctx.fillRect(x, y, w, h);
        // Add windows
        ctx.fillStyle = '#FFFF00';
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < Math.floor(h / 20); j++) {
            if (Math.random() > 0.7) { // Random lit windows
              ctx.fillRect(x + i * (w/3) + 5, y + j * 20 + 5, 8, 8);
            }
          }
        }
        break;
        
      case 'tree':
        // Tree trunk
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(x + w/3, y + h/2, w/3, h/2);
        // Tree foliage
        ctx.fillStyle = element.color;
        ctx.beginPath();
        ctx.arc(x + w/2, y + h/3, w/2, 0, Math.PI * 2);
        ctx.fill();
        break;
        
      case 'barrier':
        ctx.fillRect(x, y, w, h);
        // Add reflective strips
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x, y + h/3, w, 2);
        break;
        
      case 'sidewalk':
        ctx.fillRect(x, y, w, h);
        break;
        
      default:
        ctx.fillRect(x, y, w, h);
    }

    ctx.restore();
  };

  const drawRoadMarking = (ctx, marking, panelSize, timestamp, scrollSpeed) => {
    if (!marking) return;

    ctx.save();

    // Animate road markings
    const scrollOffset = (timestamp * scrollSpeed * 0.002) % panelSize;
    const x = (marking.x / 320) * panelSize;
    const y = ((marking.y + scrollOffset) % panelSize);
    const w = (marking.width / 320) * panelSize;
    const h = (marking.height / 400) * panelSize;

    ctx.fillStyle = marking.color || '#FFFFFF';
    ctx.fillRect(x, y, w, h);

    ctx.restore();
  };

  const drawInferredObject = (ctx, obj, panelSize, timestamp) => {
    if (!obj) return;

    ctx.save();

    // Scale object to panel size
    const x = (obj.x / 320) * panelSize;
    const y = (obj.y / 400) * panelSize;
    const w = (obj.width / 320) * panelSize;
    const h = (obj.height / 400) * panelSize;

    // Draw bounding box
    ctx.strokeStyle = obj.is_inferred ? '#FFAA00' : '#00FF00'; // Orange for inferred
    ctx.lineWidth = 2;
    ctx.setLineDash(obj.is_inferred ? [5, 5] : []);
    ctx.strokeRect(x, y, w, h);

    // Draw object representation
    ctx.fillStyle = 'rgba(255, 170, 0, 0.3)';
    ctx.fillRect(x, y, w, h);

    // Label
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`${obj.label} (${obj.distance_m.toFixed(1)}m)`, x, y - 5);

    ctx.setLineDash([]);
    ctx.restore();
  };

  const drawWeatherEffect = (ctx, effect, panelSize, timestamp) => {
    if (!effect) return;

    ctx.save();
    ctx.globalAlpha = effect.opacity || 1.0;

    const x = (effect.x / 320) * panelSize;
    const y = (effect.y / 400) * panelSize;

    switch (effect.type) {
      case 'raindrop':
        // Animate raindrops falling
        const dropY = (y + timestamp * 0.01 * effect.velocity_y) % panelSize;
        ctx.strokeStyle = effect.color;
        ctx.lineWidth = effect.width;
        ctx.beginPath();
        ctx.moveTo(x, dropY);
        ctx.lineTo(x, dropY + effect.height);
        ctx.stroke();
        break;
        
      case 'fog':
        ctx.fillStyle = effect.color;
        ctx.fillRect(0, 0, panelSize, panelSize);
        break;
    }

    ctx.restore();
  };

  const drawMotorcycle = (ctx, centerX, centerY, bikeData, timestamp) => {
    if (!bikeData) return;

    ctx.save();
    ctx.translate(centerX, centerY);
    
    // Apply lean angle
    ctx.rotate((bikeData.lean_angle || 0) * Math.PI / 180);
    
    // Apply suspension bounce
    ctx.translate(0, bikeData.bounce || 0);

    // Motorcycle body
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(-20, -30, 40, 60);

    // Wheels with rotation
    const wheelRotation = (timestamp * (bikeData.wheel_speed || 0) * 0.01) % (Math.PI * 2);
    
    // Front wheel
    ctx.save();
    ctx.translate(0, -25);
    ctx.rotate(wheelRotation);
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.stroke();
    // Spokes
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -10);
      ctx.stroke();
    }
    ctx.restore();

    // Rear wheel
    ctx.save();
    ctx.translate(0, 25);
    ctx.rotate(wheelRotation);
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.stroke();
    // Spokes
    for (let i = 0; i < 6; i++) {
      ctx.rotate(Math.PI / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -12);
      ctx.stroke();
    }
    ctx.restore();

    // Headlight beam (if night)
    if (bikeData.headlight) {
      ctx.fillStyle = 'rgba(255, 255, 200, 0.3)';
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(-30, -80);
      ctx.lineTo(30, -80);
      ctx.closePath();
      ctx.fill();
    }

    // Speed display
    if (bikeData.speed_display !== undefined) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(-25, -60, 50, 20);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(`${bikeData.speed_display.toFixed(0)} km/h`, 0, -45);
    }

    ctx.restore();
  };

  const drawDistanceRings = (ctx, centerX, centerY, maxRadius) => {
    const rings = [
      { radius: maxRadius * 0.2, label: '3m', color: 'rgba(255, 0, 0, 0.3)' },
      { radius: maxRadius * 0.5, label: '10m', color: 'rgba(255, 255, 0, 0.3)' },
      { radius: maxRadius * 0.8, label: '30m', color: 'rgba(0, 255, 0, 0.3)' }
    ];

    rings.forEach(ring => {
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(centerX, centerY, ring.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Distance labels
      ctx.fillStyle = ring.color;
      ctx.font = '12px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(ring.label, centerX, centerY - ring.radius - 10);
    });
  };

  const drawConnectingRoads = (ctx, centerX, centerY, panelSize) => {
    if (!sceneData?.stitch) return;

    ctx.strokeStyle = sceneData.stitch.road_color || '#404040';
    ctx.lineWidth = panelSize * 0.3;

    // Horizontal road (left to right)
    ctx.beginPath();
    ctx.moveTo(centerX - panelSize * 1.5, centerY);
    ctx.lineTo(centerX + panelSize * 1.5, centerY);
    ctx.stroke();

    // Vertical road (front to rear)
    ctx.beginPath();
    ctx.moveTo(centerX, centerY - panelSize * 1.5);
    ctx.lineTo(centerX, centerY + panelSize * 1.5);
    ctx.stroke();
  };

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          Surround Vision Renderer requires web platform
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
});

export default SurroundVisionRenderer;