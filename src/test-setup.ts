// jsdom doesn't implement matchMedia; services read it for PWA/standalone detection
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom has no Notification API; the app treats it as "not yet requested"
if (!('Notification' in window)) {
  (window as unknown as { Notification: unknown }).Notification = class {
    static permission: NotificationPermission = 'default';
    static requestPermission = async (): Promise<NotificationPermission> => 'default';
  };
}
