/**
 * Advanced Settings & Customization Component
 * Provides comprehensive settings for personalization, themes, and system configuration
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Switch,
  Modal,
  Alert,
  Dimensions
} from 'react-native';

const { width: screenWidth } = Dimensions.get('window');

// Theme configurations
export const THEMES = {
  dark: {
    name: 'Dark Mode',
    colors: {
      background: '#0F172A',
      surface: '#1E293B',
      primary: '#22D3EE',
      secondary: '#10B981',
      danger: '#EF4444',
      warning: '#F59E0B',
      text: '#FFFFFF',
      textSecondary: '#94A3B8',
      border: 'rgba(45, 212, 191, 0.2)'
    }
  },
  light: {
    name: 'Light Mode',
    colors: {
      background: '#FFFFFF',
      surface: '#F8FAFC',
      primary: '#0EA5E9',
      secondary: '#059669',
      danger: '#DC2626',
      warning: '#D97706',
      text: '#1F2937',
      textSecondary: '#6B7280',
      border: 'rgba(14, 165, 233, 0.2)'
    }
  },
  cyberpunk: {
    name: 'Cyberpunk',
    colors: {
      background: '#0A0A0A',
      surface: '#1A1A2E',
      primary: '#FF00FF',
      secondary: '#00FFFF',
      danger: '#FF073A',
      warning: '#FFD700',
      text: '#FFFFFF',
      textSecondary: '#B0B0B0',
      border: 'rgba(255, 0, 255, 0.3)'
    }
  },
  nature: {
    name: 'Nature',
    colors: {
      background: '#1B2E1B',
      surface: '#2D4A2D',
      primary: '#4ADE80',
      secondary: '#22D3EE',
      danger: '#F87171',
      warning: '#FBBF24',
      text: '#F0FDF4',
      textSecondary: '#86EFAC',
      border: 'rgba(74, 222, 128, 0.3)'
    }
  }
};

// Setting Categories
const SETTING_CATEGORIES = {
  appearance: {
    title: 'Appearance',
    icon: '🎨',
    settings: ['theme', 'hud_opacity', 'font_size']
  },
  detection: {
    title: 'Detection',
    icon: '👁️',
    settings: ['sensitivity_person', 'sensitivity_vehicle', 'alert_distance']
  },
  alerts: {
    title: 'Alerts & Notifications',
    icon: '🔔',
    settings: ['voice_alerts', 'haptic_feedback']
  },
  performance: {
    title: 'Performance',
    icon: '⚡',
    settings: ['fps_limit', 'processing_quality', 'battery_optimization']
  }
};

// Setting Component
const SettingItem = ({ setting, value, onChange, theme }) => {
  const renderControl = () => {
    switch (setting.type) {
      case 'switch':
        return (
          <Switch
            value={value}
            onValueChange={onChange}
            trackColor={{ false: theme.colors.surface, true: theme.colors.primary }}
            thumbColor={value ? theme.colors.background : theme.colors.textSecondary}
          />
        );
      
      case 'slider':
        return (
          <View style={styles.sliderContainer}>
            <Text style={[styles.sliderValue, { color: theme.colors.primary }]}>
              {typeof value === 'number' ? value.toFixed(2) : value}
            </Text>
            <View style={styles.sliderTrack}>
              <View 
                style={[
                  styles.sliderFill, 
                  { 
                    backgroundColor: theme.colors.primary,
                    width: `${((value - setting.min) / (setting.max - setting.min)) * 100}%`
                  }
                ]} 
              />
            </View>
          </View>
        );
      
      case 'select':
        return (
          <View style={[styles.selectContainer, { borderColor: theme.colors.border }]}>
            <Text style={[styles.selectValue, { color: theme.colors.text }]}>
              {setting.options.find(opt => opt.value === value)?.label || value}
            </Text>
          </View>
        );
      
      case 'input':
        return (
          <TextInput
            style={[
              styles.textInput,
              { 
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                color: theme.colors.text
              }
            ]}
            value={String(value)}
            onChangeText={onChange}
            placeholder={setting.placeholder}
            placeholderTextColor={theme.colors.textSecondary}
          />
        );
      
      default:
        return null;
    }
  };

  return (
    <View style={[styles.settingItem, { borderBottomColor: theme.colors.border }]}>
      <View style={styles.settingInfo}>
        <Text style={[styles.settingTitle, { color: theme.colors.text }]}>
          {setting.title}
        </Text>
        {setting.description && (
          <Text style={[styles.settingDescription, { color: theme.colors.textSecondary }]}>
            {setting.description}
          </Text>
        )}
      </View>
      <View style={styles.settingControl}>
        {renderControl()}
      </View>
    </View>
  );
};

// Main Advanced Settings Component
export default function AdvancedSettings({
  settings = {},
  onSettingsChange,
  userProfile = null,
  onClose,
  compact = false
}) {
  const [currentSettings, setCurrentSettings] = useState(settings);
  const [selectedCategory, setSelectedCategory] = useState('appearance');
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const currentTheme = THEMES[currentSettings.theme] || THEMES.dark;

  // Setting definitions
  const SETTINGS_CONFIG = {
    theme: {
      title: 'Theme',
      description: 'Choose your preferred color scheme',
      type: 'select',
      options: Object.entries(THEMES).map(([key, theme]) => ({
        value: key,
        label: theme.name
      }))
    },
    hud_opacity: {
      title: 'HUD Opacity',
      description: 'Adjust transparency of overlay elements',
      type: 'slider',
      min: 0.3,
      max: 1.0,
      step: 0.1
    },
    font_size: {
      title: 'Font Size',
      description: 'Text size for UI elements',
      type: 'select',
      options: [
        { value: 'small', label: 'Small' },
        { value: 'medium', label: 'Medium' },
        { value: 'large', label: 'Large' }
      ]
    },
    sensitivity_person: {
      title: 'Person Detection Sensitivity',
      description: 'Higher values detect more people but may increase false positives',
      type: 'slider',
      min: 0.1,
      max: 1.0,
      step: 0.05
    },
    sensitivity_vehicle: {
      title: 'Vehicle Detection Sensitivity',
      description: 'Adjust sensitivity for cars, trucks, motorcycles',
      type: 'slider',
      min: 0.1,
      max: 1.0,
      step: 0.05
    },
    alert_distance: {
      title: 'Alert Distance (meters)',
      description: 'Minimum distance to trigger alerts',
      type: 'slider',
      min: 5,
      max: 50,
      step: 1
    },
    voice_alerts: {
      title: 'Voice Alerts',
      description: 'Enable spoken warnings for threats',
      type: 'switch'
    },
    haptic_feedback: {
      title: 'Haptic Feedback',
      description: 'Vibration for important alerts',
      type: 'switch'
    },
    fps_limit: {
      title: 'FPS Limit',
      description: 'Maximum frames per second for processing',
      type: 'select',
      options: [
        { value: '15', label: '15 FPS (Battery Saver)' },
        { value: '30', label: '30 FPS (Balanced)' },
        { value: '60', label: '60 FPS (Performance)' }
      ]
    },
    processing_quality: {
      title: 'Processing Quality',
      description: 'Balance between accuracy and performance',
      type: 'select',
      options: [
        { value: 'low', label: 'Low (Fast)' },
        { value: 'medium', label: 'Medium (Balanced)' },
        { value: 'high', label: 'High (Accurate)' }
      ]
    },
    battery_optimization: {
      title: 'Battery Optimization',
      description: 'Reduce processing when battery is low',
      type: 'switch'
    }
  };

  useEffect(() => {
    setCurrentSettings(settings);
  }, [settings]);

  const handleSettingChange = (key, value) => {
    const newSettings = { ...currentSettings, [key]: value };
    setCurrentSettings(newSettings);
    setHasUnsavedChanges(true);
  };

  const handleSave = () => {
    onSettingsChange(currentSettings);
    setHasUnsavedChanges(false);
  };

  const handleReset = () => {
    setCurrentSettings(settings);
    setHasUnsavedChanges(false);
  };

  const renderCategorySettings = (categoryKey) => {
    const category = SETTING_CATEGORIES[categoryKey];
    if (!category) return null;

    return (
      <View style={styles.categorySection}>
        {category.settings.map(settingKey => {
          const settingConfig = SETTINGS_CONFIG[settingKey];
          if (!settingConfig) return null;

          return (
            <SettingItem
              key={settingKey}
              setting={settingConfig}
              value={currentSettings[settingKey]}
              onChange={(value) => handleSettingChange(settingKey, value)}
              theme={currentTheme}
            />
          );
        })}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: currentTheme.colors.background }, compact && styles.containerCompact]}>
      {/* Header */}
      {!compact && (
        <View style={[styles.header, { borderBottomColor: currentTheme.colors.border }]}>
          <Text style={[styles.headerTitle, { color: currentTheme.colors.text }]}>
            Advanced Settings
          </Text>
          {hasUnsavedChanges && (
            <View style={styles.unsavedIndicator}>
              <Text style={styles.unsavedText}>●</Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.content}>
        {/* Category Navigation */}
        <View style={[styles.categoryNav, { backgroundColor: currentTheme.colors.surface }, compact && styles.categoryNavCompact]}>
          {Object.entries(SETTING_CATEGORIES).map(([key, category]) => (
            <Pressable
              key={key}
              style={[
                styles.categoryTab,
                selectedCategory === key && [
                  styles.categoryTabActive,
                  { backgroundColor: currentTheme.colors.primary }
                ],
                compact && styles.categoryTabCompact
              ]}
              onPress={() => setSelectedCategory(key)}
            >
              <Text style={[styles.categoryIcon, compact && styles.categoryIconCompact]}>{category.icon}</Text>
              {!compact && (
                <Text style={[
                  styles.categoryLabel,
                  { color: selectedCategory === key ? '#FFFFFF' : currentTheme.colors.textSecondary }
                ]}>
                  {category.title}
                </Text>
              )}
            </Pressable>
          ))}
        </View>

        {/* Settings Content */}
        <ScrollView style={[styles.settingsContent, compact && styles.settingsContentCompact]} showsVerticalScrollIndicator={false}>
          {renderCategorySettings(selectedCategory)}

          {/* User Profile Section */}
          {userProfile && !compact && (
            <View style={[styles.profileSection, { borderTopColor: currentTheme.colors.border }]}>
              <Text style={[styles.sectionTitle, { color: currentTheme.colors.text }]}>
                User Profile
              </Text>
              <View style={[styles.profileCard, { backgroundColor: currentTheme.colors.surface }]}>
                <Text style={[styles.profileText, { color: currentTheme.colors.text }]}>
                  Mobility Mode: {userProfile.mobility_mode || 'Not set'}
                </Text>
                <Text style={[styles.profileText, { color: currentTheme.colors.text }]}>
                  Sessions: {userProfile.total_sessions || 0}
                </Text>
                <Text style={[styles.profileText, { color: currentTheme.colors.text }]}>
                  Avg Safety Score: {userProfile.avg_safety_score?.toFixed(1) || 'N/A'}
                </Text>
              </View>
            </View>
          )}
        </ScrollView>
      </View>

      {/* Action Buttons */}
      {!compact && (
        <View style={[styles.actionBar, { borderTopColor: currentTheme.colors.border }]}>
          <Pressable
            style={[styles.actionButton, styles.resetButton]}
            onPress={handleReset}
            disabled={!hasUnsavedChanges}
          >
            <Text style={[styles.actionButtonText, { opacity: hasUnsavedChanges ? 1 : 0.5 }]}>
              Reset
            </Text>
          </Pressable>
          
          <Pressable
            style={[
              styles.actionButton,
              styles.saveButton,
              { backgroundColor: currentTheme.colors.primary }
            ]}
            onPress={handleSave}
            disabled={!hasUnsavedChanges}
          >
            <Text style={[
              styles.actionButtonText,
              { color: '#FFFFFF', opacity: hasUnsavedChanges ? 1 : 0.5 }
            ]}>
              Save Changes
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  containerCompact: {
    maxHeight: 350,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  unsavedIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unsavedText: {
    color: '#FFFFFF',
    fontSize: 8,
  },
  content: {
    flex: 1,
  },
  categoryNav: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  categoryNavCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  categoryTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginHorizontal: 2,
  },
  categoryTabCompact: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  categoryTabActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  categoryIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  categoryIconCompact: {
    fontSize: 16,
    marginBottom: 0,
  },
  categoryLabel: {
    fontSize: 10,
    fontWeight: '500',
    textAlign: 'center',
  },
  settingsContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  settingsContentCompact: {
    paddingHorizontal: 12,
    maxHeight: 250,
  },
  categorySection: {
    paddingVertical: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  settingInfo: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  settingControl: {
    alignItems: 'flex-end',
  },
  sliderContainer: {
    alignItems: 'center',
    minWidth: 100,
  },
  sliderValue: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  sliderTrack: {
    width: 80,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    borderRadius: 2,
  },
  selectContainer: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 120,
  },
  selectValue: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 120,
    fontSize: 14,
  },
  profileSection: {
    marginTop: 24,
    paddingTop: 24,
    borderTopWidth: 1,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  profileCard: {
    padding: 16,
    borderRadius: 12,
  },
  profileText: {
    fontSize: 14,
    marginBottom: 8,
  },
  actionBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  resetButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  saveButton: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
});