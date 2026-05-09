/**
 * Simple Test Component to Verify Your GLB Model Loads
 */

import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

const TestYourModel = () => {
  const mountRef = useRef(null);
  const [status, setStatus] = useState('Initializing...');
  const [modelInfo, setModelInfo] = useState(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const mount = mountRef.current;
    if (!mount) return;

    // Simple scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    const camera = new THREE.PerspectiveCamera(75, 800 / 600, 0.1, 1000);
    camera.position.set(0, 2, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(800, 600);
    mount.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // Test loading YOUR model
    const loader = new GLTFLoader();
    
    setStatus('Loading your model.glb...');
    
    loader.load(
      '/model.glb', // Your model path
      (gltf) => {
        setStatus('✅ SUCCESS! Your model loaded!');
        
        const model = gltf.scene;
        
        // Get model info
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        
        setModelInfo({
          size: `${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`,
          center: `${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}`,
          meshCount: 0,
          materialCount: 0
        });

        // Count meshes and materials
        let meshCount = 0;
        let materialCount = 0;
        model.traverse((child) => {
          if (child.isMesh) {
            meshCount++;
            if (child.material) {
              if (Array.isArray(child.material)) {
                materialCount += child.material.length;
              } else {
                materialCount++;
              }
            }
          }
        });

        setModelInfo(prev => ({
          ...prev,
          meshCount,
          materialCount
        }));

        // Center and scale the model
        model.position.sub(center);
        const maxDimension = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDimension;
        model.scale.setScalar(scale);

        scene.add(model);

        // Animation loop
        const animate = () => {
          requestAnimationFrame(animate);
          model.rotation.y += 0.01;
          camera.lookAt(0, 0, 0);
          renderer.render(scene, camera);
        };
        animate();
      },
      (progress) => {
        const percent = (progress.loaded / progress.total) * 100;
        setStatus(`Loading: ${Math.round(percent)}%`);
      },
      (error) => {
        console.error('Model loading error:', error);
        setStatus(`❌ ERROR: ${error.message}`);
        
        // Create a simple test cube to show the system works
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
        const cube = new THREE.Mesh(geometry, material);
        scene.add(cube);

        const animate = () => {
          requestAnimationFrame(animate);
          cube.rotation.y += 0.01;
          renderer.render(scene, camera);
        };
        animate();
      }
    );

    return () => {
      if (mount && renderer.domElement) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Web platform required</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🏍️ Testing Your model.glb</Text>
      
      <View style={styles.statusContainer}>
        <Text style={styles.status}>{status}</Text>
        
        {modelInfo && (
          <View style={styles.infoContainer}>
            <Text style={styles.infoTitle}>Model Information:</Text>
            <Text style={styles.infoText}>Size: {modelInfo.size}</Text>
            <Text style={styles.infoText}>Center: {modelInfo.center}</Text>
            <Text style={styles.infoText}>Meshes: {modelInfo.meshCount}</Text>
            <Text style={styles.infoText}>Materials: {modelInfo.materialCount}</Text>
          </View>
        )}
      </View>

      <div ref={mountRef} style={{ width: 800, height: 600, border: '2px solid #22d3ee' }} />
      
      <Text style={styles.instructions}>
        {status.includes('SUCCESS') 
          ? '✅ Perfect! Your model is working. Now you can use it in the Tesla display!'
          : status.includes('ERROR')
          ? '❌ Model not found. Make sure model.glb is in the public folder or car-vision-frontend root.'
          : '⏳ Loading your model...'
        }
      </Text>
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
    marginBottom: 20,
  },
  statusContainer: {
    backgroundColor: '#1a1a1a',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    minWidth: 300,
  },
  status: {
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 10,
  },
  infoContainer: {
    marginTop: 10,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#22d3ee',
    marginBottom: 5,
  },
  infoText: {
    fontSize: 12,
    color: '#ffffff',
    marginBottom: 2,
  },
  instructions: {
    fontSize: 14,
    color: '#ffffff',
    textAlign: 'center',
    marginTop: 20,
    maxWidth: 600,
  },
  errorText: {
    color: '#ffffff',
    fontSize: 16,
  },
});

export default TestYourModel;