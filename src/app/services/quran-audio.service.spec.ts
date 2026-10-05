import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { QuranAudioService } from './quran-audio.service';
import { UserStoreService } from './user-store.service';

describe('QuranAudioService repeat', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
  });

  it('cycles off → surah → ayah → off and remembers the choice', () => {
    const audio = TestBed.inject(QuranAudioService);
    expect(audio.repeat()).toBe('off');
    audio.cycleRepeat();
    expect(audio.repeat()).toBe('surah');
    expect(localStorage.getItem('quran-repeat')).toBe('surah');
    audio.cycleRepeat();
    expect(audio.repeat()).toBe('ayah');
    expect(audio.repeatLabel()).toBe('Repeating ayah');
    audio.cycleRepeat();
    expect(audio.repeat()).toBe('off');
  });
});

describe('UserStoreService last read', () => {
  beforeEach(() => localStorage.clear());

  it('tracks the most recent verse across surahs', () => {
    const store = TestBed.inject(UserStoreService);
    expect(store.lastRead()).toBeNull();
    store.setLastReadPosition(2, 255);
    store.setLastReadPosition(18, 10);
    expect(store.lastRead()).toEqual({ chapterId: 18, verseNumber: 10, via: 'read' });
    expect(store.getLastReadPosition(2)).toBe(255);
  });

  it('records whether the place was reached by listening', () => {
    const store = TestBed.inject(UserStoreService);
    store.setLastReadPosition(36, 5, 'listen');
    expect(store.lastRead()).toEqual({ chapterId: 36, verseNumber: 5, via: 'listen' });
    store.setLastReadPosition(36, 5);
    expect(store.lastRead()?.via).toBe('read');
  });
});
