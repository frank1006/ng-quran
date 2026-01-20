/**
 * Background Sync Handler for Service Worker
 * Handles background synchronization of prayer times
 */

// Listen for background sync events
self.addEventListener('sync', (event) => {
  if (event.tag === 'prayer-times-sync') {
    event.waitUntil(syncPrayerTimes());
  }
});

// Listen for periodic sync events (if supported)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'prayer-times-sync') {
    event.waitUntil(syncPrayerTimes());
  }
});

// Listen for messages from main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_PRAYER_TIMES') {
    event.waitUntil(syncPrayerTimes());
  }
});

/**
 * Sync prayer times in background
 */
async function syncPrayerTimes() {
  try {
    // Get cached location
    const location = await getCachedLocation();
    if (!location) {
      console.log('No location cached, skipping sync');
      return;
    }

    // Get today's date
    const today = new Date();
    const datesToSync = [];

    // Sync today and next 3 days
    for (let i = 0; i <= 3; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      datesToSync.push(date);
    }

    // Fetch prayer times for each date
    for (const date of datesToSync) {
      await fetchAndCachePrayerTime(date, location);
    }

    // Update last sync timestamp
    await updateLastSyncTimestamp();

    console.log('Background sync completed');
  } catch (error) {
    console.error('Background sync failed:', error);
    throw error; // Re-throw to retry
  }
}

/**
 * Get cached location from IndexedDB or localStorage
 */
async function getCachedLocation() {
  try {
    // Try to get from cache API first
    const cache = await caches.open('prayer-times-cache');
    const cached = await cache.match('/location');
    
    if (cached) {
      const data = await cached.json();
      return data;
    }

    // Fallback: try to get from service worker's global state
    // (This would need to be set by the main app)
    return null;
  } catch (error) {
    console.error('Error getting cached location:', error);
    return null;
  }
}

/**
 * Fetch and cache prayer time for a specific date
 */
async function fetchAndCachePrayerTime(date, location) {
  try {
    const dateStr = `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
    const url = `https://api.aladhan.com/v1/timings/${dateStr}?latitude=${location.latitude}&longitude=${location.longitude}&method=4`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.code === 200 && data.data) {
      // Cache the response
      const cache = await caches.open('prayer-times-cache');
      const dateKey = getDateKey(date);
      const cacheUrl = `/prayer-times/${dateKey}`;
      
      await cache.put(
        cacheUrl,
        new Response(JSON.stringify(data.data), {
          headers: { 'Content-Type': 'application/json' }
        })
      );

      // Also update the main app's localStorage via message
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'PRAYER_TIME_UPDATED',
            dateKey: dateKey,
            data: data.data
          });
        });
      });
    }
  } catch (error) {
    console.error(`Error fetching prayer time for ${getDateKey(date)}:`, error);
    // Don't throw - continue with other dates
  }
}

/**
 * Update last sync timestamp
 */
async function updateLastSyncTimestamp() {
  try {
    const cache = await caches.open('prayer-times-cache');
    await cache.put(
      '/last-sync',
      new Response(JSON.stringify({ timestamp: Date.now() }), {
        headers: { 'Content-Type': 'application/json' }
      })
    );
  } catch (error) {
    console.error('Error updating last sync timestamp:', error);
  }
}

/**
 * Get date key in format YYYY-MM-DD
 */
function getDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

