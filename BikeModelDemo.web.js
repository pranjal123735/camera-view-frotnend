/**
 * Demo Component - Tesla-style Bike Display with Your GLB Model
 * Shows how to integrate your model.glb into the vision system
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import TeslaBikeDisplay from './TeslaBikeDisplay.web';
import BikeModelLoader from './BikeModelLoader.web';

const BikeModelDemo = () => {
  const [currentView, setCurrentView] = useState('tesla');
  const [bikeRotation, setBikeRotation] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  const [cameraAngle, setCameraAngle] = useState('diagonal');
  const [lightingMode, setLightingMode] = useState('tesla');
  
  // Mock vision data for demo
  const [mockVisionData, setMockVisionData] = useState({
    speed: 45,
    global_hazard: {
      level: 1,
      note: 'Clear road ahead',
      alert_color: 'green'
    },
    cameras: {
      front: { hazard_level: 0, objects: [] },
      rear: { hazard_level: 1, objects: [{ label: 'car', distance: 'far' }] },
      left: { hazard_level: 0, objects: [] },
      right: { hazard_level: 0, objects: [] }
    }
  });

  // Auto-rotate demo
  useEffect(() => {
    if (isRunning) {
      const interval = setInterval(() => {
        setBikeRotation(prev => (prev + 2) % 360);
      }, 100);
      return () => clearInterval(interval);
    }
  }, [isRunning]);

  // Simulate changing conditions
  useEffect(() => {
    const interval = setInterval(() => {
      setMockVisionData(prev => ({
        ...prev,
        speed: 30 + Math.random() * 40,
        global_hazard: {
          ...prev.global_hazard,
          level: Math.floor(Math.random() * 4),
        }
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const views = [
    { id: 'tesla', name: 'Tesla Display', component: TeslaBikeDisplay },
    { id: 'model', name: 'Model Viewer', component: BikeModelLoader }
  ];

  const cameraAngles = ['front', 'rear', 'left', 'right', 'top', 'diagonal'];
  const lightingModes = ['tesla', 'studio', 'auto'];

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          Bike Model Demo requires web platform
        </Text>
      </View>
    );
  }

  const CurrentComponent = views.find(v => v.id === currentView)?.component;

  return (
    <View style={styles.container}>
      {/* Header Controls */}
      <View style={styles.header}>
        <Text style={styles.title}>🏍️ Your Bike in Tesla Auto Display</Text>
        
        <View style={styles.controls}>
          {/* View Selector */}
          <View style={styles.controlGroup}>
            <Text style={styles.controlLabel}>View:</Text>
            {views.map(view => (
              <TouchableOpacity
                key={view.id}
                style={[
                  styles.button,
                  currentView === view.id && styles.buttonActive
                ]}
                onPress={() => setCurrentView(view.id)}
              >
                <Text style={[
                  styles.buttonText,
                  currentView === view.id && styles.buttonTextActive
                ]}>
                  {view.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Camera Angle (for Model Viewer) */}
          {currentView === 'model' && (
            <View style={styles.controlGroup}>
              <Text style={styles.controlLabel}>Camera:</Text>
              {cameraAngles.map(angle => (
                <TouchableOpacity
                  key={angle}
                  style={[
                    styles.smallButton,
                    cameraAngle === angle && styles.buttonActive
                  ]}
                  onPress={() => setCameraAngle(angle)}
                >
                  <Text style={[
                    styles.smallButtonText,
                    cameraAngle === angle && styles.buttonTextActive
                  ]}>
                    {angle}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Lighting Mode (for Model Viewer) */}
          {currentView === 'model' && (
            <View style={styles.controlGroup}>
              <Text style={styles.controlLabel}>Lighting:</Text>
              {lightingModes.map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[
                    styles.smallButton,
                    lightingMode === mode && styles.buttonActive
                  ]}
                  onPress={() => setLightingMode(mode)}
                >
                  <Text style={[
                    styles.smallButtonText,
                    lightingMode === mode && styles.buttonTextActive
                  ]}>
                    {mode}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Animation Control */}
          <View style={styles.controlGroup}>
            <TouchableOpacity
              style={[styles.button, isRunning && styles.buttonActive]}
              onPress={() => setIsRunning(!isRunning)}
            >
              <Text style={[
                styles.buttonText,
                isRunning && styles.buttonTextActive
              ]}>
                {isRunning ? 'Stop' : 'Start'} Animation
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Main Display */}
      <View style={styles.displayContainer}>
        {CurrentComponent && (
          <CurrentComponent
            width={800}
            height={600}
            modelPath="/model.glb"
            visionData={mockVisionData}
            cameraFeeds={{
              front: true,
              rear: true,
              left: false,
              right: false
            }}
            isRunning={isRunning}
            bikeRotation={bikeRotation}
            rotation={bikeRotation}
            cameraAngle={cameraAngle}
            lighting={lightingMode}
            showControls={true}
            showDiagnostics={true}
            onModelLoaded={(model, gltf) => {
              console.log('Bike model loaded successfully:', model);
              console.log('GLTF data:', gltf);
            }}
          />
        )}
      </View>

      {/* Info Panel */}
      <View style={styles.infoPanel}>
        <Text style={styles.infoTitle}>Model Information</Text>
        <Text style={styles.infoText}>
          • Model Path: ./model.glb
        </Text>
        <Text style={styles.infoText}>
          • Current Rotation: {Math.round(bikeRotation)}°
        </Text>
        <Text style={styles.infoText}>
          • Animation: {isRunning ? 'Running' : 'Stopped'}
        </Text>
        <Text style={styles.infoText}>
          • View Mode: {views.find(v => v.id === currentView)?.name}
        </Text>
        {currentView === 'model' && (
          <>
            <Text style={styles.infoText}>
              • Camera Angle: {cameraAngle}
            </Text>
            <Text style={styles.infoText}>
              • Lighting: {lightingMode}
            </Text>
          </>
        )}
        
        <Text style={styles.infoTitle} style={{ marginTop: 15 }}>
          Integration Notes
        </Text>
        <Text style={styles.infoText}>
          • Replace "./model.glb" with your actual model path
        </Text>
        <Text style={styles.infoText}>
          • Adjust scale and positioning in processModel()
        </Text>
        <Text style={styles.infoText}>
          • Customize Tesla colors in TESLA_COLORS
        </Text>
        <Text style={styles.infoText}>
          • Add your camera feeds to cameraFeeds prop
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    padding: 20,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 2,
    borderBottomColor: '#22d3ee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#22d3ee',
    marginBottom: 15,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 15,
  },
  controlGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlLabel: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 5,
  },
  button: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    backgroundColor: '#2a2a2a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#444',
  },
  buttonActive: {
    backgroundColor: '#22d3ee',
    borderColor: '#22d3ee',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonTextActive: {
    color: '#000000',
  },
  smallButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#2a2a2a',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#444',
  },
  smallButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  displayContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  infoPanel: {
    padding: 20,
    backgroundColor: '#1a1a1a',
    borderTopWidth: 2,
    borderTopColor: '#22d3ee',
    maxHeight: 200,
  },
  infoTitle: {
    color: '#22d3ee',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  infoText: {
    color: '#ffffff',
    fontSize: 12,
    marginBottom: 3,
  },
  errorText: {
    color: '#ffffff',
    textAlign: 'center',
    marginTop: 50,
    fontSize: 16,
  },
});

export default BikeModelDemo;