import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { LateReminderNoteComponent } from './late-reminder-note.component';
import { NativeAdhanService } from '../../../../services/native-adhan.service';
import { LateRing } from '../../../../core/native-app';

describe('LateReminderNoteComponent', () => {
  const lateRing = signal<LateRing | null>(null);
  const batteryUnrestricted = signal(false);
  const adhan = {
    lateRing,
    batteryUnrestricted,
    dismissLateRing: vi.fn(async () => lateRing.set(null)),
    openBatterySettings: vi.fn(async () => undefined),
  };

  const render = () => {
    const fixture = TestBed.createComponent(LateReminderNoteComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  beforeEach(() => {
    lateRing.set(null);
    batteryUnrestricted.set(false);
    adhan.dismissLateRing.mockClear();
    adhan.openBatterySettings.mockClear();
    TestBed.configureTestingModule({ providers: [{ provide: NativeAdhanService, useValue: adhan }] });
  });

  it('says nothing until a reminder actually comes late', () => {
    expect(render().textContent?.trim()).toBe('');
  });

  it('names the prayer and how late it was', () => {
    lateRing.set({ prayer: 'maghrib', minutesLate: 4, at: 0 });
    expect(render().textContent).toContain("Maghrib's reminder came 4 minutes late");
  });

  it('stays quiet when battery is already unrestricted (it would not help)', () => {
    lateRing.set({ prayer: 'fajr', minutesLate: 2, at: 0 });
    batteryUnrestricted.set(true);
    expect(render().textContent?.trim()).toBe('');
  });

  it('puts the note away and opens settings', async () => {
    lateRing.set({ prayer: 'isha', minutesLate: 1, at: 0 });
    const element = render();
    expect(element.textContent).toContain('1 minute late');
    (element.querySelector('.open') as HTMLButtonElement).click();
    await Promise.resolve();
    await Promise.resolve();
    expect(adhan.dismissLateRing).toHaveBeenCalled();
    expect(adhan.openBatterySettings).toHaveBeenCalled();
  });
});
