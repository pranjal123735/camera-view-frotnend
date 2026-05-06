/**
 * Enhanced Dashboard with Modern UI Components
 * Provides comprehensive analytics, real-time metrics, and interactive visualizations
 */
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native';

const { width: screenWidth } = Dimensions.get('window');

// Status Card Component
const StatusCard = ({ title, value, trend, color, subtitle, icon }) => (
  <View style={[styles.statusCard, { borderLeftColor: color }]}>
    <View style={styles.statusCardHeader}>
      <Text style={styles.statusCardIcon}>{icon}</Text>
      <View style={styles.statusCardTitleContainer}>
        <Text style={styles.statusCardTitle}>{title}</Text>
        {subtitle && <Text style={styles.statusCardSubtitle}>{subtitle}</Text>}
      </View>
    </View>
    <Text style={[styles.statusCardValue, { color }]}>{value}</Text>
    {trend !== undefined && (
      <View style={styles.trendContainer}>
        <Text style={[styles.trendText, { color: trend >= 0 ? '#10B981' : '#EF4444' }]}>
          {trend >= 0 ? '↗' : '↘'} {Math.abs(trend).toFixed(1)}%
        </Text>
      </View>
    )}
  </View>
);

// Metric Card Component
const MetricCard = ({ title, value, unit, color = '#22D3EE', size = 'normal' }) => (
  <View style={[styles.metricCard, size === 'small' && styles.metricCardSmall]}>
    <Text style={styles.metricCardTitle}>{title}</Text>
    <View style={styles.metricCardValueContainer}>
      <Text style={[styles.metricCardValue, { color }, size === 'small' && styles.metricCardValueSmall]}>
        {value}
      </Text>
      {unit && <Text style={styles.metricCardUnit}>{unit}</Text>}
    </View>
  </View>
);

// Progress Ring Component
const ProgressRing = ({ progress, size = 60, strokeWidth = 4, color = '#22D3EE' }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <View style={[styles.progressRing, { width: size, height: size }]}>
      <svg width={size} height={size} style={styles.progressSvg}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={strokeDasharray}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <Text style={[styles.progressText, { color }]}>{Math.round(progress)}%</Text>
    </View>
  );
};

// Chart Component (simplified line chart)
const MiniChart = ({ data, color = '#22D3EE', height = 40 }) => {
  if (!data || data.length < 2) return null;

  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * 100;
    const y = ((max - value) / range) * height;
    return `${x},${y}`;
  }).join(' ');

  return (
    <View style={[styles.miniChart, { height }]}>
      <svg width="100%" height={height} style={styles.chartSvg}>
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </View>
  );
};

