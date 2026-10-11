import { vi } from 'vitest';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let toasts: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    toasts = new ToastService();
  });

  afterEach(() => vi.useRealTimers());

  it('shows a message, then hides it but keeps its words for the fade-out', () => {
    toasts.show('Fajr reminder: silent');
    expect(toasts.visible()).toBe(true);
    vi.advanceTimersByTime(2500);
    expect(toasts.visible()).toBe(false);
    expect(toasts.toast()?.text).toBe('Fajr reminder: silent');
  });

  it('keeps a problem up longer than a confirmation', () => {
    toasts.error('Compass stopped working');
    expect(toasts.toast()?.tone).toBe('error');
    vi.advanceTimersByTime(2500);
    expect(toasts.visible()).toBe(true);
    vi.advanceTimersByTime(2000);
    expect(toasts.visible()).toBe(false);
  });

  it('replaces the message showing and restarts its time', () => {
    toasts.show('First');
    vi.advanceTimersByTime(2000);
    toasts.show('Second');
    vi.advanceTimersByTime(2000);
    expect(toasts.visible()).toBe(true);
    expect(toasts.toast()?.text).toBe('Second');
  });

  it('can be sent away early', () => {
    toasts.show('Saved');
    toasts.dismiss();
    expect(toasts.visible()).toBe(false);
  });
});
