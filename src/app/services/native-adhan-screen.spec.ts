import { TestBed } from '@angular/core/testing';
import { NativeAdhanService } from './native-adhan.service';

// On the website the phone's plugin isn't there: every call to it rejects
describe('NativeAdhanService: the adhan screen setting', () => {
  it('is unknown until the phone says (older app versions never do)', () => {
    expect(TestBed.inject(NativeAdhanService).adhanScreen()).toBeNull();
  });

  it('goes back to how it was when the phone refuses', async () => {
    const adhan = TestBed.inject(NativeAdhanService);
    await adhan.setAdhanScreen(true);
    expect(adhan.adhanScreen()).toBe(false);
  });
});
