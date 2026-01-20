/**
 * Notification Handler Service Worker
 * This handles notification clicks and works alongside Angular's service worker
 * 
 * Note: This is a simple handler. For production, you may want to integrate
 * this directly into Angular's service worker or use Angular's messaging API.
 */

// Listen for notification click events
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const notificationData = event.notification.data || {};
  const urlToOpen = notificationData.url || '/prayer';

  event.waitUntil(
    clients.matchAll({ 
      type: 'window', 
      includeUncontrolled: true 
    }).then((clientList) => {
      // Check if app is already open
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(urlToOpen) && 'focus' in client) {
          return client.focus();
        }
      }
      
      // Open new window/tab
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  // Optional: Track notification dismissal
  console.log('Notification closed:', event.notification.tag);
});

// Listen for messages from the main app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'REGISTER_NOTIFICATION_HANDLER') {
    // Handler is already registered via event listeners above
    event.ports[0]?.postMessage({ success: true });
  }
});

