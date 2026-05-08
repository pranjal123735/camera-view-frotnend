/**
 * Performance Monitor Component
 * Shows real-time latency and performance metrics
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';

const PerformanceMonitor = ({ 
  detections = [], 
  processingTime = 0, 
  isActive = false,
  backendUrl = '' 
}) => {
  const [metrics, setMetrics] = useState({
    fps: 0,
    avgLatency: 0,
    detectionCount: 0,
    backendLatency: 0,
    renderTime: 0
  });
  
  const frameCount = useRef(0);
  const lastFpsUpdate = useRef(Date.now());
  const latencyHistory = useRef([]);
  const renderStartTime = useRef(0);
  
  // Track FPS
  useEffect(() => {
    if (!isActive) return;
    
    frameCount.current++;
    const now = Date.now();
    
    if (now - lastFpsUpdate.current >= 1000) {
      const fps = frameCount.current;
      frameCount.current = 0;
      lastFpsUpdate.current = now;
      
      setMetrics(prev => ({ ...prev, fps }));
    }
  }, [detections, isActive]);
  
  // Track latency
  useEffect(() => {
    if (processingTime > 0) {
      latencyHistory.current.push(processingTime);
      if (latencyHistory.current.length > 10) {
        latencyHistory.current.shift();
      }
      
      const avgLatency = latencyHistory.current.reduce((a, b) => a + b, 0) / latencyHistory.current.length;
      
      setMetrics(prev => ({
        ...prev,
        avgLatency: Math.round(avgLatency),
        detectionCount: detections.length,
        backendLatency: processingTime
      }));
    }
  }, [processingTime, detections.length]);
  
  // Track render performance
  useEffect(() => {
    renderStartTime.current = performance.now();
    
    return () => {
      const renderTime = performance.now() - renderStartTime.current;
      setMetrics(prev => ({ ...prev, renderTime: Math.round(renderTime) }));
    };
  });
  
  if (!isActive) return null;
  
  const getLatencyColor = (latency) => {
    if (latency < 50) return '#4CAF50';  // Green - Excellent
    if (latency < 100) return '#FFC107'; // Yellow - Good
    if (latency < 200) return '#FF9800'; // Orange - Fair
    return '#F44336';                    // Red - Poor
  };
  
  const getFpsColor = (fps) => {
    if (fps >= 30) return '#4CAF50';     // Green - Smooth
    if (fps >= 20) return '#FFC107';     // Yellow - Acceptable
    if (fps >= 15) return '#FF9800';     // Orange - Choppy
    return '#F44336';                    // Red - Poor
  };
  
  return (
    <View style={styles.container}>
      <Text style={styles.title}>⚡ Performance</Text>
      
      <View style={styles.metricsRow}>
        <View style={styles.metric}>
          <Text style={[styles.value, { color: getFpsColor(metrics.fps) }]}>
            {metrics.fps}
          </Text>
          <Text style={styles.label}>FPS</Text>
        </View>
        
        <View style={styles.metric}>
          <Text style={[styles.value, { color: getLatencyColor(metrics.avgLatency) }]}>
            {metrics.avgLatency}
          </Text>
          <Text style={styles.label}>ms</Text>
        </View>
        
        <View style={styles.metric}>
          <Text style={[styles.value, { color: '#2196F3' }]}>
            {metrics.detectionCount}
          </Text>
          <Text style={styles.label}>Objects</Text>
        </View>
      </View>
      
      <View style={styles.detailsRow}>
        <Text style={styles.detail}>
          Backend: {metrics.backendLatency}ms
        </Text>
        <Text style={styles.detail}>
          Render: {metrics.renderTime}ms
        </Text>
      </View>
      
      {/* Latency indicator */}
      <View style={styles.latencyBar}>
        <View 
          style={[
            styles.latencyFill, 
            { 
              width: `${Math.min(100, (metrics.avgLatency / 200) * 100)}%`,
              backgroundColor: getLatencyColor(metrics.avgLatency)
            }
          ]} 
        />
      </View>
      
      <Text style={styles.status}>
        {metrics.avgLatency < 50 ? '🚀 Ultra Fast' :
         metrics.avgLatency < 100 ? '⚡ Fast' :
         metrics.avgLatency < 200 ? '⏱️ Normal' : '🐌 Slow'}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    borderRadius: 8,
    padding: 12,
    minWidth: 180,
    zIndex: 1000,
  },
  title: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metric: {
    alignItems: 'center',
    flex: 1,
  },
  value: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  label: {
    color: '#cccccc',
    fontSize: 10,
    marginTop: 2,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detail: {
    color: '#aaaaaa',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  latencyBar: {
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    marginBottom: 6,
    overflow: 'hidden',
  },
  latencyFill: {
    height: '100%',
    borderRadius: 2,
  },
  status: {
    color: '#ffffff',
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '500',
  },
});

export default PerformanceMonitor;