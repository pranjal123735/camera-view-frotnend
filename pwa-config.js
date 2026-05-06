/**
 * Progressive Web App Configuration
 * Enables offline functionality, push notifications, and native-like experience
 */

// Service Worker Registration
export const registerServiceWorker = () => {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('SW registered: ', registration);
          
          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New content is available, prompt user to refresh
                if (confirm('New version available! Refresh to update?')) {
                  window.location.reload();
                }
              }
            });
          });
        })
        .catch((registrationError) => {
          console.log('SW registration failed: ', registrationError);
        });
    });
  }
};

// Push Notification Setup
export const setupPushNotifications = async () => {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    console.log('Push notifications not supported');
    return false;
  }

  // Request permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.log('Notification permission denied');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.EXPO_PUBLIC_VAPID_KEY || '')
    });

    // Send subscription to server
    await fetch('/api/push-subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(subscription),
    });

    return true;
  } catch (error) {
    console.error('Push subscription failed:', error);
    return false;
  }
};

// Utility function for VAPID key conversion
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Background Sync for offline data
export const scheduleBackgroundSync = (tag, data) => {
  if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    navigator.serviceWorker.ready.then((registration) => {
      // Store data for sync
      const syncData = {
        tag,
        data,
        timestamp: Date.now()
      };
      
      localStorage.setItem(`sync_${tag}`, JSON.stringify(syncData));
      
      // Register background sync
      return registration.sync.register(tag);
    }).catch((error) => {
      console.error('Background sync registration failed:', error);
    });
  }
};

// Install prompt handling
export const setupInstallPrompt = () => {
  let deferredPrompt;

  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    
    // Show custom install button
    showInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    console.log('PWA was installed');
    hideInstallButton();
    deferredPrompt = null;
  });

  return {
    showInstallPrompt: () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
          if (choiceResult.outcome === 'accepted') {
            console.log('User accepted the install prompt');
          }
          deferredPrompt = null;
        });
      }
    }
  };
};

// Show/hide install button functions
const showInstallButton = () => {
  const installButton = document.getElementById('install-button');
  if (installButton) {
    installButton.style.display = 'block';
  }
};

const hideInstallButton = () => {
  const installButton = document.getElementById('install-button');
  if (installButton) {
    installButton.style.display = 'none';
  }
};

// Offline detection and handling
export const setupOfflineHandling = () => {
  const updateOnlineStatus = () => {
    const isOnline = navigator.onLine;
    document.body.classList.toggle('offline', !isOnline);
    
    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('connectionchange', {
      detail: { online: isOnline }
    }));
    
    if (isOnline) {
      // Sync pending data when back online
      syncPendingData();
    }
  };

  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  
  // Initial check
  updateOnlineStatus();
};

// Sync pending data when back online
const syncPendingData = async () => {
  const pendingKeys = Object.keys(localStorage).filter(key => key.startsWith('sync_'));
  
  for (const key of pendingKeys) {
    try {
      const syncData = JSON.parse(localStorage.getItem(key));
      
      // Attempt to sync data
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(syncData),
      });
      
      if (response.ok) {
        localStorage.removeItem(key);
        console.log(`Synced data for ${syncData.tag}`);
      }
    } catch (error) {
      console.error('Sync failed for', key, error);
    }
  }
};

// Cache management
export const cacheManager = {
  // Cache detection models for offline use
  cacheModels: async () => {
    if ('caches' in window) {
      const cache = await caches.open('models-v1');
      const modelUrls = [
        '/models/yolov8n.onnx',
        '/models/yolov8s.onnx',
        // Add other model URLs
      ];
      
      await cache.addAll(modelUrls);
    }
  },

  // Cache critical app resources
  cacheAppResources: async () => {
    if ('caches' in window) {
      const cache = await caches.open('app-v1');
      const resources = [
        '/',
        '/static/js/bundle.js',
        '/static/css/main.css',
        '/manifest.json',
        // Add other critical resources
      ];
      
      await cache.addAll(resources);
    }
  },

  // Clear old caches
  clearOldCaches: async () => {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      const oldCaches = cacheNames.filter(name => 
        !['models-v1', 'app-v1', 'api-v1'].includes(name)
      );
      
      await Promise.all(
        oldCaches.map(name => caches.delete(name))
      );
    }
  }
};

// Performance monitoring
export const performanceMonitor = {
  // Monitor app performance
  startMonitoring: () => {
    // Monitor navigation timing
    window.addEventListener('load', () => {
      setTimeout(() => {
        const perfData = performance.getEntriesByType('navigation')[0];
        const loadTime = perfData.loadEventEnd - perfData.loadEventStart;
        
        // Send performance data to analytics
        if (loadTime > 0) {
          console.log('Page load time:', loadTime);
          // Could send to analytics service
        }
      }, 0);
    });

    // Monitor resource loading
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 1000) { // Resources taking > 1s
          console.warn('Slow resource:', entry.name, entry.duration);
        }
      }
    });
    
    observer.observe({ entryTypes: ['resource'] });
  },

  // Monitor memory usage
  monitorMemory: () => {
    if ('memory' in performance) {
      setInterval(() => {
        const memory = performance.memory;
        const memoryUsage = {
          used: Math.round(memory.usedJSHeapSize / 1048576), // MB
          total: Math.round(memory.totalJSHeapSize / 1048576), // MB
          limit: Math.round(memory.jsHeapSizeLimit / 1048576) // MB
        };
        
        // Warn if memory usage is high
        if (memoryUsage.used / memoryUsage.limit > 0.8) {
          console.warn('High memory usage:', memoryUsage);
        }
      }, 30000); // Check every 30 seconds
    }
  }
};

// App lifecycle management
export const appLifecycle = {
  // Handle app visibility changes
  setupVisibilityHandling: () => {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // App is hidden - reduce processing
        window.dispatchEvent(new CustomEvent('appbackground'));
      } else {
        // App is visible - resume full processing
        window.dispatchEvent(new CustomEvent('appforeground'));
      }
    });
  },

  // Handle page unload
  setupUnloadHandling: () => {
    window.addEventListener('beforeunload', (e) => {
      // Save critical data before unload
      const criticalData = {
        timestamp: Date.now(),
        // Add any critical app state
      };
      
      localStorage.setItem('app_state_backup', JSON.stringify(criticalData));
    });
  },

  // Restore app state
  restoreAppState: () => {
    const backup = localStorage.getItem('app_state_backup');
    if (backup) {
      try {
        const state = JSON.parse(backup);
        // Restore app state if recent (within 1 hour)
        if (Date.now() - state.timestamp < 3600000) {
          return state;
        }
      } catch (error) {
        console.error('Failed to restore app state:', error);
      }
      
      // Clean up old backup
      localStorage.removeItem('app_state_backup');
    }
    return null;
  }
};

// Initialize PWA features
export const initializePWA = async () => {
  // Register service worker
  registerServiceWorker();
  
  // Setup offline handling
  setupOfflineHandling();
  
  // Setup install prompt
  const installPrompt = setupInstallPrompt();
  
  // Setup app lifecycle
  appLifecycle.setupVisibilityHandling();
  appLifecycle.setupUnloadHandling();
  
  // Start performance monitoring
  performanceMonitor.startMonitoring();
  performanceMonitor.monitorMemory();
  
  // Cache critical resources
  await cacheManager.cacheAppResources();
  
  // Setup push notifications (optional)
  const pushEnabled = await setupPushNotifications();
  
  // Restore app state if available
  const restoredState = appLifecycle.restoreAppState();
  
  return {
    installPrompt,
    pushEnabled,
    restoredState
  };
};