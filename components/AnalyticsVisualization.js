/**
 * Analytics Visualization Component
 * Provides interactive charts, graphs, and data visualizations
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  Platform
} from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Chart Components (simplified implementations for React Native)
const LineChart = ({ data, color = '#22D3EE', height = 120, showGrid = true }) => {
  if (!data || data.length < 2) {
    return (
      <View style={[styles.chartContainer, { height }]}>
        <Text style={styles.noDataText}>No data available</Text>
      </View>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value));
  const minValue = Math.min(...data.map(d => d.value));
  const range = maxValue - minValue || 1;

  const chartWidth = screenWidth - 80;
  const chartHeight = height - 40;

  const points = data.map((item, index) => {
    const x = (index / (data.length - 1)) * chartWidth;
    const y = chartHeight - ((item.value - minValue) / range) * chartHeight;
    return { x, y, value: item.value, label: item.label };
  });

  return (
    <View style={[styles.chartContainer, { height }]}>
      {Platform.OS === 'web' && (
        <svg width={chartWidth} height={chartHeight} style={styles.chartSvg}>
          {/* Grid lines */}
          {showGrid && (
            <g>
              {[0, 0.25, 0.5, 0.75, 1].map(ratio => (
                <line
                  key={ratio}
                  x1={0}
                  y1={chartHeight * ratio}
                  x2={chartWidth}
                  y2={chartHeight * ratio}
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="1"
                />
              ))}
              {[0, 0.25, 0.5, 0.75, 1].map(ratio => (
                <line
                  key={ratio}
                  x1={chartWidth * ratio}
                  y1={0}
                  x2={chartWidth * ratio}
                  y2={chartHeight}
                  stroke="rgba(255,255,255,0.1)"
                  strokeWidth="1"
                />
              ))}
            </g>
          )}
          
          {/* Data line */}
          <polyline
            points={points.map(p => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          
          {/* Data points */}
          {points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r="4"
              fill={color}
              stroke="#FFFFFF"
              strokeWidth="2"
            />
          ))}
        </svg>
      )}
      
      {/* Fallback for non-web platforms */}
      {Platform.OS !== 'web' && (
        <View style={styles.chartFallback}>
          <Text style={styles.chartFallbackText}>Chart visualization available on web</Text>
          <View style={styles.dataPoints}>
            {data.slice(-5).map((item, index) => (
              <View key={index} style={styles.dataPoint}>
                <Text style={styles.dataPointLabel}>{item.label}</Text>
                <Text style={styles.dataPointValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

const BarChart = ({ data, color = '#10B981', height = 120 }) => {
  if (!data || data.length === 0) {
    return (
      <View style={[styles.chartContainer, { height }]}>
        <Text style={styles.noDataText}>No data available</Text>
      </View>
    );
  }

  const maxValue = Math.max(...data.map(d => d.value));
  const chartWidth = screenWidth - 80;
  const chartHeight = height - 40;
  const barWidth = chartWidth / data.length * 0.8;

  return (
    <View style={[styles.chartContainer, { height }]}>
      {Platform.OS === 'web' && (
        <svg width={chartWidth} height={chartHeight} style={styles.chartSvg}>
          {data.map((item, index) => {
            const barHeight = (item.value / maxValue) * chartHeight;
            const x = (index / data.length) * chartWidth + (chartWidth / data.length - barWidth) / 2;
            const y = chartHeight - barHeight;
            
            return (
              <g key={index}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={color}
                  rx="2"
                />
                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 15}
                  textAnchor="middle"
                  fill="#94A3B8"
                  fontSize="10"
                >
                  {item.label}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      
      {Platform.OS !== 'web' && (
        <View style={styles.chartFallback}>
          <Text style={styles.chartFallbackText}>Bar chart visualization available on web</Text>
          <View style={styles.dataPoints}>
            {data.map((item, index) => (
              <View key={index} style={styles.dataPoint}>
                <Text style={styles.dataPointLabel}>{item.label}</Text>
                <Text style={styles.dataPointValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

const DonutChart = ({ data, size = 120 }) => {
  if (!data || data.length === 0) {
    return (
      <View style={[styles.chartContainer, { height: size }]}>
        <Text style={styles.noDataText}>No data available</Text>
      </View>
    );
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const radius = size / 2 - 20;
  const innerRadius = radius * 0.6;
  const center = size / 2;

  let currentAngle = 0;

  return (
    <View style={[styles.chartContainer, { height: size }]}>
      {Platform.OS === 'web' && (
        <svg width={size} height={size} style={styles.chartSvg}>
          {data.map((item, index) => {
            const angle = (item.value / total) * 2 * Math.PI;
            const startAngle = currentAngle;
            const endAngle = currentAngle + angle;
            
            const x1 = center + radius * Math.cos(startAngle);
            const y1 = center + radius * Math.sin(startAngle);
            const x2 = center + radius * Math.cos(endAngle);
            const y2 = center + radius * Math.sin(endAngle);
            
            const x3 = center + innerRadius * Math.cos(endAngle);
            const y3 = center + innerRadius * Math.sin(endAngle);
            const x4 = center + innerRadius * Math.cos(startAngle);
            const y4 = center + innerRadius * Math.sin(startAngle);
            
            const largeArcFlag = angle > Math.PI ? 1 : 0;
            
            const pathData = [
              `M ${x1} ${y1}`,
              `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
              `L ${x3} ${y3}`,
              `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}`,
              'Z'
            ].join(' ');
            
            currentAngle += angle;
            
            return (
              <path
                key={index}
                d={pathData}
                fill={item.color || `hsl(${index * 60}, 70%, 60%)`}
              />
            );
          })}
          
          {/* Center text */}
          <text
            x={center}
            y={center}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#FFFFFF"
            fontSize="14"
            fontWeight="bold"
          >
            {total}
          </text>
        </svg>
      )}
      
      {Platform.OS !== 'web' && (
        <View style={styles.chartFallback}>
          <Text style={styles.chartFallbackText}>Donut chart available on web</Text>
          <View style={styles.dataPoints}>
            {data.map((item, index) => (
              <View key={index} style={styles.dataPoint}>
                <Text style={styles.dataPointLabel}>{item.label}</Text>
                <Text style={styles.dataPointValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

// Metric Card Component
const MetricCard = ({ title, value, change, color = '#22D3EE', subtitle }) => (
  <View style={[styles.metricCard, { borderLeftColor: color }]}>
    <Text style={styles.metricTitle}>{title}</Text>
    <Text style={[styles.metricValue, { color }]}>{value}</Text>
    {subtitle && <Text style={styles.metricSubtitle}>{subtitle}</Text>}
    {change !== undefined && (
      <View style={styles.metricChange}>
        <Text style={[
          styles.metricChangeText,
          { color: change >= 0 ? '#10B981' : '#EF4444' }
        ]}>
          {change >= 0 ? '↗' : '↘'} {Math.abs(change).toFixed(1)}%
        </Text>
      </View>
    )}
  </View>
);

// Main Analytics Visualization Component
export default function AnalyticsVisualization({
  analytics = {},
  detections = [],
  isRunning = false,
  timeRange = '24h',
  compact = false
}) {
  const [selectedTab, setSelectedTab] = useState('overview');
  const [selectedTimeRange, setSelectedTimeRange] = useState(timeRange);

  // Generate mock data for demonstration
  const generateMockData = (type, count = 24) => {
    const data = [];
    for (let i = 0; i < count; i++) {
      const hour = i;
      let value;
      
      switch (type) {
        case 'detections':
          value = Math.floor(Math.random() * 50) + 10;
          break;
        case 'safety':
          value = Math.floor(Math.random() * 30) + 70;
          break;
        case 'performance':
          value = Math.floor(Math.random() * 20) + 80;
          break;
        default:
          value = Math.floor(Math.random() * 100);
      }
      
      data.push({
        label: `${hour}:00`,
        value,
        timestamp: Date.now() - (count - i) * 3600000
      });
    }
    return data;
  };

  const mockDetectionData = useMemo(() => generateMockData('detections'), []);
  const mockSafetyData = useMemo(() => generateMockData('safety'), []);
  const mockPerformanceData = useMemo(() => generateMockData('performance'), []);

  const threatDistribution = useMemo(() => [
    { label: 'Vehicles', value: 45, color: '#22D3EE' },
    { label: 'Pedestrians', value: 30, color: '#10B981' },
    { label: 'Cyclists', value: 15, color: '#F59E0B' },
    { label: 'Other', value: 10, color: '#EF4444' }
  ], []);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'performance', label: 'Performance', icon: '⚡' },
    { id: 'safety', label: 'Safety', icon: '🛡️' },
    { id: 'trends', label: 'Trends', icon: '📈' }
  ];

  const timeRanges = [
    { id: '1h', label: '1 Hour' },
    { id: '24h', label: '24 Hours' },
    { id: '7d', label: '7 Days' },
    { id: '30d', label: '30 Days' }
  ];

  const renderOverviewTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      {/* Key Metrics */}
      <View style={styles.metricsGrid}>
        <MetricCard
          title="Total Detections"
          value={analytics.performance?.total_detections || mockDetectionData.reduce((sum, d) => sum + d.value, 0)}
          change={5.2}
          color="#22D3EE"
          subtitle="Last 24 hours"
        />
        <MetricCard
          title="Safety Score"
          value={`${analytics.safety?.safety_score || 87}/100`}
          change={2.1}
          color="#10B981"
          subtitle="Current session"
        />
        <MetricCard
          title="Avg Response Time"
          value={`${analytics.performance?.avg_response_time || 245}ms`}
          change={-1.8}
          color="#F59E0B"
          subtitle="Processing latency"
        />
        <MetricCard
          title="Accuracy Rate"
          value={`${((analytics.ai?.detection_accuracy || 0.87) * 100).toFixed(1)}%`}
          change={0.5}
          color="#8B5CF6"
          subtitle="AI detection"
        />
      </View>

      {/* Detection Trends */}
      <View style={styles.chartSection}>
        <Text style={styles.sectionTitle}>Detection Activity</Text>
        <LineChart
          data={mockDetectionData}
          color="#22D3EE"
          height={160}
        />
      </View>

      {/* Threat Distribution */}
      <View style={styles.chartSection}>
        <Text style={styles.sectionTitle}>Threat Distribution</Text>
        <View style={styles.chartRow}>
          <DonutChart data={threatDistribution} size={140} />
          <View style={styles.legendContainer}>
            {threatDistribution.map((item, index) => (
              <View key={index} style={styles.legendItem}>
                <View style={[styles.legendColor, { backgroundColor: item.color }]} />
                <Text style={styles.legendLabel}>{item.label}</Text>
                <Text style={styles.legendValue}>{item.value}%</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );

  const renderPerformanceTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.metricsGrid}>
        <MetricCard
          title="FPS"
          value={analytics.performance?.current_fps || '28.5'}
          color="#22D3EE"
          subtitle="Current"
        />
        <MetricCard
          title="CPU Usage"
          value={`${analytics.performance?.cpu_usage || 45}%`}
          color="#10B981"
          subtitle="Average"
        />
        <MetricCard
          title="Memory"
          value={`${analytics.performance?.memory_usage || 234}MB`}
          color="#F59E0B"
          subtitle="Current"
        />
        <MetricCard
          title="Battery"
          value={`${analytics.performance?.battery_level || 78}%`}
          color="#EF4444"
          subtitle="Remaining"
        />
      </View>

      <View style={styles.chartSection}>
        <Text style={styles.sectionTitle}>Performance Over Time</Text>
        <LineChart
          data={mockPerformanceData}
          color="#10B981"
          height={160}
        />
      </View>

      <View style={styles.chartSection}>
        <Text style={styles.sectionTitle}>Processing Breakdown</Text>
        <BarChart
          data={[
            { label: 'Detection', value: 45 },
            { label: 'Tracking', value: 25 },
            { label: 'Analysis', value: 20 },
            { label: 'Rendering', value: 10 }
          ]}
          color="#8B5CF6"
          height={140}
        />
      </View>
    </ScrollView>
  );

  const renderSafetyTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.metricsGrid}>
        <MetricCard
          title="Near Misses"
          value={analytics.safety?.near_misses || 3}
          color="#EF4444"
          subtitle="Today"
        />
        <MetricCard
          title="Danger Events"
          value={analytics.safety?.danger_events || 12}
          color="#F59E0B"
          subtitle="Last 24h"
        />
        <MetricCard
          title="Safe Distance"
          value={`${analytics.safety?.avg_safe_distance || 15.2}m`}
          color="#10B981"
          subtitle="Average"
        />
        <MetricCard
          title="Alert Response"
          value={`${analytics.safety?.avg_alert_response || 1.8}s`}
          color="#22D3EE"
          subtitle="Average"
        />
      </View>

      <View style={styles.chartSection}>
        <Text style={styles.sectionTitle}>Safety Score Trend</Text>
        <LineChart
          data={mockSafetyData}
          color="#10B981"
          height={160}
        />
      </View>

      <View style={styles.chartSection}>
        <Text style={styles.sectionTitle}>Risk Levels</Text>
        <BarChart
          data={[
            { label: 'Safe', value: 75 },
            { label: 'Caution', value: 20 },
            { label: 'Danger', value: 5 }
          ]}
          color="#F59E0B"
          height={140}
        />
      </View>
    </ScrollView>
  );

  const renderTrendsTab = () => (
    <ScrollView style={styles.tabContent} showsVerticalScrollIndicator={false}>
      <View style={styles.chartSection}>
        <Text style={styles.sectionTitle}>Weekly Trends</Text>
        <LineChart
          data={[
            { label: 'Mon', value: 85 },
            { label: 'Tue', value: 92 },
            { label: 'Wed', value: 78 },
            { label: 'Thu', value: 88 },
            { label: 'Fri', value: 95 },
            { label: 'Sat', value: 82 },
            { label: 'Sun', value: 90 }
          ]}
          color="#8B5CF6"
          height={160}
        />
      </View>

      <View style={styles.chartSection}>
        <Text style={styles.sectionTitle}>Monthly Comparison</Text>
        <BarChart
          data={[
            { label: 'Jan', value: 85 },
            { label: 'Feb', value: 88 },
            { label: 'Mar', value: 92 },
            { label: 'Apr', value: 87 }
          ]}
          color="#06B6D4"
          height={140}
        />
      </View>

      <View style={styles.insightsSection}>
        <Text style={styles.sectionTitle}>Key Insights</Text>
        <View style={styles.insightCard}>
          <Text style={styles.insightTitle}>🎯 Detection Accuracy Improved</Text>
          <Text style={styles.insightText}>
            Your detection accuracy has increased by 5.2% this week, likely due to improved lighting conditions and camera positioning.
          </Text>
        </View>
        <View style={styles.insightCard}>
          <Text style={styles.insightTitle}>⚠️ Peak Risk Hours</Text>
          <Text style={styles.insightText}>
            Most danger events occur between 7-9 AM and 5-7 PM. Consider extra caution during these hours.
          </Text>
        </View>
        <View style={styles.insightCard}>
          <Text style={styles.insightTitle}>🚀 Performance Optimization</Text>
          <Text style={styles.insightText}>
            Battery optimization mode reduced power consumption by 15% with minimal impact on detection quality.
          </Text>
        </View>
      </View>
    </ScrollView>
  );

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      {/* Header */}
      {!compact && (
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Analytics Dashboard</Text>
          <View style={styles.timeRangeSelector}>
            {timeRanges.map(range => (
              <Pressable
                key={range.id}
                style={[
                  styles.timeRangeButton,
                  selectedTimeRange === range.id && styles.timeRangeButtonActive
                ]}
                onPress={() => setSelectedTimeRange(range.id)}
              >
                <Text style={[
                  styles.timeRangeText,
                  selectedTimeRange === range.id && styles.timeRangeTextActive
                ]}>
                  {range.label}
                </Text>
              </Pressable>
            ))}
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
          </Pressable>
        ))}
      </View>

      {/* Tab Content */}
      <View style={[styles.tabContainer, compact && styles.tabContainerCompact]}>
        {selectedTab === 'overview' && renderOverviewTab()}
        {selectedTab === 'performance' && renderPerformanceTab()}
        {selectedTab === 'safety' && renderSafetyTab()}
        {selectedTab === 'trends' && renderTrendsTab()}
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
  timeRangeSelector: {
    flexDirection: 'row',
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 8,
    padding: 2,
  },
  timeRangeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  timeRangeButtonActive: {
    backgroundColor: '#22D3EE',
  },
  timeRangeText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
  },
  timeRangeTextActive: {
    color: '#FFFFFF',
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
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  metricCard: {
    flex: 1,
    minWidth: (screenWidth - 56) / 2,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
  },
  metricTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  metricSubtitle: {
    color: '#64748B',
    fontSize: 11,
    marginBottom: 8,
  },
  metricChange: {
    alignSelf: 'flex-start',
  },
  metricChangeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  chartSection: {
    marginBottom: 24,
  },
  chartContainer: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartSvg: {
    overflow: 'visible',
  },
  chartFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  chartFallbackText: {
    color: '#94A3B8',
    fontSize: 14,
    marginBottom: 16,
  },
  dataPoints: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dataPoint: {
    alignItems: 'center',
    padding: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    borderRadius: 8,
  },
  dataPointLabel: {
    color: '#94A3B8',
    fontSize: 10,
    marginBottom: 4,
  },
  dataPointValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  noDataText: {
    color: '#64748B',
    fontSize: 14,
    fontStyle: 'italic',
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  legendContainer: {
    flex: 1,
    marginLeft: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendLabel: {
    color: '#E2E8F0',
    fontSize: 14,
    flex: 1,
  },
  legendValue: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
  },
  insightsSection: {
    marginTop: 8,
  },
  insightCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#22D3EE',
  },
  insightTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  insightText: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 18,
  },
});