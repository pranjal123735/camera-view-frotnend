/**
 * GLB Model Loader for Tesla-style 3D Bike Display
 * Loads and renders the actual bike model from model.glb
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

const BikeModelLoader = ({ 
  width = 800, 
  height = 600,
  modelPath = '/model.glb',
  rotation = 0,
  showControls = true,
  lighting = 'auto',
  cameraAngle = 'front',
  onModelLoaded = null
}) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const bikeModelRef = useRef(null);
  const animationRef = useRef(null);
  const [loadingState, setLoadingState] = useState('loading');
  const [error, setError] = useState(null);

  // Initialize Three.js scene
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const mount = mountRef.current;
    if (!mount) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    setCameraPosition(camera, cameraAngle);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ 
      antialias: true, 
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    rendererRef.current = renderer;

    mount.appendChild(renderer.domElement);

    // Lighting setup
    setupLighting(scene, lighting);

    // Ground plane
    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshLambertMaterial({ 
      color: 0x1a1a1a,
      transparent: true,
      opacity: 0.8
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.5;
    ground.receiveShadow = true;
    scene.add(ground);

    // Load GLB model
    loadBikeModel(scene);

    // Start animation loop
    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (mount && renderer.domElement) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [width, height, modelPath, lighting, cameraAngle]);

  // Update rotation when prop changes
  useEffect(() => {
    if (bikeModelRef.current) {
      bikeModelRef.current.rotation.y = (rotation * Math.PI) / 180;
    }
  }, [rotation]);

  const setCameraPosition = (camera, angle) => {
    const positions = {
      front: { x: 0, y: 2, z: 5 },
      rear: { x: 0, y: 2, z: -5 },
      left: { x: -5, y: 2, z: 0 },
      right: { x: 5, y: 2, z: 0 },
      top: { x: 0, y: 8, z: 0 },
      diagonal: { x: 4, y: 3, z: 4 }
    };

    const pos = positions[angle] || positions.diagonal;
    camera.position.set(pos.x, pos.y, pos.z);
    camera.lookAt(0, 0, 0);
  };

  const setupLighting = (scene, lightingType) => {
    // Remove existing lights
    const lights = scene.children.filter(child => child.isLight);
    lights.forEach(light => scene.remove(light));

    if (lightingType === 'tesla') {
      // Tesla-style dramatic lighting
      const ambientLight = new THREE.AmbientLight(0x404040, 0.3);
      scene.add(ambientLight);

      const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
      mainLight.position.set(5, 10, 5);
      mainLight.castShadow = true;
      mainLight.shadow.mapSize.width = 2048;
      mainLight.shadow.mapSize.height = 2048;
      scene.add(mainLight);

      const fillLight = new THREE.DirectionalLight(0x4080ff, 0.5);
      fillLight.position.set(-5, 5, -5);
      scene.add(fillLight);

      const rimLight = new THREE.DirectionalLight(0xff8040, 0.3);
      rimLight.position.set(0, 2, -8);
      scene.add(rimLight);

    } else if (lightingType === 'studio') {
      // Studio lighting setup
      const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
      scene.add(ambientLight);

      const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
      keyLight.position.set(10, 10, 5);
      keyLight.castShadow = true;
      scene.add(keyLight);

      const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
      fillLight.position.set(-10, 5, 5);
      scene.add(fillLight);

      const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
      backLight.position.set(0, 5, -10);
      scene.add(backLight);

    } else {
      // Auto/default lighting
      const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(5, 10, 5);
      directionalLight.castShadow = true;
      directionalLight.shadow.mapSize.width = 1024;
      directionalLight.shadow.mapSize.height = 1024;
      scene.add(directionalLight);
    }
  };

  const loadBikeModel = async (scene) => {
    const loader = new GLTFLoader();
    
    try {
      setLoadingState('loading');
      
      const gltf = await new Promise((resolve, reject) => {
        loader.load(
          modelPath,
          resolve,
          (progress) => {
            const percent = (progress.loaded / progress.total) * 100;
            setLoadingState(`Loading: ${Math.round(percent)}%`);
          },
          reject
        );
      });

      const model = gltf.scene;
      
      // Center and scale the model
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      
      // Center the model
      model.position.sub(center);
      
      // Scale to reasonable size (adjust as needed)
      const maxDimension = Math.max(size.x, size.y, size.z);
      const targetSize = 3; // Adjust this value to make model bigger/smaller
      const scale = targetSize / maxDimension;
      model.scale.setScalar(scale);

      // Enable shadows
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          
          // Enhance materials for better appearance
          if (child.material) {
            child.material.envMapIntensity = 1.0;
            if (child.material.metalness !== undefined) {
              child.material.metalness = Math.min(child.material.metalness + 0.2, 1.0);
            }
          }
        }
      });

      bikeModelRef.current = model;
      scene.add(model);
      
      setLoadingState('loaded');
      setError(null);
      
      if (onModelLoaded) {
        onModelLoaded(model, gltf);
      }

    } catch (err) {
      console.error('Error loading bike model:', err);
      setError(`Failed to load model: ${err.message}`);
      setLoadingState('error');
      
      // Create fallback geometry
      createFallbackBike(scene);
    }
  };

  const createFallbackBike = (scene) => {
    // Simple fallback bike representation
    const group = new THREE.Group();
    
    // Main body
    const bodyGeometry = new THREE.BoxGeometry(0.3, 0.8, 2.0);
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x2563eb,
      metalness: 0.7,
      roughness: 0.3
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.position.y = 0.5;
    group.add(body);
    
    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x1f2937,
      metalness: 0.8,
      roughness: 0.2
    });
    
    const frontWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    frontWheel.position.set(0, 0.3, 0.8);
    frontWheel.rotation.z = Math.PI / 2;
    group.add(frontWheel);
    
    const rearWheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    rearWheel.position.set(0, 0.3, -0.8);
    rearWheel.rotation.z = Math.PI / 2;
    group.add(rearWheel);
    
    // Handlebars
    const handlebarGeometry = new THREE.BoxGeometry(0.8, 0.05, 0.05);
    const handlebarMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x374151,
      metalness: 0.9,
      roughness: 0.1
    });
    const handlebars = new THREE.Mesh(handlebarGeometry, handlebarMaterial);
    handlebars.position.set(0, 1.0, 0.6);
    group.add(handlebars);

    bikeModelRef.current = group;
    scene.add(group);
  };

  const animate = useCallback(() => {
    animationRef.current = requestAnimationFrame(animate);
    
    if (rendererRef.current && sceneRef.current && cameraRef.current) {
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    }
  }, []);

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          3D Model Viewer requires web platform
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { width, height }]}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      
      {loadingState !== 'loaded' && (
        <View style={styles.overlay}>
          {loadingState === 'error' ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorTitle}>Model Loading Error</Text>
              <Text style={styles.errorText}>{error}</Text>
              <Text style={styles.errorText}>Using fallback model</Text>
            </View>
          ) : (
            <View style={styles.loadingContainer}>
              <Text style={styles.loadingText}>{loadingState}</Text>
            </View>
          )}
        </View>
      )}
      
      {showControls && loadingState === 'loaded' && (
        <View style={styles.controls}>
          <Text style={styles.controlsTitle}>🏍️ Your Bike Model</Text>
          <Text style={styles.controlsText}>
            Loaded from: {modelPath.split('/').pop()}
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
    overflow: 'hidden',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingContainer: {
    alignItems: 'center',
  },
  loadingText: {
    color: '#22d3ee',
    fontSize: 18,
    fontWeight: 'bold',
  },
  errorContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  errorTitle: {
    color: '#ff6b6b',
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
  controls: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#22d3ee',
  },
  controlsTitle: {
    color: '#22d3ee',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  controlsText: {
    color: '#ffffff',
    fontSize: 12,
  },
});

export default BikeModelLoader;