import { Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { ReminderMode } from '../../../../services/notification.types';
import { NativeAdhanService } from '../../../../services/native-adhan.service';
import { isNativeApp } from '../../../../core/native-app';

export interface ReminderSheetPrayer {
  key: string;
  name: string;
  time: string;
}

export interface ReminderChoice {
  prayer: ReminderSheetPrayer;
  mode: ReminderMode;
  /** Use the choice for all five prayers (Shuruq stays as it is) */
  allPrayers: boolean;
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
  imports: [ReminderIconComponent],
  templateUrl: './reminder-sheet.component.html',
  styleUrl: './reminder-sheet.component.css'
})
export class ReminderSheetComponent {
  private readonly nativeAdhan = inject(NativeAdhanService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('sheet');

  readonly chosen = output<ReminderChoice>();

  protected readonly prayer = signal<ReminderSheetPrayer | null>(null);
  protected readonly current = signal<ReminderMode>('off');
  protected readonly allPrayers = signal(false);
  protected readonly previewing = signal(false);
  protected readonly closing = signal(false);

  protected readonly isSunrise = computed(() => this.prayer()?.key === 'sunrise');

  protected readonly options = computed<ReminderOption[]>(() => {
    const fajr = this.prayer()?.key === 'fajr';
    const options: ReminderOption[] = [
      { mode: 'adhan', label: 'Full adhan', hint: fajr ? 'Fajr adhan by Mishary al-Afasy' : 'Adhan by Ahmed al-Imadi' },
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
    this.allPrayers.set(false);
    this.closing.set(false);
    const dialog = this.dialog().nativeElement;
    if (!dialog.open) dialog.showModal();
  }

  protected choose(mode: ReminderMode): void {
    const prayer = this.prayer();
    if (!prayer) return;
    this.current.set(mode);
    this.chosen.emit({ prayer, mode, allPrayers: this.allPrayers() && !this.isSunrise() });
    this.close();
  }

  /** Plays the adhan this prayer would get, or stops it */
  protected async togglePreview(): Promise<void> {
    if (this.previewing()) {
      this.previewing.set(false);
      await this.nativeAdhan.stopAdhan();
    } else {
      this.previewing.set(true);
      await this.nativeAdhan.testAdhan(this.prayer()?.key === 'fajr' ? 'fajr' : 'dhuhr');
    }
  }

  protected onAllPrayersChange(event: Event): void {
    this.allPrayers.set((event.target as HTMLInputElement).checked);
  }

  /** Slide down, then close; a preview that is still playing stops */
  close(): void {
    const dialog = this.dialog().nativeElement;
    if (!dialog.open || this.closing()) return;
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
    if (!this.previewing()) return;
    this.previewing.set(false);
    void this.nativeAdhan.stopAdhan();
  }
}
