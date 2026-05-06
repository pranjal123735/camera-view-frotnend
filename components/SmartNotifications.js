/**
 * Smart Notifications & Alerts System
 * Provides contextual, intelligent alerts with recommended actions
 */
import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Animated, 
  Pressable, 
  Dimensions,
  Platform 
} from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Alert severity configurations
const ALERT_CONFIGS = {
  CRITICAL: {
    color: '#DC2626',
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    borderColor: '#DC2626',
    icon: '🚨',
    vibrationPattern: [0, 200, 100, 200, 100, 200],
    soundEnabled: true,
    autoHide: false,
    priority: 1
  },
  HIGH: {
    color: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: '#EF4444',
    icon: '⚠️',
    vibrationPattern: [0, 150, 100, 150],
    soundEnabled: true,
    autoHide: 8000,
    priority: 2
  },
  MEDIUM: {
    color: '#F59E0B',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: '#F59E0B',
    icon: '⚡',
    vibrationPattern: [0, 100],
    soundEnabled: false,
    autoHide: 6000,
    priority: 3
  },
  LOW: {
    color: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: '#10B981',
    icon: 'ℹ️',
    vibrationPattern: null,
    soundEnabled: false,
    autoHide: 4000,
    priority: 4
  }
};

// Alert type configurations
const ALERT_TYPES = {
  collision_warning: {
    title: 'Collision Warning',
    description: 'Potential collision detected',
    actionable: true
  },
  blind_spot: {
    title: 'Blind Spot Alert',
    description: 'Object in blind spot',
    actionable: true
  },
  speed_warning: {
    title: 'Speed Alert',
    description: 'Speed limit exceeded',
    actionable: true
  },
  weather_warning: {
    title: 'Weather Alert',
    description: 'Adverse weather conditions',
    actionable: true
  },
  fatigue_detection: {
    title: 'Fatigue Alert',
    description: 'Driver fatigue detected',
    actionable: true
  },
  system_status: {
    title: 'System Status',
    description: 'System information',
    actionable: false
  }
};

// Individual Alert Component
const SmartAlert = ({ 
  alert, 
  onDismiss, 
  onAction, 
  style,
  compact = false 
}) => {
  const slideAnim = useRef(new Animated.Value(-screenWidth)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [isVisible, setIsVisible] = useState(true);

  const config = ALERT_CONFIGS[alert.severity] || ALERT_CONFIGS.MEDIUM;
  const typeConfig = ALERT_TYPES[alert.alert_type] || ALERT_TYPES.system_status;

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start();

    // Pulse animation for critical alerts
    if (alert.severity === 'CRITICAL') {
      const pulse = Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        })
      ]);
      
      Animated.loop(pulse).start();
    }

    // Haptic feedback
    if (Platform.OS === 'web' && navigator.vibrate && config.vibrationPattern) {
      navigator.vibrate(config.vibrationPattern);
    }

    // Auto-hide timer
    if (config.autoHide) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, config.autoHide);

      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: screenWidth,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      })
    ]).start(() => {
      setIsVisible(false);
      onDismiss(alert.alert_id);
    });
  };

  const handleAction = (action) => {
    onAction(alert.alert_id, action);
  };

  if (!isVisible) return null;

  return (
    <Animated.View
      style={[
        styles.alertContainer,
        {
          backgroundColor: config.backgroundColor,
          borderColor: config.borderColor,
          transform: [
            { translateX: slideAnim },
            { scale: pulseAnim }
          ],
          opacity: opacityAnim,
        },
        compact && styles.alertContainerCompact,
        style
      ]}
    >
      {/* Alert Header */}
      <View style={styles.alertHeader}>
        <Text style={styles.alertIcon}>{config.icon}</Text>
        <View style={styles.alertContent}>
          <View style={styles.alertTitleRow}>
            <Text style={[styles.alertTitle, { color: config.color }]}>
              {typeConfig.title}
            </Text>
            <Text style={styles.alertSeverity}>{alert.severity}</Text>
          </View>
          <Text style={styles.alertMessage} numberOfLines={compact ? 2 : 3}>
            {alert.message}
          </Text>
          {alert.object_involved && (
            <Text style={styles.alertObject}>
              Object: {alert.object_involved.label} at {alert.object_involved.distance_m?.toFixed(1)}m
            </Text>
          )}
        </View>
        <Pressable onPress={handleDismiss} style={styles.dismissButton}>
          <Text style={styles.dismissText}>✕</Text>
        </Pressable>
      </View>

      {/* Recommended Actions */}
      {alert.recommended_actions && alert.recommended_actions.length > 0 && !compact && (
        <View style={styles.actionsContainer}>
          <Text style={styles.actionsTitle}>Recommended Actions:</Text>
          <View style={styles.actionsList}>
            {alert.recommended_actions.slice(0, 3).map((action, index) => (
              <Pressable
                key={index}
                style={[styles.actionButton, { borderColor: config.color }]}
                onPress={() => handleAction(action)}
              >
                <Text style={[styles.actionText, { color: config.color }]}>
                  {action.replace(/_/g, ' ')}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Progress bar for auto-hide */}
      {config.autoHide && (
        <View style={styles.progressContainer}>
          <Animated.View
            style={[
              styles.progressBar,
              { backgroundColor: config.color }
            ]}
          />
        </View>
      )}
    </Animated.View>
  );
};

// Alert Queue Manager Component
const AlertQueue = ({ alerts, onDismiss, onAction, maxVisible = 3 }) => {
  const [visibleAlerts, setVisibleAlerts] = useState([]);

  useEffect(() => {
    // Sort alerts by priority and timestamp
    const sortedAlerts = [...alerts].sort((a, b) => {
      const priorityA = ALERT_CONFIGS[a.severity]?.priority || 5;
      const priorityB = ALERT_CONFIGS[b.severity]?.priority || 5;
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB; // Lower number = higher priority
      }
      
      return b.timestamp - a.timestamp; // Newer alerts first
    });

    setVisibleAlerts(sortedAlerts.slice(0, maxVisible));
  }, [alerts, maxVisible]);

  return (
    <View style={styles.alertQueue}>
      {visibleAlerts.map((alert, index) => (
        <SmartAlert
          key={alert.alert_id}
          alert={alert}
          onDismiss={onDismiss}
          onAction={onAction}
          compact={index > 0} // First alert is full size, others are compact
          style={{ 
            marginTop: index > 0 ? 8 : 0,
            zIndex: visibleAlerts.length - index
          }}
        />
      ))}
      
      {alerts.length > maxVisible && (
        <View style={styles.moreAlertsIndicator}>
          <Text style={styles.moreAlertsText}>
            +{alerts.length - maxVisible} more alerts
          </Text>
        </View>
      )}
    </View>
  );
};

// Voice Alert Component
const VoiceAlert = ({ alert, enabled = true }) => {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.speechSynthesis) {
      return;
    }

    const config = ALERT_CONFIGS[alert.severity];
    if (!config.soundEnabled) return;

    const message = `${alert.severity} alert. ${alert.message}`;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = alert.severity === 'CRITICAL' ? 1.2 : 1.0;
    utterance.pitch = alert.severity === 'CRITICAL' ? 1.2 : 1.0;
    utterance.volume = alert.severity === 'CRITICAL' ? 1.0 : 0.8;
    
    window.speechSynthesis.speak(utterance);
  }, [alert, enabled]);

  return null; // This component doesn't render anything
};

