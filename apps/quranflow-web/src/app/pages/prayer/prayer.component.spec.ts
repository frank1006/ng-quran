import { TestBed } from '@angular/core/testing';
import { PrayerComponent } from './prayer.component';
import { PrayerTimeStore } from '../../store/prayer-time.store';
import { PrayerTrajectoryService } from './services/prayer-trajectory.service';
import { of } from 'rxjs';
import { vi } from 'vitest';

describe('PrayerComponent', () => {
  let component: PrayerComponent;
  let store: PrayerTimeStore;
  let trajectoryService: PrayerTrajectoryService;

  beforeEach(async () => {
    const storeSpy = {
      loading: vi.fn(() => false),
      error: vi.fn(() => null),
      preloadPrayerTimes: vi.fn(() => of([])),
      getCachedPrayerTimes: vi.fn(() => null),
      getPrayerTimes: vi.fn(() => of(null)),
      hasDataForRange: vi.fn(() => false)
    };

    const trajectoryServiceSpy = {
      updateCurrentTime: vi.fn(),
      calculateTrajectory: vi.fn(() => null)
    };

    await TestBed.configureTestingModule({
      imports: [PrayerComponent],
      providers: [
        { provide: PrayerTimeStore, useValue: storeSpy },
        { provide: PrayerTrajectoryService, useValue: trajectoryServiceSpy }
      ]
    }).compileComponents();

    store = TestBed.inject(PrayerTimeStore);
    trajectoryService = TestBed.inject(PrayerTrajectoryService);
    const fixture = TestBed.createComponent(PrayerComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load prayer times on init', () => {
    const mockData = {
      date: '2024-12-29',
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

    vi.spyOn(store, 'preloadPrayerTimes').mockReturnValue(of([mockData]));
    vi.spyOn(store, 'getCachedPrayerTimes').mockReturnValue(mockData);
    
    component.ngOnInit();

    expect(store.preloadPrayerTimes).toHaveBeenCalled();
  });
});
