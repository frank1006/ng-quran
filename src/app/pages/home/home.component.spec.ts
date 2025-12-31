import { TestBed } from '@angular/core/testing';
import { HomeComponent } from './home.component';
import { PrayerTimeService } from '../../services/prayer-time.service';
import { of } from 'rxjs';
import { vi } from 'vitest';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let service: PrayerTimeService;

  beforeEach(async () => {
    const serviceSpy = {
      getTodayPrayerTimes: vi.fn()
    };

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        { provide: PrayerTimeService, useValue: serviceSpy }
      ]
    }).compileComponents();

    service = TestBed.inject(PrayerTimeService);
    const fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load prayer times on init', () => {
    const mockData = {
      date: '29 Dec 2024',
      timings: {
        fajr: '05:30',
        sunrise: '07:00',
        dhuhr: '12:30',
        asr: '15:00',
        maghrib: '17:30',
        isha: '19:00'
      },
      location: { latitude: 0, longitude: 0 }
    };

    vi.spyOn(service, 'getTodayPrayerTimes').mockReturnValue(of(mockData));
    component.ngOnInit();

    expect(service.getTodayPrayerTimes).toHaveBeenCalled();
  });
});
