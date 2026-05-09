/**
 * Performance Toggle Component
 * Allows users to switch between Ultra-Fast mode and Heavy AI mode
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from 'react-native';

const PerformanceToggle = ({ backendUrl = 'http://localhost:8000' }) => {
  const [isUltraFastMode, setIsUltraFastMode] = useState(true); // Default to ultra-fast
  const [isLoading, setIsLoading] = useState(false);
  const [currentLatency, setCurrentLatency] = useState(null);
  const [systemStatus, setSystemStatus] = useState('unknown');
  const [deploymentInfo, setDeploymentInfo] = useState(null);

  // Normalize backend URL for deployment environments
  const normalizedBackendUrl = useMemo(() => {
    if (!backendUrl) return 'http://localhost:8000';
    
    // Handle different deployment scenarios
    let url = backendUrl.replace(/\/+$/, ''); // Remove trailing slashes
    
    // If it's a relative URL or localhost, try to detect deployment URL
    if (url.includes('localhost') || url.startsWith('/')) {
      // Try to detect if we're in a deployed environment
      const currentHost = window.location.host;
      const currentProtocol = window.location.protocol;
      
      if (currentHost.includes('railway.app')) {
        // Railway deployment - backend usually on same domain different port or subdomain
        url = `${currentProtocol}//${currentHost.replace('-frontend', '-backend')}`;
      } else if (currentHost.includes('render.com')) {
        // Render deployment
        url = `${currentProtocol}//${currentHost.replace('-frontend', '-backend')}`;
      } else if (currentHost.includes('vercel.app') || currentHost.includes('netlify.app')) {
        // Static frontend deployment - backend might be separate
        // Keep the provided URL or use environment variable
        url = process.env.REACT_APP_BACKEND_URL || backendUrl;
      }
    }
    
    return url;
  }, [backendUrl]);

  // Check current performance mode
  const checkPerformanceMode = async () => {
    try {
      const response = await fetch(`${normalizedBackendUrl}/performance/status`, {
        headers: {
          'ngrok-skip-browser-warning': 'true' // For ngrok deployments
        }
      });
      const data = await response.json();
      
      // Check if it's the optimized version
      const isOptimized = data.mode === 'ultra_fast' || data.ultra_fast_mode;
      setIsUltraFastMode(isOptimized);
      setSystemStatus(data.mode || 'standard');
      setDeploymentInfo(data.deployment_info);
      
      return isOptimized;
    } catch (error) {
      console.error('Failed to check performance mode:', error);
      
      // Fallback: try the health endpoint
      try {
        const healthResponse = await fetch(`${normalizedBackendUrl}/health`);
        const healthData = await healthResponse.json();
        const isOptimized = healthData.mode === 'ultra_fast' || healthData.optimizations;
        setIsUltraFastMode(isOptimized);
        return isOptimized;
      } catch (healthError) {
        console.error('Health check also failed:', healthError);
        return false;
      }
    }
  };

  // Test current latency
  const testLatency = async () => {
    try {
      // Create a small test image
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, 320, 240);
      
      // Convert to blob
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8));
      
      const formData = new FormData();
      formData.append('file', blob, 'test.jpg');
      
      const startTime = Date.now();
      const response = await fetch(`${normalizedBackendUrl}/analyze-image`, {
        method: 'POST',
        body: formData,
        headers: {
          'ngrok-skip-browser-warning': 'true' // For ngrok deployments
        }
      });
      const endTime = Date.now();
      
      if (response.ok) {
        const latency = endTime - startTime;
        setCurrentLatency(latency);
        return latency;
      }
    } catch (error) {
      console.error('Latency test failed:', error);
    }
    return null;
  };

  // Toggle performance mode
  const togglePerformanceMode = async () => {
    setIsLoading(true);
    
    try {
      if (isUltraFastMode) {
        // Switch to Heavy AI mode
        Alert.alert(
          "Switch to Heavy AI Mode?",
          "This will enable advanced AI features but may increase latency to 10-50 seconds per frame. Are you sure?",
          [
            { text: "Cancel", style: "cancel" },
            { 
              text: "Enable Heavy AI", 
              style: "destructive",
              onPress: async () => {
                await enableHeavyAIMode();
              }
            }
          ]
        );
      } else {
        // Switch to Ultra-Fast mode
        Alert.alert(
          "Switch to Ultra-Fast Mode?",
          "This will disable advanced AI features but reduce latency to 50-200ms for real-time performance. Recommended for driving!",
          [
            { text: "Cancel", style: "cancel" },
            { 
              text: "Enable Ultra-Fast", 
              onPress: async () => {
                await enableUltraFastMode();
              }
            }
          ]
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const enableUltraFastMode = async () => {
    try {
      // Call backend endpoint to switch to ultra-fast mode
      const response = await fetch(`${normalizedBackendUrl}/performance/set-ultra-fast`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ 
          enable_ultra_fast: true,
          disable_rag: true,
          disable_knowledge_graph: true,
          disable_ensemble: true,
          yolo_model: 'yolov8n.pt',
          yolo_conf: 0.4,
          yolo_max_det: 20,
          yolo_imgsz: 416
        })
      });

      if (response.ok) {
        setIsUltraFastMode(true);
        Alert.alert("Success", "Ultra-Fast mode enabled! Latency should now be 50-200ms.");
        await testLatency();
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to enable ultra-fast mode');
      }
    } catch (error) {
      console.error('Ultra-fast mode error:', error);
      Alert.alert("Error", `Failed to switch to ultra-fast mode: ${error.message}`);
    }
  };

  const enableHeavyAIMode = async () => {
    try {
      // Call backend endpoint to switch to heavy AI mode
      const response = await fetch(`${normalizedBackendUrl}/performance/set-heavy-ai`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'ngrok-skip-browser-warning': 'true'
        },
        body: JSON.stringify({ 
          enable_ultra_fast: false,
          enable_rag: true,
          enable_knowledge_graph: true,
          enable_ensemble: true,
          yolo_model: 'yolov8s.pt',
          yolo_conf: 0.3,
          yolo_max_det: 60,
          yolo_imgsz: 640
        })
      });

      if (response.ok) {
        setIsUltraFastMode(false);
        Alert.alert("Success", "Heavy AI mode enabled! Advanced features are now active but latency will be higher.");
        await testLatency();
      } else {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to enable heavy AI mode');
      }
    } catch (error) {
      console.error('Heavy AI mode error:', error);
      Alert.alert("Error", `Failed to switch to heavy AI mode: ${error.message}`);
    }
  };

  // Check mode on component mount
  useEffect(() => {
    checkPerformanceMode();
    testLatency();
  }, []);

  const getLatencyColor = (latency) => {
    if (!latency) return '#6B7280';
    if (latency < 500) return '#10B981'; // Green - Excellent
    if (latency < 2000) return '#F59E0B'; // Yellow - Good
    if (latency < 10000) return '#EF4444'; // Red - Poor
    return '#DC2626'; // Dark Red - Unusable
  };

  const getLatencyStatus = (latency) => {
    if (!latency) return 'Unknown';
    if (latency < 500) return 'Excellent';
    if (latency < 2000) return 'Good';
    if (latency < 10000) return 'Poor';
    return 'Unusable';
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🚀 Performance Mode</Text>
        <Pressable 
          style={styles.testButton}
          onPress={testLatency}
          disabled={isLoading}
        >
          <Text style={styles.testButtonText}>Test Latency</Text>
        </Pressable>
      </View>

      {/* Current Status */}
      <View style={styles.statusContainer}>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Current Mode:</Text>
          <View style={[
            styles.statusBadge, 
            { backgroundColor: isUltraFastMode ? '#10B981' : '#8B5CF6' }
          ]}>
            <Text style={styles.statusBadgeText}>
              {isUltraFastMode ? '⚡ Ultra-Fast' : '🤖 Heavy AI'}
            </Text>
          </View>
        </View>

        {currentLatency && (
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Latency:</Text>
            <Text style={[
              styles.latencyText, 
              { color: getLatencyColor(currentLatency) }
            ]}>
              {currentLatency}ms ({getLatencyStatus(currentLatency)})
            </Text>
          </View>
        )}

        {deploymentInfo && (
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Environment:</Text>
            <Text style={styles.deploymentText}>
              {deploymentInfo.platform || deploymentInfo.environment || 'Local'}
            </Text>
          </View>
        )}
      </View>

      {/* Mode Comparison */}
      <View style={styles.comparisonContainer}>
        <View style={styles.modeCard}>
          <View style={styles.modeHeader}>
            <Text style={styles.modeIcon}>⚡</Text>
            <Text style={styles.modeTitle}>Ultra-Fast Mode</Text>
          </View>
          <Text style={styles.modeLatency}>50-200ms latency</Text>
          <View style={styles.featuresList}>
            <Text style={styles.featureEnabled}>✅ Real-time detection</Text>
            <Text style={styles.featureEnabled}>✅ Object tracking</Text>
            <Text style={styles.featureEnabled}>✅ Distance estimation</Text>
            <Text style={styles.featureEnabled}>✅ Risk calculation</Text>
            <Text style={styles.featureDisabled}>❌ RAG enhancement</Text>
            <Text style={styles.featureDisabled}>❌ Knowledge graph</Text>
            <Text style={styles.featureDisabled}>❌ Ensemble detection</Text>
          </View>
          <Text style={styles.modeRecommendation}>
            🚗 Recommended for driving
          </Text>
        </View>

        <View style={styles.modeCard}>
          <View style={styles.modeHeader}>
            <Text style={styles.modeIcon}>🤖</Text>
            <Text style={styles.modeTitle}>Heavy AI Mode</Text>
          </View>
          <Text style={styles.modeLatency}>10-50 seconds latency</Text>
          <View style={styles.featuresList}>
            <Text style={styles.featureEnabled}>✅ All Ultra-Fast features</Text>
            <Text style={styles.featureEnabled}>✅ RAG enhancement</Text>
            <Text style={styles.featureEnabled}>✅ Knowledge graph reasoning</Text>
            <Text style={styles.featureEnabled}>✅ Ensemble detection</Text>
            <Text style={styles.featureEnabled}>✅ Learning systems</Text>
            <Text style={styles.featureEnabled}>✅ Advanced analytics</Text>
          </View>
          <Text style={styles.modeRecommendation}>
            🔬 For analysis & testing only
          </Text>
        </View>
      </View>

      {/* Toggle Button */}
      <Pressable 
        style={[
          styles.toggleButton,
          { backgroundColor: isUltraFastMode ? '#8B5CF6' : '#10B981' },
          isLoading && styles.toggleButtonDisabled
        ]}
        onPress={togglePerformanceMode}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Text style={styles.toggleButtonIcon}>
              {isUltraFastMode ? '🤖' : '⚡'}
            </Text>
            <Text style={styles.toggleButtonText}>
              Switch to {isUltraFastMode ? 'Heavy AI' : 'Ultra-Fast'} Mode
            </Text>
          </>
        )}
      </Pressable>

      {/* Warning */}
      {!isUltraFastMode && (
        <View style={styles.warningContainer}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={styles.warningText}>
            Heavy AI mode has high latency and is NOT suitable for real-time driving!
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 12,
    padding: 16,
    margin: 16,
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.3)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  testButton: {
    backgroundColor: 'rgba(34, 211, 238, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#22D3EE',
  },
  testButtonText: {
    color: '#22D3EE',
    fontSize: 12,
    fontWeight: '600',
  },
  statusContainer: {
    backgroundColor: 'rgba(30, 41, 59, 0.5)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusLabel: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  latencyText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  deploymentText: {
    color: '#22D3EE',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  comparisonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  modeCard: {
    flex: 1,
    backgroundColor: 'rgba(30, 41, 59, 0.3)',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.2)',
  },
  modeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  modeIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  modeTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  modeLatency: {
    color: '#22D3EE',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  featuresList: {
    marginBottom: 8,
  },
  featureEnabled: {
    color: '#10B981',
    fontSize: 10,
    marginBottom: 2,
  },
  featureDisabled: {
    color: '#6B7280',
    fontSize: 10,
    marginBottom: 2,
  },
  modeRecommendation: {
    color: '#F59E0B',
    fontSize: 10,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  toggleButtonDisabled: {
    opacity: 0.6,
  },
  toggleButtonIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  toggleButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 6,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  warningIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  warningText: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
});

export default PerformanceToggle;