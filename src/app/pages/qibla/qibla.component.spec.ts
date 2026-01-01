import { TestBed } from '@angular/core/testing';
import { computed } from '@angular/core';
import { QiblaComponent } from './qibla.component';
import { PrayerTimeStore } from '../../store/prayer-time.store';
import { QiblaService } from './services/qibla.service';
import { of } from 'rxjs';
import { vi } from 'vitest';

describe('QiblaComponent', () => {
  let component: QiblaComponent;
  let fixture: any;
  let mockPrayerTimeStore: any;
  let mockQiblaService: Partial<QiblaService>;

  beforeEach(async () => {
    const locationValue = { latitude: 25.2048, longitude: 55.2708 };
    const locationSignal = computed(() => locationValue);

    mockPrayerTimeStore = {
      currentLocation: locationSignal,
      preloadPrayerTimes: vi.fn(() => of([]))
    };

    mockQiblaService = {
      calculateQiblaBearing: vi.fn(() => 90),
      getCityName: vi.fn(() => Promise.resolve('Dubai')),
      getDeviceHeading: vi.fn(() => of(0)),
      calculateAngleDifference: vi.fn(() => 0),
      getInstruction: vi.fn(() => 'Turn to your left' as any)
    };

    await TestBed.configureTestingModule({
      imports: [QiblaComponent],
      providers: [
        { provide: PrayerTimeStore, useValue: mockPrayerTimeStore },
        { provide: QiblaService, useValue: mockQiblaService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(QiblaComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
