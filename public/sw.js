/**
 * Service Worker for Car Vision PWA
 * Handles caching, offline functionality, background sync, and push notifications
 */

const CACHE_NAME = 'car-vision-v2.0.0';
const API_CACHE_NAME = 'car-vision-api-v1';
const MODEL_CACHE_NAME = 'car-vision-models-v1';

// Resources to cache immediately
const STATIC_RESOURCES = [
  '/',
  '/static/js/bundle.js',
  '/static/css/main.css',
  '/manifest.json',
  '/favicon.ico',
  // Add other critical static resources
];

// API endpoints to cache
const API_ENDPOINTS = [
  '/health',
  '/calibration',
  '/trip/stats'
];

// Model files to cache for offline detection
const MODEL_FILES = [
  '/models/yolov8n.onnx',
  '/models/detection-worker.js'
];

// Install event - cache static resources
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    Promise.all([
      // Cache static resources
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(STATIC_RESOURCES);
      }),
      
      // Cache models for offline detection
      caches.open(MODEL_CACHE_NAME).then((cache) => {
        return cache.addAll(MODEL_FILES).catch((error) => {
          console.warn('Failed to cache some models:', error);
        });
      })
    ]).then(() => {
      // Force activation of new service worker
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME && 
                cacheName !== API_CACHE_NAME && 
                cacheName !== MODEL_CACHE_NAME) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // Take control of all clients
      self.clients.claim()
    ])
  );
});

// Fetch event - handle network requests with caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle different types of requests
  if (request.method === 'GET') {
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/health')) {
      // API requests - network first, cache fallback
      event.respondWith(handleApiRequest(request));
    } else if (url.pathname.startsWith('/models/')) {
      // Model files - cache first
      event.respondWith(handleModelRequest(request));
    } else if (request.destination === 'image') {
      // Images - cache first with network fallback
      event.respondWith(handleImageRequest(request));
    } else {
      // Static resources - cache first with network fallback
      event.respondWith(handleStaticRequest(request));
    }
  } else if (request.method === 'POST') {
    // POST requests - handle with background sync for offline support
    event.respondWith(handlePostRequest(request));
  }
});

// Handle API requests - network first, cache fallback
async function handleApiRequest(request) {
  const cache = await caches.open(API_CACHE_NAME);
  
  try {
    // Try network first
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      // Cache successful responses
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    console.log('Network failed, trying cache for:', request.url);
    
    // Network failed, try cache
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return offline response for critical endpoints
    if (request.url.includes('/health')) {
      return new Response(JSON.stringify({
        ok: false,
        mode: 'offline',
        message: 'Offline mode - limited functionality'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    throw error;
  }
}

// Handle model requests - cache first
async function handleModelRequest(request) {
  const cache = await caches.open(MODEL_CACHE_NAME);
  
  // Try cache first
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Fetch from network and cache
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('Failed to fetch model:', request.url);
    throw error;
  }
}

// Handle image requests - cache with expiration
async function handleImageRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  
  // Try cache first
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    // Check if cached image is still fresh (24 hours)
    const cachedDate = new Date(cachedResponse.headers.get('date'));
    const now = new Date();
    const hoursDiff = (now - cachedDate) / (1000 * 60 * 60);
    
    if (hoursDiff < 24) {
      return cachedResponse;
    }
  }
  
  // Fetch from network
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Return cached version even if expired
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Handle static requests - cache first
async function handleStaticRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  
  // Try cache first
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  // Fetch from network and cache
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // For navigation requests, return cached index.html
    if (request.mode === 'navigate') {
      const indexResponse = await cache.match('/');
      if (indexResponse) {
        return indexResponse;
      }
    }
    throw error;
  }
}

// Handle POST requests with background sync support
async function handlePostRequest(request) {
  try {
    // Try to send immediately
    const response = await fetch(request);
    return response;
  } catch (error) {
    // If offline, store for background sync
    if (request.url.includes('/analyze-image') || 
        request.url.includes('/ai-feedback') ||
        request.url.includes('/learning/')) {
      
      // Store request for later sync
      const requestData = {
        url: request.url,
        method: request.method,
        headers: Object.fromEntries(request.headers.entries()),
        body: await request.blob(),
        timestamp: Date.now()
      };
      
      // Store in IndexedDB for background sync
      await storeForSync('api-requests', requestData);
      
      // Return offline response
      return new Response(JSON.stringify({
        ok: false,
        offline: true,
        message: 'Request queued for sync when online'
      }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    throw error;
  }
}

// Background sync event
self.addEventListener('sync', (event) => {
  console.log('Background sync triggered:', event.tag);
  
  if (event.tag === 'api-requests') {
    event.waitUntil(syncApiRequests());
  } else if (event.tag === 'analytics-data') {
    event.waitUntil(syncAnalyticsData());
  }
});

// Sync queued API requests
async function syncApiRequests() {
  try {
    const requests = await getStoredRequests('api-requests');
    
    for (const requestData of requests) {
      try {
        const response = await fetch(requestData.url, {
          method: requestData.method,
          headers: requestData.headers,
          body: requestData.body
        });
        
        if (response.ok) {
          // Remove successfully synced request
          await removeStoredRequest('api-requests', requestData.timestamp);
          console.log('Synced request:', requestData.url);
        }
      } catch (error) {
        console.error('Failed to sync request:', requestData.url, error);
      }
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// Sync analytics data
async function syncAnalyticsData() {
  try {
    const analyticsData = await getStoredRequests('analytics-data');
    
    if (analyticsData.length > 0) {
      const response = await fetch('/api/analytics/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analyticsData)
      });
      
      if (response.ok) {
        // Clear synced data
        await clearStoredRequests('analytics-data');
        console.log('Synced analytics data');
      }
    }
  } catch (error) {
    console.error('Analytics sync failed:', error);
  }
}

// Push notification event
self.addEventListener('push', (event) => {
  console.log('Push notification received');
  
  let notificationData = {
    title: 'Car Vision Alert',
    body: 'You have a new safety alert',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: 'safety-alert',
    requireInteraction: true
  };
  
  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = { ...notificationData, ...data };
    } catch (error) {
      console.error('Failed to parse push data:', error);
    }
  }
  
  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      requireInteraction: notificationData.requireInteraction,
      actions: [
        {
          action: 'view',
          title: 'View Details'
        },
        {
          action: 'dismiss',
          title: 'Dismiss'
        }
      ],
      data: notificationData.data
    })
  );
});

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event.action);
  
  event.notification.close();
  
  if (event.action === 'view') {
    // Open the app
    event.waitUntil(
      clients.openWindow('/')
    );
  }
  // 'dismiss' action just closes the notification
});

// IndexedDB helpers for storing offline data
async function storeForSync(storeName, data) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('CarVisionOffline', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'timestamp' });
      }
    };
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      store.add(data);
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    };
  });
}

async function getStoredRequests(storeName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('CarVisionOffline', 1);
    
    request.onerror = () => reject(request.error);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains(storeName)) {
        resolve([]);
        return;
      }
      
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => resolve(getAllRequest.result);
      getAllRequest.onerror = () => reject(getAllRequest.error);
    };
  });
}

async function removeStoredRequest(storeName, timestamp) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('CarVisionOffline', 1);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      store.delete(timestamp);
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    };
  });
}

async function clearStoredRequests(storeName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('CarVisionOffline', 1);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      store.clear();
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    };
  });
}

// Periodic background sync for analytics
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'analytics-sync') {
    event.waitUntil(syncAnalyticsData());
  }
});

// Handle messages from main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('Service Worker loaded successfully');