/**
 * Tesla-style 360° Bike Display with Real GLB Model
 * Integrates your actual bike model into the Tesla-style interface
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Tesla-style colors
const TESLA_COLORS = {
  primary: '#22d3ee',
  secondary: '#38bdf8',
  accent: '#0ea5e9',
  warning: '#fbbf24',
  danger: '#ef4444',
  success: '#10b981',
  background: '#0a0a0a',
  panel: '#1a1a1a',
};

const TeslaBikeDisplay = ({ 
  width = screenWidth, 
  height = screenHeight,
  modelPath = '/model.glb', // Updated to use your model from public folder
  visionData = null,
  cameraFeeds = {},
  isRunning = false,
  bikeRotation = 0,
  showDiagnostics = true
}) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const bikeModelRef = useRef(null);
  const animationRef = useRef(null);
  const hudRef = useRef(null);
  
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState(null);

  // Initialize the 3D scene
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const mount = mountRef.current;
    if (!mount) return;

    initializeScene();
    loadBikeModel();
    createHUD();
    startAnimation();

    return cleanup;
  }, [width, height, modelPath]);

  // Update bike rotation
  useEffect(() => {
    if (bikeModelRef.current && modelLoaded) {
      bikeModelRef.current.rotation.y = (bikeRotation * Math.PI) / 180;
    }
  }, [bikeRotation, modelLoaded]);

  const initializeScene = () => {
    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(TESLA_COLORS.background);
    scene.fog = new THREE.Fog(TESLA_COLORS.background, 10, 50);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.set(0, 8, 12);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: false,
      powerPreference: "high-performance"
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    mountRef.current.appendChild(renderer.domElement);

    // Tesla-style lighting
    setupTeslaLighting(scene);
    
    // Create the environment
    createEnvironment(scene);
  };

  const setupTeslaLighting = (scene) => {
    // Ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    scene.add(ambientLight);

    // Main directional light (key light)
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(10, 15, 10);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 0.5;
    mainLight.shadow.camera.far = 50;
    mainLight.shadow.camera.left = -20;
    mainLight.shadow.camera.right = 20;
    mainLight.shadow.camera.top = 20;
    mainLight.shadow.camera.bottom = -20;
    scene.add(mainLight);

    // Tesla blue accent light
    const accentLight = new THREE.DirectionalLight(TESLA_COLORS.primary, 0.6);
    accentLight.position.set(-8, 10, -8);
    scene.add(accentLight);

    // Rim light for dramatic effect
    const rimLight = new THREE.DirectionalLight(0x4080ff, 0.4);
    rimLight.position.set(0, 5, -15);
    scene.add(rimLight);

    // Point lights for additional drama
    const pointLight1 = new THREE.PointLight(TESLA_COLORS.accent, 0.8, 20);
    pointLight1.position.set(5, 3, 5);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(TESLA_COLORS.secondary, 0.6, 15);
    pointLight2.position.set(-5, 3, -5);
    scene.add(pointLight2);
  };

  const createEnvironment = (scene) => {
    // Tesla-style platform
    const platformGeometry = new THREE.CylinderGeometry(8, 8, 0.2, 32);
    const platformMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.8,
      roughness: 0.2,
      envMapIntensity: 1.0,
    });
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.y = -0.1;
    platform.receiveShadow = true;
    scene.add(platform);

    // Glowing ring around the platform
    const ringGeometry = new THREE.TorusGeometry(8.5, 0.1, 8, 64);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: TESLA_COLORS.primary,
      transparent: true,
      opacity: 0.8,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.y = 0.05;
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);

    // Distance markers
    createDistanceMarkers(scene);

    // Camera position indicators
    createCameraIndicators(scene);
  };

  const createDistanceMarkers = (scene) => {
    const distances = [3, 6, 9, 12];
    const colors = [TESLA_COLORS.success, TESLA_COLORS.warning, TESLA_COLORS.danger, TESLA_COLORS.danger];

    distances.forEach((distance, index) => {
      const ringGeometry = new THREE.RingGeometry(distance - 0.05, distance + 0.05, 64);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: colors[index],
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.01;
      scene.add(ring);

      // Distance labels
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 64;
      const context = canvas.getContext('2d');
      context.fillStyle = colors[index];
      context.font = 'bold 24px Arial';
      context.textAlign = 'center';
      context.fillText(`${distance}m`, 64, 40);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.set(distance, 1, 0);
      sprite.scale.set(2, 1, 1);
      scene.add(sprite);
    });
  };

  const createCameraIndicators = (scene) => {
    const cameraPositions = [
      { name: 'FRONT', pos: [0, 1, 6], color: TESLA_COLORS.primary },
      { name: 'REAR', pos: [0, 1, -6], color: TESLA_COLORS.secondary },
      { name: 'LEFT', pos: [-6, 1, 0], color: TESLA_COLORS.success },
      { name: 'RIGHT', pos: [6, 1, 0], color: TESLA_COLORS.warning },
    ];

    cameraPositions.forEach(({ name, pos, color }) => {
      // Camera indicator
      const geometry = new THREE.BoxGeometry(0.3, 0.2, 0.4);
      const material = new THREE.MeshStandardMaterial({
        color: color,
        emissive: color,
        emissiveIntensity: 0.3,
      });
      const camera = new THREE.Mesh(geometry, material);
      camera.position.set(...pos);
      scene.add(camera);

      // Camera label
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.font = 'bold 20px Arial';
      context.textAlign = 'center';
      context.fillText(name, 128, 40);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.position.set(pos[0], pos[1] + 0.8, pos[2]);
      sprite.scale.set(2, 0.5, 1);
      scene.add(sprite);
    });
  };

  const loadBikeModel = async () => {
    const loader = new GLTFLoader();
    
    setLoadingProgress(0);
    console.log('Attempting to load bike model from:', modelPath);
    
    try {
      const gltf = await new Promise((resolve, reject) => {
        loader.load(
          modelPath,
          (gltf) => {
            console.log('✅ GLB model loaded successfully!', gltf);
            resolve(gltf);
          },
          (progress) => {
            const percent = (progress.loaded / progress.total) * 100;
            console.log(`Loading progress: ${percent}%`);
            setLoadingProgress(percent);
          },
          (error) => {
            console.error('❌ GLB loading error:', error);
            reject(error);
          }
        );
      });

      const model = gltf.scene;
      console.log('Processing your bike model...', model);
      
      // Process the model
      processModel(model);
      
      bikeModelRef.current = model;
      sceneRef.current.add(model);
      
      setModelLoaded(true);
      setError(null);
      console.log('🏍️ Your bike model is now displayed!');

    } catch (err) {
      console.error('Error loading bike model:', err);
      setError(`Failed to load your bike model: ${err.message}`);
      
      // Only create fallback if model truly fails to load
      console.log('Creating fallback bike representation...');
      createFallbackBike();
    }
  };

  const processModel = (model) => {
    console.log('🔧 Processing your bike model...');
    
    // Center and scale the model
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    
    console.log('Model size:', size);
    console.log('Model center:', center);
    
    // Center the model at origin
    model.position.sub(center);
    
    // Scale to appropriate size for Tesla display (your bike should be prominent)
    const maxDimension = Math.max(size.x, size.y, size.z);
    const targetSize = 3.5; // Make it a good size for the Tesla display
    const scale = targetSize / maxDimension;
    model.scale.setScalar(scale);
    
    console.log('Applied scale:', scale);

    // Position on platform (adjust Y if needed)
    model.position.y = 0.1; // Slightly above the platform

    // Enhance materials and enable shadows for Tesla-style appearance
    let meshCount = 0;
    model.traverse((child) => {
      if (child.isMesh) {
        meshCount++;
        child.castShadow = true;
        child.receiveShadow = true;
        
        if (child.material) {
          // Enhance materials for Tesla-style metallic appearance
          if (child.material.metalness !== undefined) {
            child.material.metalness = Math.min(child.material.metalness + 0.4, 1.0);
          }
          
          if (child.material.roughness !== undefined) {
            child.material.roughness = Math.max(child.material.roughness - 0.2, 0.1);
          }

          // Add subtle emissive glow for Tesla effect
          if (child.material.color && !child.material.emissive) {
            child.material.emissive = child.material.color.clone().multiplyScalar(0.05);
          }
          
          // Ensure proper rendering
          child.material.needsUpdate = true;
        }
      }
    });
    
    console.log(`✅ Enhanced ${meshCount} meshes in your bike model`);
    console.log('🏍️ Your bike is ready for Tesla display!');
  };

  const createFallbackBike = () => {
    const group = new THREE.Group();
    
    // Enhanced fallback bike with Tesla styling
    const bodyGeometry = new THREE.BoxGeometry(0.4, 1.0, 2.5);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: TESLA_COLORS.primary,
      metalness: 0.8,
      roughness: 0.2,
      emissive: TESLA_COLORS.primary,
      emissiveIntensity: 0.1,
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.8;
    body.castShadow = true;
    group.add(body);
    
    // Wheels with Tesla styling
    const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.15, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      metalness: 0.9,
      roughness: 0.1,
    });
    
    const frontWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    frontWheel.position.set(0, 0.4, 1.0);
    frontWheel.rotation.z = Math.PI / 2;
    frontWheel.castShadow = true;
    group.add(frontWheel);
    
    const rearWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    rearWheel.position.set(0, 0.4, -1.0);
    rearWheel.rotation.z = Math.PI / 2;
    rearWheel.castShadow = true;
    group.add(rearWheel);

    bikeModelRef.current = group;
    sceneRef.current.add(group);
    setModelLoaded(true);
  };

  const createHUD = () => {
    const hudElement = document.createElement('div');
    hudElement.style.position = 'absolute';
    hudElement.style.top = '0';
    hudElement.style.left = '0';
    hudElement.style.width = '100%';
    hudElement.style.height = '100%';
    hudElement.style.pointerEvents = 'none';
    hudElement.style.fontFamily = 'Arial, sans-serif';
    hudElement.style.color = '#ffffff';
    hudElement.style.zIndex = '10';

    mountRef.current.appendChild(hudElement);
    hudRef.current = hudElement;
  };

  const updateHUD = () => {
    if (!hudRef.current) return;

    const speed = visionData?.speed || 0;
    const hazardLevel = visionData?.global_hazard?.level || 0;
    const hazardColors = ['#10b981', '#fbbf24', '#f59e0b', '#ef4444'];

    hudRef.current.innerHTML = `
      <div style="position: absolute; top: 20px; left: 20px; background: rgba(0,0,0,0.8); padding: 15px; border-radius: 10px; border: 2px solid ${TESLA_COLORS.primary};">
        <div style="font-size: 18px; font-weight: bold; color: ${TESLA_COLORS.primary};">🏍️ TESLA BIKE DISPLAY</div>
        <div style="margin-top: 10px;">Speed: ${speed} km/h</div>
        <div>Model: ${modelLoaded ? 'Custom GLB' : 'Fallback'}</div>
        <div>Status: ${isRunning ? 'ACTIVE' : 'STANDBY'}</div>
      </div>
      
      <div style="position: absolute; top: 20px; right: 20px; background: rgba(0,0,0,0.8); padding: 15px; border-radius: 10px; border: 2px solid ${hazardColors[hazardLevel]};">
        <div style="font-size: 16px; font-weight: bold; color: ${hazardColors[hazardLevel]};">HAZARD LEVEL: ${hazardLevel}</div>
        <div style="margin-top: 5px; font-size: 14px;">${visionData?.global_hazard?.note || 'All Clear'}</div>
      </div>
      
      ${showDiagnostics ? `
      <div style="position: absolute; bottom: 20px; left: 20px; background: rgba(0,0,0,0.8); padding: 10px; border-radius: 8px; font-size: 12px;">
        <div>Rotation: ${Math.round(bikeRotation)}°</div>
        <div>Cameras: ${Object.keys(cameraFeeds).length}/4</div>
        <div>Model: ${modelPath.split('/').pop()}</div>
      </div>
      ` : ''}
    `;
  };

  const startAnimation = () => {
    const animate = () => {
      animationRef.current = requestAnimationFrame(animate);
      
      const time = Date.now() * 0.001;
      
      // Animate environment elements
      if (sceneRef.current) {
        // Rotate the glowing ring
        const ring = sceneRef.current.children.find(child => 
          child.geometry && child.geometry.type === 'TorusGeometry'
        );
        if (ring) {
          ring.rotation.z = time * 0.5;
        }

        // Pulse camera indicators based on activity
        sceneRef.current.children.forEach(child => {
          if (child.material && child.material.emissive) {
            const pulse = 0.3 + Math.sin(time * 2) * 0.1;
            child.material.emissiveIntensity = pulse;
          }
        });
      }

      // Update HUD
      updateHUD();
      
      // Render the scene
      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };
    
    animate();
  };

  const cleanup = () => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    if (rendererRef.current) {
      rendererRef.current.dispose();
    }
    
    if (mountRef.current && rendererRef.current?.domElement) {
      mountRef.current.removeChild(rendererRef.current.domElement);
    }
    
    if (hudRef.current && mountRef.current) {
      mountRef.current.removeChild(hudRef.current);
    }
  };

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          Tesla Bike Display requires web platform
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { width, height }]}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      
      {!modelLoaded && !error && (
        <View style={styles.loadingOverlay}>
          <Text style={styles.loadingTitle}>Loading Your Bike Model</Text>
          <Text style={styles.loadingText}>{Math.round(loadingProgress)}%</Text>
          <View style={styles.progressBar}>
            <View 
              style={[styles.progressFill, { width: `${loadingProgress}%` }]} 
            />
          </View>
        </View>
      )}
      
      {error && (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorTitle}>Model Loading Error</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.errorText}>Using fallback representation</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: TESLA_COLORS.background,
    position: 'relative',
    overflow: 'hidden',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  loadingTitle: {
    color: TESLA_COLORS.primary,
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  loadingText: {
    color: '#ffffff',
    fontSize: 18,
    marginBottom: 20,
  },
  progressBar: {
    width: 200,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: TESLA_COLORS.primary,
    borderRadius: 2,
  },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  errorTitle: {
    color: TESLA_COLORS.danger,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorText: {
    color: '#ffffff',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 5,
  },
});

export default TeslaBikeDisplay;