// Main Smart Notifications Component
export default function SmartNotifications({
  alerts = [],
  onDismissAlert,
  onAlertAction,
  voiceEnabled = true,
  position = 'top', // 'top', 'bottom', 'center'
  maxVisible = 3,
  style
}) {
  const [activeAlerts, setActiveAlerts] = useState([]);

  useEffect(() => {
    setActiveAlerts(alerts);
  }, [alerts]);

  const handleDismiss = (alertId) => {
    setActiveAlerts(prev => prev.filter(alert => alert.alert_id !== alertId));
    onDismissAlert?.(alertId);
  };

  const handleAction = (alertId, action) => {
    onAlertAction?.(alertId, action);
    
    // Auto-dismiss after action for non-critical alerts
    const alert = activeAlerts.find(a => a.alert_id === alertId);
    if (alert && alert.severity !== 'CRITICAL') {
      setTimeout(() => handleDismiss(alertId), 1000);
    }
  };

  const positionStyle = {
    top: { top: 60, left: 16, right: 16 },
    bottom: { bottom: 60, left: 16, right: 16 },
    center: { 
      top: screenHeight / 2 - 100, 
      left: 16, 
      right: 16 
    }
  };

  return (
    <View style={[styles.container, positionStyle[position], style]} pointerEvents="box-none">
      {/* Voice alerts for each active alert */}
      {activeAlerts.map(alert => (
        <VoiceAlert
          key={`voice-${alert.alert_id}`}
          alert={alert}
          enabled={voiceEnabled}
        />
      ))}
      
      {/* Visual alert queue */}
      <AlertQueue
        alerts={activeAlerts}
        onDismiss={handleDismiss}
        onAction={handleAction}
        maxVisible={maxVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 1000,
  },
  alertQueue: {
    gap: 8,
  },
  alertContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  alertContainerCompact: {
    padding: 12,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  alertIcon: {
    fontSize: 24,
    marginRight: 12,
    marginTop: 2,
  },
  alertContent: {
    flex: 1,
  },
  alertTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  alertSeverity: {
    fontSize: 10,
    fontWeight: '600',
    color: '#94A3B8',
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  alertMessage: {
    color: '#E2E8F0',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  alertObject: {
    color: '#94A3B8',
    fontSize: 12,
    fontStyle: 'italic',
  },
  dismissButton: {
    padding: 4,
    marginLeft: 8,
  },
  dismissText: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: 'bold',
  },
  actionsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.2)',
  },
  actionsTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  actionsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  progressContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    width: '100%',
  },
  moreAlertsIndicator: {
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.3)',
  },
  moreAlertsText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
});

// Export utility functions for creating alerts
export const createAlert = (type, severity, message, options = {}) => ({
  alert_id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  timestamp: Date.now(),
  alert_type: type,
  severity,
  message,
  object_involved: options.object,
  recommended_actions: options.actions || [],
  auto_dismiss_time: options.autoDismiss,
  ...options
});

export const ALERT_SEVERITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW'
};

export const ALERT_TYPE = {
  COLLISION_WARNING: 'collision_warning',
  BLIND_SPOT: 'blind_spot',
  SPEED_WARNING: 'speed_warning',
  WEATHER_WARNING: 'weather_warning',
  FATIGUE_DETECTION: 'fatigue_detection',
  SYSTEM_STATUS: 'system_status'
};