// Alert Component
const AlertCard = ({ alert, onDismiss }) => {
  const severityColors = {
    CRITICAL: '#DC2626',
    HIGH: '#EF4444',
    MEDIUM: '#F59E0B',
    LOW: '#10B981'
  };

  const severityIcons = {
    CRITICAL: '🚨',
    HIGH: '⚠️',
    MEDIUM: '⚡',
    LOW: 'ℹ️'
  };

  return (
    <View style={[styles.alertCard, { borderLeftColor: severityColors[alert.severity] }]}>
      <View style={styles.alertHeader}>
        <Text style={styles.alertIcon}>{severityIcons[alert.severity]}</Text>
        <View style={styles.alertContent}>
          <Text style={styles.alertTitle}>{alert.alert_type.replace('_', ' ').toUpperCase()}</Text>
          <Text style={styles.alertMessage}>{alert.message}</Text>
          {alert.recommended_actions && (
            <Text style={styles.alertActions}>
              Recommended: {alert.recommended_actions.join(', ')}
            </Text>
          )}
        </View>
        <Pressable onPress={() => onDismiss(alert.alert_id)} style={styles.alertDismiss}>
          <Text style={styles.alertDismissText}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
};

// Main Enhanced Dashboard Component
export default function EnhancedDashboard({
  detections = [],
  analytics = {},
  safetyMetrics = {},
  aiStats = {},
  alerts = [],
  onDismissAlert,
  isRunning = false,
  frameDiagnostics = null,
  compact = false
}) {
  const [selectedTab, setSelectedTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);

  // Calculate derived metrics
  const totalObjects = detections.length;
  const movingObjects = detections.filter(d => d.is_moving).length;
  const highRiskObjects = detections.filter(d => d.risk_percent > 70).length;
  const averageRisk = detections.length > 0 
    ? detections.reduce((sum, d) => sum + d.risk_percent, 0) / detections.length 
    : 0;

  const safetyScore = safetyMetrics.safety_score || 85;
  const detectionAccuracy = analytics.detection_accuracy || 0.87;
  const aiEnhancementRate = aiStats.ensemble_consensus_rate || 0.75;

  // Trend calculations (mock data for demo)
  const safetyTrend = 2.3;
  const accuracyTrend = 1.8;
  const riskTrend = -0.5;

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'safety', label: 'Safety', icon: '🛡️' },
    { id: 'ai', label: 'AI Stats', icon: '🤖' },
    { id: 'alerts', label: 'Alerts', icon: '🚨', badge: alerts.length }
  ];

  const renderOverviewTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* Status Cards Row */}
      <View style={styles.statusRow}>
        <StatusCard
          title="Detection Status"
          value={isRunning ? 'ACTIVE' : 'STANDBY'}
          color={isRunning ? '#10B981' : '#6B7280'}
          subtitle={`${totalObjects} objects detected`}
          icon="👁️"
        />
        <StatusCard
          title="Safety Score"
          value={`${Math.round(safetyScore)}/100`}
          trend={safetyTrend}
          color={safetyScore > 80 ? '#10B981' : safetyScore > 60 ? '#F59E0B' : '#EF4444'}
          subtitle="Current trip"
          icon="🛡️"
        />
      </View>

      {/* Metrics Grid */}
      <View style={styles.metricsGrid}>
        <MetricCard title="Objects" value={totalObjects} color="#22D3EE" />
        <MetricCard title="Moving" value={movingObjects} color="#10B981" />
        <MetricCard title="High Risk" value={highRiskObjects} color="#EF4444" />
        <MetricCard title="Avg Risk" value={`${Math.round(averageRisk)}%`} color="#F59E0B" />
      </View>

      {/* Performance Indicators */}
      <View style={styles.performanceSection}>
        <Text style={styles.sectionTitle}>Performance Indicators</Text>
        <View style={styles.performanceGrid}>
          <View style={styles.performanceCard}>
            <ProgressRing progress={detectionAccuracy * 100} color="#22D3EE" />
            <Text style={styles.performanceLabel}>Detection Accuracy</Text>
          </View>
          <View style={styles.performanceCard}>
            <ProgressRing progress={aiEnhancementRate * 100} color="#10B981" />
            <Text style={styles.performanceLabel}>AI Enhancement</Text>
          </View>
          <View style={styles.performanceCard}>
            <ProgressRing progress={safetyScore} color="#F59E0B" />
            <Text style={styles.performanceLabel}>Safety Score</Text>
          </View>
        </View>
      </View>

      {/* Scene Analysis */}
      {frameDiagnostics && (
        <View style={styles.sceneSection}>
          <Text style={styles.sectionTitle}>Scene Analysis</Text>
          <View style={styles.sceneGrid}>
            <MetricCard 
              title="Brightness" 
              value={Math.round(frameDiagnostics.brightness_01 * 100)} 
              unit="%" 
              size="small"
              color={frameDiagnostics.low_light ? '#F59E0B' : '#10B981'}
            />
            <MetricCard 
              title="Quality" 
              value={frameDiagnostics.quality_hint.toUpperCase()} 
              size="small"
              color={frameDiagnostics.quality_hint === 'ok' ? '#10B981' : '#F59E0B'}
            />
            <MetricCard 
              title="Glare Risk" 
              value={frameDiagnostics.glare_risk ? 'YES' : 'NO'} 
              size="small"
              color={frameDiagnostics.glare_risk ? '#EF4444' : '#10B981'}
            />
            <MetricCard 
              title="Contrast" 
              value={frameDiagnostics.low_contrast ? 'LOW' : 'OK'} 
              size="small"
              color={frameDiagnostics.low_contrast ? '#F59E0B' : '#10B981'}
            />
          </View>
        </View>
      )}
    </ScrollView>
  );

  const renderSafetyTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.safetyOverview}>
        <StatusCard
          title="Safety Status"
          value={safetyScore > 80 ? 'EXCELLENT' : safetyScore > 60 ? 'GOOD' : 'NEEDS ATTENTION'}
          color={safetyScore > 80 ? '#10B981' : safetyScore > 60 ? '#F59E0B' : '#EF4444'}
          subtitle={`${safetyMetrics.near_misses || 0} near misses today`}
          icon="🛡️"
        />
      </View>

      <View style={styles.safetyMetrics}>
        <Text style={styles.sectionTitle}>Safety Metrics</Text>
        <View style={styles.metricsGrid}>
          <MetricCard title="Danger Events" value={safetyMetrics.danger_events || 0} color="#EF4444" />
          <MetricCard title="Caution Events" value={safetyMetrics.caution_events || 0} color="#F59E0B" />
          <MetricCard title="Near Misses" value={safetyMetrics.near_misses || 0} color="#F97316" />
          <MetricCard title="Safe Events" value={safetyMetrics.total_detections - (safetyMetrics.danger_events || 0) - (safetyMetrics.caution_events || 0) || 0} color="#10B981" />
        </View>
      </View>

      {safetyMetrics.most_common_threats && (
        <View style={styles.threatsSection}>
          <Text style={styles.sectionTitle}>Most Common Threats</Text>
          {safetyMetrics.most_common_threats.slice(0, 5).map((threat, index) => (
            <View key={threat} style={styles.threatItem}>
              <Text style={styles.threatRank}>{index + 1}</Text>
              <Text style={styles.threatName}>{threat.toUpperCase()}</Text>
              <View style={styles.threatBar}>
                <View 
                  style={[
                    styles.threatBarFill, 
                    { width: `${Math.max(20, 100 - index * 15)}%` }
                  ]} 
                />
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );

  const renderAITab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.aiOverview}>
        <StatusCard
          title="AI Enhancement"
          value={`${Math.round(aiEnhancementRate * 100)}%`}
          trend={1.2}
          color="#8B5CF6"
          subtitle="Accuracy improvement"
          icon="🤖"
        />
      </View>

      <View style={styles.aiMetrics}>
        <Text style={styles.sectionTitle}>AI Statistics</Text>
        <View style={styles.metricsGrid}>
          <MetricCard title="RAG Corrections" value={aiStats.rag_corrections || 0} color="#8B5CF6" />
          <MetricCard title="KG Validations" value={aiStats.knowledge_graph_validations || 0} color="#06B6D4" />
          <MetricCard title="Ensemble Rate" value={`${Math.round((aiStats.ensemble_consensus_rate || 0) * 100)}%`} color="#10B981" />
          <MetricCard title="Temporal Fixes" value={aiStats.temporal_consistency_improvements || 0} color="#F59E0B" />
        </View>
      </View>

      <View style={styles.aiPipeline}>
        <Text style={styles.sectionTitle}>AI Processing Pipeline</Text>
        <View style={styles.pipelineSteps}>
          {['YOLO Detection', 'RAG Enhancement', 'Knowledge Graph', 'Ensemble Fusion', 'Temporal Smoothing'].map((step, index) => (
            <View key={step} style={styles.pipelineStep}>
              <View style={[styles.pipelineStepIndicator, { backgroundColor: '#22D3EE' }]}>
                <Text style={styles.pipelineStepNumber}>{index + 1}</Text>
              </View>
              <Text style={styles.pipelineStepText}>{step}</Text>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );

  const renderAlertsTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      {alerts.length === 0 ? (
        <View style={styles.noAlertsContainer}>
          <Text style={styles.noAlertsIcon}>✅</Text>
          <Text style={styles.noAlertsTitle}>All Clear</Text>
          <Text style={styles.noAlertsMessage}>No active safety alerts</Text>
        </View>
      ) : (
        <View style={styles.alertsList}>
          <Text style={styles.sectionTitle}>Active Alerts ({alerts.length})</Text>
          {alerts.map(alert => (
            <AlertCard
              key={alert.alert_id}
              alert={alert}
              onDismiss={onDismissAlert}
            />
          ))}
        </View>
      )}
    </ScrollView>
  );

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {/* Header */}
      {!compact && (
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Car Vision Dashboard</Text>
          <View style={styles.headerStatus}>
            <View style={[styles.statusDot, { backgroundColor: isRunning ? '#10B981' : '#6B7280' }]} />
            <Text style={styles.headerStatusText}>{isRunning ? 'LIVE' : 'STANDBY'}</Text>
          </View>
        </View>
      )}

      {/* Tab Navigation */}
      <View style={[styles.tabNavigation, compact && styles.tabNavigationCompact]}>
        {tabs.map(tab => (
          <Pressable
            key={tab.id}
            style={[styles.tab, selectedTab === tab.id && styles.activeTab, compact && styles.tabCompact]}
            onPress={() => setSelectedTab(tab.id)}
          >
            <Text style={[styles.tabIcon, compact && styles.tabIconCompact]}>{tab.icon}</Text>
            {!compact && (
              <Text style={[styles.tabLabel, selectedTab === tab.id && styles.activeTabLabel]}>
                {tab.label}
              </Text>
            )}
            {tab.badge > 0 && (
              <View style={styles.tabBadge}>
                <Text style={styles.tabBadgeText}>{tab.badge}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>

      {/* Tab Content */}
      <View style={[styles.tabContainer, compact && styles.tabContainerCompact]}>
        {selectedTab === 'overview' && renderOverviewTab()}
        {selectedTab === 'safety' && renderSafetyTab()}
        {selectedTab === 'ai' && renderAITab()}
        {selectedTab === 'alerts' && renderAlertsTab()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  containerCompact: {
    maxHeight: 350,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(45, 212, 191, 0.2)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  headerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  headerStatusText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
  },
  tabNavigation: {
    flexDirection: 'row',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  tabNavigationCompact: {
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    position: 'relative',
  },
  tabCompact: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  activeTab: {
    backgroundColor: 'rgba(34, 211, 238, 0.1)',
  },
  tabIcon: {
    fontSize: 16,
    marginRight: 4,
  },
  tabIconCompact: {
    fontSize: 14,
    marginRight: 0,
  },
  tabLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  activeTabLabel: {
    color: '#22D3EE',
    fontWeight: '600',
  },
  tabBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  tabContainer: {
    flex: 1,
  },
  tabContainerCompact: {
    maxHeight: 280,
  },
  tabContent: {
    flex: 1,
    padding: 16,
  },
  statusRow: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 12,
  },
  statusCard: {
    flex: 1,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
  },
  statusCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusCardIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  statusCardTitleContainer: {
    flex: 1,
  },
  statusCardTitle: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '600',
  },
  statusCardSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 2,
  },
  statusCardValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  trendContainer: {
    alignSelf: 'flex-start',
  },
  trendText: {
    fontSize: 12,
    fontWeight: '600',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  metricCard: {
    flex: 1,
    minWidth: (screenWidth - 56) / 2,
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  metricCardSmall: {
    minWidth: (screenWidth - 72) / 4,
  },
  metricCardTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 8,
    textAlign: 'center',
  },
  metricCardValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  metricCardValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  metricCardValueSmall: {
    fontSize: 16,
  },
  metricCardUnit: {
    color: '#94A3B8',
    fontSize: 12,
    marginLeft: 2,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  performanceSection: {
    marginBottom: 20,
  },
  performanceGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  performanceCard: {
    alignItems: 'center',
  },
  performanceLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  progressRing: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressSvg: {
    position: 'absolute',
  },
  progressText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  sceneSection: {
    marginBottom: 20,
  },
  sceneGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  safetyOverview: {
    marginBottom: 20,
  },
  safetyMetrics: {
    marginBottom: 20,
  },
  threatsSection: {
    marginBottom: 20,
  },
  threatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(30, 41, 59, 0.4)',
    borderRadius: 8,
    marginBottom: 8,
  },
  threatRank: {
    color: '#22D3EE',
    fontSize: 16,
    fontWeight: 'bold',
    width: 24,
  },
  threatName: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    marginLeft: 12,
  },
  threatBar: {
    width: 60,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  threatBarFill: {
    height: '100%',
    backgroundColor: '#EF4444',
  },
  aiOverview: {
    marginBottom: 20,
  },
  aiMetrics: {
    marginBottom: 20,
  },
  aiPipeline: {
    marginBottom: 20,
  },
  pipelineSteps: {
    gap: 12,
  },
  pipelineStep: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  pipelineStepIndicator: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  pipelineStepNumber: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  pipelineStepText: {
    color: '#E2E8F0',
    fontSize: 14,
    fontWeight: '500',
  },
  noAlertsContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  noAlertsIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  noAlertsTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  noAlertsMessage: {
    color: '#94A3B8',
    fontSize: 14,
  },
  alertsList: {
    gap: 12,
  },
  alertCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  alertIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  alertMessage: {
    color: '#E2E8F0',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
  },
  alertActions: {
    color: '#94A3B8',
    fontSize: 12,
    fontStyle: 'italic',
  },
  alertDismiss: {
    padding: 4,
  },
  alertDismissText: {
    color: '#94A3B8',
    fontSize: 16,
  },
  miniChart: {
    width: '100%',
    overflow: 'hidden',
  },
  chartSvg: {
    width: '100%',
    height: '100%',
  },
});