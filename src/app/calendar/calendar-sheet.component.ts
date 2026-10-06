import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { HijriCalendarService } from './hijri-calendar.service';
import { IslamicEvent } from './islamic-events';
import { SegmentedIndicatorDirective } from '../shared/directives/segmented-indicator.directive';

export type CalendarView = 'gregorian' | 'hijri' | 'events';

interface DayCell {
  date: Date;
  key: string;
  /** Day number in the calendar being viewed */
  primary: number;
  /** The other calendar's day, small underneath */
  secondary: string;
  isToday: boolean;
  isSelected: boolean;
  hasEvent: boolean;
  isWhiteDay: boolean;
  label: string;
}

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


  protected readonly view = signal<CalendarView>('gregorian');
  protected readonly selected = signal(startOfDay(new Date()));
  protected readonly closing = signal(false);
  /** Any day inside the month shown in the grid */
  protected readonly anchor = signal(startOfDay(new Date()));
  /** Which way the grid last moved, for its slide-in */
  protected readonly slide = signal<'next' | 'prev'>('next');
  protected readonly weekdays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private swipeStart: { x: number; y: number } | null = null;

  protected readonly views: { id: CalendarView; label: string }[] = [
    { id: 'gregorian', label: 'Gregorian' },
    { id: 'hijri', label: 'Hijri' },
    { id: 'events', label: 'Events' }
  ];

  /** The days of the month shown: a Gregorian month, or a Hijri month (which spans two Gregorian ones) */
  private readonly monthDays = computed<Date[]>(() => {
    const anchor = this.anchor();
    if (this.view() === 'hijri') {
      const { start, end } = this.hijriMonthRange(anchor);
      const days: Date[] = [];
      for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
      return days;
    }
    const count = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();
    return Array.from({ length: count }, (_, i) => new Date(anchor.getFullYear(), anchor.getMonth(), i + 1));
  });

  /** Grid cells, with empty ones before the 1st so it lands on its weekday */
  protected readonly cells = computed<(DayCell | null)[]>(() => {
    const days = this.monthDays();
    if (days.length === 0) return [];
    const hijriView = this.view() === 'hijri';
    const today = startOfDay(new Date());
    const selected = this.selected();
    const blanks: null[] = Array.from({ length: days[0].getDay() }, () => null);
    return [
      ...blanks,
      ...days.map(date => {
        const hijri = this.hijri.toHijri(date);
        const events = this.hijri.eventsOn(date);
        const white = this.hijri.isWhiteDay(date);
        const gregorianShort = date.getDate() === 1
          ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
          : String(date.getDate());
        const parts = [
          date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
          `${hijri.day} ${hijri.monthName} ${hijri.year}`,
          ...events.map(e => e.name),
          ...(white ? ['White Day'] : [])
        ];
        return {
          date,
          key: dayKey(date),
          primary: hijriView ? hijri.day : date.getDate(),
          secondary: hijriView ? gregorianShort : String(hijri.day),
          isToday: sameDay(date, today),
          isSelected: sameDay(date, selected),
          hasEvent: events.length > 0,
          isWhiteDay: white,
          label: parts.join(', ')
        };
      })
    ];
  });

  /** "October 2026" or "Rabi' al-Thani 1448" */
  protected readonly monthTitle = computed(() => {
    const days = this.monthDays();
    if (days.length === 0) return '';
    if (this.view() === 'hijri') {
      const h = this.hijri.toHijri(days[0]);
      return `${h.monthName} ${h.year}`;
    }
    return days[0].toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  });

  /** The other calendar's months: "Rabi' al-Thani – Jumada al-Ula 1448" or "Sep – Oct 2026" */
  protected readonly monthSubtitle = computed(() => {
    const days = this.monthDays();
    if (days.length === 0) return '';
    const first = days[0];
    const last = days[days.length - 1];
    if (this.view() === 'hijri') {
      const sameYear = first.getFullYear() === last.getFullYear();
      const a = first.toLocaleDateString('en-GB', sameYear ? { month: 'short' } : { month: 'short', year: 'numeric' });
      const b = last.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
      return first.getMonth() === last.getMonth() && sameYear ? b : `${a} – ${b}`;
    }
    return this.hijriSpan(first);
  });

  /** Changes whenever the grid shows a different month, so it re-renders with a slide */
  protected readonly monthKey = computed(() => `${this.view()}:${this.monthDays()[0] ? dayKey(this.monthDays()[0]) : ''}`);

  protected readonly selectedSummary = computed(() =>
    `${this.selected().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · ${this.hijri.toHijri(this.selected()).day} ${this.hijri.toHijri(this.selected()).monthName}`);

  protected readonly isTodaySelected = computed(() => sameDay(this.selected(), new Date()));

  /** Another day is chosen, or the grid shows another month */
  protected readonly awayFromToday = computed(() =>
    !this.isTodaySelected() || !this.monthDays().some(d => sameDay(d, new Date())));



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
          hijri: this.hijriSpan(date, true),
          items: []
        };
        groups.push(group);
      }
      const days = Math.round((date.getTime() - today.getTime()) / 86_400_000);
      group.items.push({
        name: event.name,
        description: event.description,
        icon: event.icon,
        // The heading has the month and year, so the row only needs the day
        when: `${date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${hijri.day} ${hijri.monthName}`,
        away: days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`
      });
    }
    return groups;
  });

  /** The Hijri months a Gregorian month spans: "Rajab – Sha'ban 1448" */
  private hijriSpan(date: Date, compact = false): string {
    const first = this.hijri.toHijri(new Date(date.getFullYear(), date.getMonth(), 1));
    const last = this.hijri.toHijri(new Date(date.getFullYear(), date.getMonth() + 1, 0));
    if (first.month === last.month) return `${first.monthName} ${first.year}`;
    if (first.year === last.year) return `${first.monthName} – ${last.monthName} ${last.year}`;
    // Across a new Hijri year; compact (list headings) names only the second year
    return compact
      ? `${first.monthName} – ${last.monthName} ${last.year}`
      : `${first.monthName} ${first.year} – ${last.monthName} ${last.year}`;
  }

  open(date: Date): void {
    this.selected.set(startOfDay(date));
    this.anchor.set(startOfDay(date));
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
    this.anchor.set(this.selected());
  }

  protected showToday(): void {
    const today = startOfDay(new Date());
    this.slide.set(today < this.anchor() ? 'prev' : 'next');
    this.selected.set(today);
    this.anchor.set(today);
  }

  protected previousMonth(): void {
    this.slide.set('prev');
    const first = this.monthDays()[0];
    this.anchor.set(this.view() === 'hijri' ? addDays(first, -1) : new Date(first.getFullYear(), first.getMonth() - 1, 1));
  }

  protected nextMonth(): void {
    this.slide.set('next');
    const days = this.monthDays();
    const last = days[days.length - 1];
    this.anchor.set(this.view() === 'hijri' ? addDays(last, 1) : new Date(last.getFullYear(), last.getMonth() + 1, 1));
  }

  protected selectDay(cell: DayCell): void {
    this.selected.set(cell.date);
  }

  /** Arrow keys move a day or a week; Home/End jump to the month's ends */
  protected onGridKeydown(event: KeyboardEvent): void {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let target: Date | null = null;
    if (event.key in steps) target = addDays(this.selected(), steps[event.key]);
    else if (event.key === 'Home') target = this.monthDays()[0];
    else if (event.key === 'End') target = this.monthDays()[this.monthDays().length - 1];
    if (!target) return;
    event.preventDefault();
    const days = this.monthDays();
    if (target < days[0] || target > days[days.length - 1]) {
      this.slide.set(target < days[0] ? 'prev' : 'next');
      this.anchor.set(target);
    }
    this.selected.set(target);
    const key = dayKey(target);
    setTimeout(() => this.host.querySelector<HTMLElement>(`[data-day="${key}"]`)?.focus());
  }

  /** A horizontal swipe on the grid changes month */
  protected onSwipeStart(event: PointerEvent): void {
    this.swipeStart = { x: event.clientX, y: event.clientY };
  }

  protected onSwipeEnd(event: PointerEvent): void {
    if (!this.swipeStart) return;
    const dx = event.clientX - this.swipeStart.x;
    const dy = event.clientY - this.swipeStart.y;
    this.swipeStart = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) this.nextMonth();
    else this.previousMonth();
  }

  /** First and last Gregorian day of the Hijri month containing `date` */
  private hijriMonthRange(date: Date): { start: Date; end: Date } {
    const month = this.hijri.toHijri(date).month;
    let start = startOfDay(date);
    for (let i = 0; i < 31 && this.hijri.toHijri(addDays(start, -1)).month === month; i++) start = addDays(start, -1);
    let end = startOfDay(date);
    for (let i = 0; i < 31 && this.hijri.toHijri(addDays(end, 1)).month === month; i++) end = addDays(end, 1);
    return { start, end };
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

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}
