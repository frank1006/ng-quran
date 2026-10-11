import { Injectable, signal } from '@angular/core';

export type ToastTone = 'info' | 'error';

export interface Toast {
  text: string;
  tone: ToastTone;
}

/** How long each kind stays: a confirmation is read at a glance, a problem needs a moment more */
const DURATION_MS: Record<ToastTone, number> = { info: 2500, error: 4500 };

/**
 * Short messages that appear over the page for a moment and leave by themselves: what a tap just
 * did ("Fajr reminder: silent"), or a problem that needs no decision ("Compass stopped working").
 * One at a time: a new one replaces the one showing. Shown by <app-toast> in the app shell, so
 * any page or service can call show() and nothing in the page moves.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  /** The message; kept after it hides, so its words are still there while it fades out */
  readonly toast = signal<Toast | null>(null);
  readonly visible = signal(false);

  private timer: ReturnType<typeof setTimeout> | undefined;

  show(text: string, tone: ToastTone = 'info'): void {
    this.toast.set({ text, tone });
    this.visible.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.visible.set(false), DURATION_MS[tone]);
  }

  /** A problem: stays a little longer and is announced to screen readers at once */
  error(text: string): void {
    this.show(text, 'error');
  }

  dismiss(): void {
    clearTimeout(this.timer);
    this.visible.set(false);
  }
}
