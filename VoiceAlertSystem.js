/**
 * Voice Alert System for Motorcycle 360° Vision
 * Provides Tesla-style voice alerts for hazard warnings
 */

import { Platform } from 'react-native';

class VoiceAlertSystem {
  constructor() {
    this.isEnabled = true;
    this.lastAlertTime = 0;
    this.alertCooldown = 3000; // 3 seconds between alerts
    this.currentUtterance = null;
    
    // Initialize speech synthesis if available
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
      this.speechSynthesis = window.speechSynthesis;
      this.isSupported = true;
    } else {
      this.isSupported = false;
    }
  }

  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (!enabled && this.currentUtterance) {
      this.stop();
    }
  }

  stop() {
    if (this.speechSynthesis && this.currentUtterance) {
      this.speechSynthesis.cancel();
      this.currentUtterance = null;
    }
  }

  speak(message, options = {}) {
    if (!this.isEnabled || !this.isSupported || !message) {
      return;
    }

    // Check cooldown
    const now = Date.now();
    if (now - this.lastAlertTime < this.alertCooldown) {
      return;
    }

    // Cancel any ongoing speech
    this.stop();

    // Create utterance
    this.currentUtterance = new SpeechSynthesisUtterance(message);
    
    // Configure voice settings
    this.currentUtterance.rate = options.rate || 1.1;
    this.currentUtterance.pitch = options.pitch || 1.0;
    this.currentUtterance.volume = options.volume || 0.8;
    
    // Use a calm, clear voice if available
    const voices = this.speechSynthesis.getVoices();
    const preferredVoice = voices.find(voice => 
      voice.name.includes('Google') || 
      voice.name.includes('Microsoft') ||
      voice.lang.startsWith('en')
    );
    
    if (preferredVoice) {
      this.currentUtterance.voice = preferredVoice;
    }

    // Handle completion
    this.currentUtterance.onend = () => {
      this.currentUtterance = null;
    };

    this.currentUtterance.onerror = () => {
      this.currentUtterance = null;
    };

    // Speak the message
    this.speechSynthesis.speak(this.currentUtterance);
    this.lastAlertTime = now;
  }

  processVisionData(visionData) {
    if (!visionData || !visionData.global_hazard) {
      return;
    }

    const { global_hazard } = visionData;
    
    // Only alert for warning and danger levels
    if (global_hazard.level < 2) {
      return;
    }

    let message = '';
    let voiceOptions = {};

    if (global_hazard.level === 3) {
      // Danger level - urgent alert
      message = `Warning! ${this.formatHazardMessage(global_hazard)}`;
      voiceOptions = {
        rate: 1.2,
        pitch: 1.1,
        volume: 1.0
      };
    } else if (global_hazard.level === 2) {
      // Warning level - calm alert
      message = `Caution. ${this.formatHazardMessage(global_hazard)}`;
      voiceOptions = {
        rate: 1.0,
        pitch: 1.0,
        volume: 0.8
      };
    }

    if (message) {
      this.speak(message, voiceOptions);
    }
  }

  formatHazardMessage(globalHazard) {
    const { direction, note } = globalHazard;
    
    // Extract object type and distance from note
    const objectMatch = note.match(/(\w+)\s+(?:detected|approaching|close)/i);
    const distanceMatch = note.match(/(\d+(?:\.\d+)?)\s*m/);
    
    let message = '';
    
    if (objectMatch) {
      const objectType = objectMatch[1].toLowerCase();
      message += `${objectType}`;
      
      if (direction && direction !== 'none') {
        message += ` on ${direction}`;
      }
      
      if (distanceMatch) {
        const distance = parseFloat(distanceMatch[1]);
        if (distance < 5) {
          message += '. Very close.';
        } else if (distance < 10) {
          message += `. ${distance} meters.`;
        } else {
          message += '. Ahead.';
        }
      }
    } else {
      // Fallback to simplified message
      if (direction && direction !== 'none') {
        message = `Object ${direction}`;
      } else {
        message = 'Object detected';
      }
    }
    
    return message;
  }

  // Test the voice system
  test() {
    if (!this.isSupported) {
      console.warn('Voice alerts not supported on this device');
      return;
    }

    const testMessages = [
      'Voice alert system active',
      'Caution. Vehicle on front. 8 meters.',
      'Warning! Car approaching fast from left!'
    ];

    testMessages.forEach((message, index) => {
      setTimeout(() => {
        this.speak(message, {
          rate: index === 2 ? 1.2 : 1.0,
          pitch: index === 2 ? 1.1 : 1.0
        });
      }, index * 4000);
    });
  }

  // Get system status
  getStatus() {
    return {
      supported: this.isSupported,
      enabled: this.isEnabled,
      speaking: !!this.currentUtterance,
      lastAlert: this.lastAlertTime,
      cooldownRemaining: Math.max(0, this.alertCooldown - (Date.now() - this.lastAlertTime))
    };
  }
}

// Create singleton instance
const voiceAlertSystem = new VoiceAlertSystem();

export default voiceAlertSystem;