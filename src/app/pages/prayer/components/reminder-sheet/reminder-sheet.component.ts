import { Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { ReminderMode } from '../../../../services/notification.types';
import { NativeAdhanService } from '../../../../services/native-adhan.service';
import { isNativeApp } from '../../../../core/native-app';
import { SheetDragDirective } from '../../../../shared/directives/sheet-drag.directive';
import { closeOnBack } from '../../../../shared/sheet-back';

export interface ReminderSheetPrayer {
  key: string;
  name: string;
  time: string;
}

export interface ReminderChoice {
  prayer: ReminderSheetPrayer;
  mode: ReminderMode;
}

interface ReminderOption {
  mode: ReminderMode;
  label: string;
  hint: string;
}

/** The bell's icon for each way a reminder can arrive (in the app, silent means vibrate) */
@Component({
  selector: 'app-reminder-icon',
  template: `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      @switch (mode()) {
        @case ('adhan') {
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
        }
        @case ('sound') {
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          <path d="M2 8a10 10 0 0 1 2.6-5.5M22 8a10 10 0 0 0-2.6-5.5"></path>
        }
        @case ('silent') {
          @if (vibrates) {
            <rect x="8" y="5" width="8" height="14" rx="1"></rect>
            <path d="m2 8 2 2-2 2 2 2-2 2"></path>
            <path d="m22 8-2 2 2 2-2 2 2 2"></path>
          } @else {
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          }
        }
        @default {
          <path d="M8.7 3A6 6 0 0 1 18 8c0 2.2.3 3.9.8 5.2M17 17H3s3-2 3-9c0-.5.1-1 .2-1.5"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          <path d="M3 3l18 18"></path>
        }
      }
    </svg>
  `,
  styles: [':host { display: contents; }']
})
export class ReminderIconComponent {
  readonly mode = input.required<ReminderMode>();
  protected readonly vibrates = isNativeApp;
}

/**
 * In the Android app, a tap on a prayer's bell opens this sheet to choose how its reminder
 * arrives: the full adhan, the notification sound, vibrate only, or off. (The website's bell
 * keeps cycling through its three states.) A native <dialog>, like the calendar sheet.
 */
@Component({
  selector: 'app-reminder-sheet',
  imports: [ReminderIconComponent, SheetDragDirective],
  templateUrl: './reminder-sheet.component.html',
  styleUrl: './reminder-sheet.component.css'
})
export class ReminderSheetComponent {
  private readonly nativeAdhan = inject(NativeAdhanService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('sheet');

  readonly chosen = output<ReminderChoice>();

  protected readonly prayer = signal<ReminderSheetPrayer | null>(null);
  protected readonly current = signal<ReminderMode>('off');
  protected readonly previewing = signal(false);
  protected readonly closing = signal(false);
  /** Takes the Back-button history entry off again (the app only) */
  private releaseBack?: () => void;
  /** Turns ▶ back on when the adhan has played to the end */
  private previewEnds?: ReturnType<typeof setTimeout>;

  protected readonly isSunrise = computed(() => this.prayer()?.key === 'sunrise');

  protected readonly options = computed<ReminderOption[]>(() => {
    const fajr = this.prayer()?.key === 'fajr';
    const options: ReminderOption[] = [
      {
        mode: 'adhan', label: 'Full adhan',
        hint: fajr ? 'The Fajr adhan, with “prayer is better than sleep”' : 'The full call to prayer, with a Stop button',
      },
      { mode: 'sound', label: 'Notification sound', hint: 'Your phone’s notification sound' },
      { mode: 'silent', label: 'Vibrate only', hint: 'Vibrates, no sound' },
      { mode: 'off', label: 'Off', hint: 'No reminder' },
    ];
    // Shuruq is sunrise, not a prayer: no adhan
    return this.isSunrise() ? options.slice(1) : options;
  });

  open(prayer: ReminderSheetPrayer, current: ReminderMode): void {
    this.prayer.set(prayer);
    this.current.set(current);
    this.closing.set(false);
    const dialog = this.dialog().nativeElement;
    if (!dialog.open) {
      dialog.showModal();
      this.releaseBack = closeOnBack(() => this.close());
    }
  }

  protected choose(mode: ReminderMode): void {
    const prayer = this.prayer();
    if (!prayer) return;
    this.current.set(mode);
    // A taste of what was chosen (the adhan has its own ▶, it's minutes long)
    if (mode === 'sound' || mode === 'silent') void this.nativeAdhan.preview(mode === 'sound' ? 'sound' : 'vibrate');
    this.chosen.emit({ prayer, mode });
    this.close();
  }

  /** Plays the adhan this prayer would get, or stops it */
  protected async togglePreview(): Promise<void> {
    clearTimeout(this.previewEnds);
    if (this.previewing()) {
      this.previewing.set(false);
      await this.nativeAdhan.stopAdhan();
    } else {
      const fajr = this.prayer()?.key === 'fajr';
      this.previewing.set(true);
      // The recordings are just over three minutes (Fajr's a little longer)
      this.previewEnds = setTimeout(() => this.previewing.set(false), (fajr ? 190 : 181) * 1000);
      await this.nativeAdhan.testAdhan(fajr ? 'fajr' : 'dhuhr');
    }
  }

  /** Slide down, then close; a preview that is still playing stops */
  close(): void {
    const dialog = this.dialog().nativeElement;
    if (!dialog.open || this.closing()) return;
    this.releaseBack?.();
    this.releaseBack = undefined;
    this.stopPreview();
    this.closing.set(true);
    const finish = () => {
      dialog.close();
      this.closing.set(false);
    };
    dialog.addEventListener('animationend', finish, { once: true });
    // In case no animation runs
    setTimeout(() => { if (dialog.open) finish(); }, 400);
  }

  /** Escape or the back button: animate out instead of the instant close */
  protected onCancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  /** A tap on the dimmed area outside the sheet lands on the <dialog> itself */
  protected onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }

  private stopPreview(): void {
    clearTimeout(this.previewEnds);
    if (!this.previewing()) return;
    this.previewing.set(false);
    void this.nativeAdhan.stopAdhan();
  }
}
