import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { QiblaService } from './qibla.service';
import { magneticDeclination } from './magnetic-declination';

const MISSISSAUGA = { latitude: 43.589, longitude: -79.644 };

/** A browser's absolute orientation reading: alpha counter-clockwise from magnetic north */
function orientation(alpha: number): Event {
  const event = new Event('deviceorientation');
  Object.assign(event, { alpha, beta: 0, gamma: 0, absolute: true });
  return event;
}

describe("QiblaService: a browser's compass turned to true north", () => {
  let frames: FrameRequestCallback[];

  beforeEach(() => {
    frames = [];
    // A browser with orientation events but no iPhone permission call
    vi.stubGlobal('DeviceOrientationEvent', class {});
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
  });

  afterEach(() => vi.unstubAllGlobals());

  const headingFor = (place?: typeof MISSISSAUGA) => {
    const headings: (number | null)[] = [];
    const subscription = TestBed.inject(QiblaService).getDeviceHeading(place).subscribe(h => headings.push(h));
    window.dispatchEvent(orientation(0)); // the phone's top points to magnetic north
    frames.splice(0).forEach(frame => frame(0));
    subscription.unsubscribe();
    return headings.at(-1);
  };

  it('points magnetic north about 10° west of true north in Mississauga', () => {
    const expected = (magneticDeclination(MISSISSAUGA.latitude, MISSISSAUGA.longitude) + 360) % 360;
    expect(expected).toBeGreaterThan(349);
    expect(expected).toBeLessThan(351);
    expect(headingFor(MISSISSAUGA)).toBeCloseTo(expected, 1);
  });

  it('leaves the heading as the compass reads it without a place', () => {
    expect(headingFor()).toBe(0);
  });
});
