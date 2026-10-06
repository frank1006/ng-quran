import { Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { HijriCalendarService } from './hijri-calendar.service';
import { IslamicEvent } from './islamic-events';
import { SegmentedIndicatorDirective } from '../shared/directives/segmented-indicator.directive';

export type CalendarView = 'gregorian' | 'hijri' | 'events';

/**
 * Bottom sheet with the calendars and Islamic events, opened from the date on the Prayer page.
 * A native <dialog>: it keeps focus inside, closes on Escape or a tap on the dimmed backdrop,
 * and returns focus to the date afterwards. It slides up when opening and down when closing.
 */
@Component({
  selector: 'app-calendar-sheet',
  imports: [NgTemplateOutlet, SegmentedIndicatorDirective],
  templateUrl: './calendar-sheet.component.html',
  styleUrl: './calendar-sheet.component.css'
})
export class CalendarSheetComponent {
  protected readonly hijri = inject(HijriCalendarService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('sheet');

  /** Jump the Prayer page to a day (the sheet closes) */
  readonly goToDate = output<Date>();

  protected readonly view = signal<CalendarView>('gregorian');
  protected readonly selected = signal(startOfDay(new Date()));
  protected readonly closing = signal(false);

  protected readonly views: { id: CalendarView; label: string }[] = [
    { id: 'gregorian', label: 'Gregorian' },
    { id: 'hijri', label: 'Hijri' },
    { id: 'events', label: 'Events' }
  ];

  protected readonly isTodaySelected = computed(() => sameDay(this.selected(), new Date()));

  protected readonly gregorianTitle = computed(() =>
    this.selected().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

  protected readonly hijriTitle = computed(() => this.hijri.format(this.selected()));

  protected readonly dayEvents = computed<IslamicEvent[]>(() => this.hijri.eventsOn(this.selected()));
  protected readonly isWhiteDay = computed(() => this.hijri.isWhiteDay(this.selected()));

  /** Upcoming events for the next year, grouped by Gregorian month */
  protected readonly upcomingGroups = computed(() => {
    if (this.view() !== 'events') return [];
    const today = startOfDay(new Date());
    const groups: { key: string; gregorian: string; hijri: string; items: { name: string; description: string; when: string; away: string; icon: IslamicEvent['icon'] }[] }[] = [];
    for (const { event, date, hijri } of this.hijri.upcoming(today, 400)) {
      const key = `${date.getFullYear()}-${date.getMonth()}`;
      let group = groups.find(g => g.key === key);
      if (!group) {
        group = {
          key,
          gregorian: date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
          hijri: this.hijriSpan(date),
          items: []
        };
        groups.push(group);
      }
      const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
      group.items.push({
        name: event.name,
        description: event.description,
        icon: event.icon,
        when: `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} · ${hijri.day} ${hijri.monthName}`,
        away: days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
      });
    }
    return groups;
  });

  /** The Hijri months a Gregorian month spans: "Rajab – Sha'ban 1448" */
  private hijriSpan(date: Date): string {
    const first = this.hijri.toHijri(new Date(date.getFullYear(), date.getMonth(), 1));
    const last = this.hijri.toHijri(new Date(date.getFullYear(), date.getMonth() + 1, 0));
    if (first.month === last.month) return `${first.monthName} ${first.year}`;
    if (first.year === last.year) return `${first.monthName} – ${last.monthName} ${last.year}`;
    return `${first.monthName} ${first.year} – ${last.monthName} ${last.year}`;
  }

  open(date: Date): void {
    this.selected.set(startOfDay(date));
    this.closing.set(false);
    const dialog = this.dialog().nativeElement;
    if (!dialog.open) dialog.showModal();
    void this.hijri.ensureMonth(date);
  }

  /** Slide down, then close */
  close(): void {
    const dialog = this.dialog().nativeElement;
    if (!dialog.open || this.closing()) return;
    this.closing.set(true);
    const finish = () => {
      dialog.close();
      this.closing.set(false);
    };
    dialog.addEventListener('animationend', finish, { once: true });
    // In case no animation runs (unsupported or already at rest)
    setTimeout(() => { if (dialog.open) finish(); }, 400);
  }

  protected setView(view: CalendarView): void {
    this.view.set(view);
  }

  protected showToday(): void {
    this.selected.set(startOfDay(new Date()));
  }

  protected viewPrayerTimes(): void {
    this.goToDate.emit(this.selected());
    this.close();
  }

  /** Escape: animate out instead of the instant close */
  protected onCancel(event: Event): void {
    event.preventDefault();
    this.close();
  }

  /** A tap on the dimmed area outside the sheet lands on the <dialog> itself */
  protected onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) this.close();
  }
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
