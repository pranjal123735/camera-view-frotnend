/**
 * Simple Tesla Display with YOUR Bike Model
 * This component focuses specifically on showing your GLB bike model
 */

import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

const MyBikeInTesla = ({ 
  width = 800, 
  height = 600,
  modelPath = '/model.glb' // Your bike model
}) => {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const bikeRef = useRef(null);
  const [status, setStatus] = useState('Loading your bike...');
  const [modelLoaded, setModelLoaded] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const mount = mountRef.current;
    if (!mount) return;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);
    sceneRef.current = scene;

    // Camera - positioned like Tesla autopilot view
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 100);
    camera.position.set(0, 8, 12);
    camera.lookAt(0, 0, 0);

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // Tesla-style lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(10, 15, 10);
    mainLight.castShadow = true;
    scene.add(mainLight);

    const teslaBlueLight = new THREE.DirectionalLight(0x22d3ee, 0.6);
    teslaBlueLight.position.set(-8, 10, -8);
    scene.add(teslaBlueLight);

    // Platform (like Tesla autopilot road)
    const platformGeometry = new THREE.CylinderGeometry(8, 8, 0.2, 32);
    const platformMaterial = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      metalness: 0.8,
      roughness: 0.2,
    });
    const platform = new THREE.Mesh(platformGeometry, platformMaterial);
    platform.position.y = -0.1;
    platform.receiveShadow = true;
    scene.add(platform);

    // Load YOUR bike model
    const loader = new GLTFLoader();
    
    console.log('🏍️ Loading your bike model from:', modelPath);
    setStatus('Loading your bike model...');

    loader.load(
      modelPath,
      (gltf) => {
        console.log('✅ SUCCESS! Your bike model loaded:', gltf);
        setStatus('✅ Your bike loaded successfully!');
        
        const bikeModel = gltf.scene;
        
        // Get model dimensions
        const box = new THREE.Box3().setFromObject(bikeModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        
        console.log('Your bike size:', size);
        console.log('Your bike center:', center);
        
        // Center the bike
        bikeModel.position.sub(center);
        
        // Scale to good size for Tesla display
        const maxDimension = Math.max(size.x, size.y, size.z);
        const targetSize = 3; // Adjust this to make your bike bigger/smaller
        const scale = targetSize / maxDimension;
        bikeModel.scale.setScalar(scale);
        
        // Position on the platform
        bikeModel.position.y = 0.1;
        
        // Make it look Tesla-style
        bikeModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            if (child.material) {
              // Keep original colors but make them more metallic
              if (child.material.metalness !== undefined) {
                child.material.metalness = Math.min(child.material.metalness + 0.3, 1.0);
              }
              if (child.material.roughness !== undefined) {
                child.material.roughness = Math.max(child.material.roughness - 0.2, 0.1);
              }
            }
          }
        });
        
        bikeRef.current = bikeModel;
        scene.add(bikeModel);
        setModelLoaded(true);
        
        console.log('🎉 Your bike is now in the Tesla display!');
      },
      (progress) => {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        setStatus(`Loading your bike: ${percent}%`);
        console.log(`Loading progress: ${percent}%`);
      },
      (error) => {
        console.error('❌ Failed to load your bike model:', error);
        setStatus(`❌ Failed to load bike: ${error.message}`);
        
        // Show where the file should be
        console.log('Make sure your model.glb file is at:', modelPath);
        console.log('Try placing it in: car-vision-frontend/public/model.glb');
      }
    );

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      // Rotate your bike slowly
      if (bikeRef.current && modelLoaded) {
        bikeRef.current.rotation.y += 0.005;
      }
      
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      if (mount && renderer.domElement) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [modelPath, width, height]);

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Web platform required</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🏍️ Your Bike in Tesla Autopilot Style</Text>
      
      <View style={styles.statusContainer}>
        <Text style={styles.status}>{status}</Text>
        {modelLoaded && (
          <Text style={styles.success}>
            🎉 Your bike model is now displayed in Tesla style!
          </Text>
        )}
      </View>

      <div 
        ref={mountRef} 
        style={{ 
          width: width, 
          height: height, 
          border: '2px solid #22d3ee',
          borderRadius: '8px'
        }} 
      />
      
      <View style={styles.instructions}>
        <Text style={styles.instructionTitle}>Instructions:</Text>
        <Text style={styles.instructionText}>
          1. Place your model.glb file in: car-vision-frontend/public/model.glb
        </Text>
        <Text style={styles.instructionText}>
          2. Your bike will appear in the center (like Tesla autopilot)
        </Text>
        <Text style={styles.instructionText}>
          3. It will rotate slowly to show all angles
        </Text>
        <Text style={styles.instructionText}>
          4. Check browser console for detailed loading info
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#22d3ee',
    marginBottom: 15,
    textAlign: 'center',
  },
  statusContainer: {
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    minWidth: 300,
    alignItems: 'center',
  },
  status: {
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
  },
  success: {
    fontSize: 14,
    color: '#10b981',
    textAlign: 'center',
    marginTop: 8,
  },
  instructions: {
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 8,
    marginTop: 15,
    maxWidth: 600,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#22d3ee',
    marginBottom: 8,
  },
  instructionText: {
    fontSize: 12,
    color: '#ffffff',
    marginBottom: 4,
  },
  errorText: {
    color: '#ffffff',
    fontSize: 16,
  },
});

export default MyBikeInTesla;