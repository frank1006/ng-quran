import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { QuranApiService } from './quran-api.service';
import { Chapter, ChapterWithVerses, VerseWithTranslation, Tafsir, Reciter, AudioRecitation } from './quran-api.types';
import { firstValueFrom } from 'rxjs';

describe('QuranApiService', () => {
  let service: QuranApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [QuranApiService]
    });
    service = TestBed.inject(QuranApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getChapters', () => {
    it('should return chapters array', async () => {
      const mockChapters: Chapter[] = [
        {
          id: 1,
          name: 'Al-Fatiha',
          transliteration: 'Al-Fatiha',
          translation: 'The Opening',
          type: 'Meccan',
          total_verses: 7
        },
        {
          id: 2,
          name: 'Al-Baqarah',
          transliteration: 'Al-Baqarah',
          translation: 'The Cow',
          type: 'Medinan',
          total_verses: 286
        }
      ];

      const resultPromise = firstValueFrom(service.getChapters());

      const req = httpMock.expectOne('https://quranapi.pages.dev/api/chapters');
      expect(req.request.method).toBe('GET');
      req.flush(mockChapters);

      const result = await resultPromise;
      expect(result).toEqual(mockChapters);
      expect(result.length).toBe(2);
    });

    it('should handle HTTP errors', async () => {
      const resultPromise = firstValueFrom(service.getChapters());

      const req = httpMock.expectOne('https://quranapi.pages.dev/api/chapters');
      req.error(new ProgressEvent('Network error'));

      await expect(resultPromise).rejects.toThrow();
    });
  });

  describe('getChapter', () => {
    it('should return chapter with verses', async () => {
      const mockChapter: ChapterWithVerses = {
        id: 1,
        name: 'Al-Fatiha',
        transliteration: 'Al-Fatiha',
        translation: 'The Opening',
        type: 'Meccan',
        total_verses: 7,
        verses: []
      };

      const resultPromise = firstValueFrom(service.getChapter(1));

      const req = httpMock.expectOne('https://quranapi.pages.dev/api/chapters/1');
      expect(req.request.method).toBe('GET');
      req.flush(mockChapter);

      const result = await resultPromise;
      expect(result.id).toBe(1);
      expect(result.name).toBe('Al-Fatiha');
    });

    it('should include language parameter when provided', async () => {
      const mockChapter: ChapterWithVerses = {
        id: 1,
        name: 'Al-Fatiha',
        transliteration: 'Al-Fatiha',
        translation: 'The Opening',
        type: 'Meccan',
        total_verses: 7,
        verses: []
      };

      const resultPromise = firstValueFrom(service.getChapter(1, 'en'));

      const req = httpMock.expectOne('https://quranapi.pages.dev/api/chapters/1?language=en');
      expect(req.request.method).toBe('GET');
      req.flush(mockChapter);

      const result = await resultPromise;
      expect(result).toBeTruthy();
    });
  });

  describe('getVerse', () => {
    it('should return verse with translation', async () => {
      const mockVerse: VerseWithTranslation = {
        id: 1,
        verse_number: 1,
        chapter_id: 1,
        verse_key: '1:1',
        translations: []
      };

      const resultPromise = firstValueFrom(service.getVerse(1, 1));

      const req = httpMock.expectOne('https://quranapi.pages.dev/api/chapters/1/verses/1');
      expect(req.request.method).toBe('GET');
      req.flush(mockVerse);

      const result = await resultPromise;
      expect(result.chapter_id).toBe(1);
      expect(result.verse_number).toBe(1);
    });
  });

  describe('getTafsir', () => {
    it('should return tafsir array', async () => {
      const mockTafsir: Tafsir[] = [
        {
          id: 1,
          resource_id: 1,
          text: 'Tafsir text here'
        }
      ];

      const resultPromise = firstValueFrom(service.getTafsir(1, 1));

      const req = httpMock.expectOne('https://quranapi.pages.dev/api/chapters/1/verses/1/tafsir');
      expect(req.request.method).toBe('GET');
      req.flush(mockTafsir);

      const result = await resultPromise;
      expect(result.length).toBe(1);
      expect(result[0].text).toBe('Tafsir text here');
    });
  });

  describe('getTranslation', () => {
    it('should return translation data', async () => {
      const mockTranslation = { data: 'translation data' };

      const resultPromise = firstValueFrom(service.getTranslation('en'));

      const req = httpMock.expectOne('https://quranapi.pages.dev/api/translations/en');
      expect(req.request.method).toBe('GET');
      req.flush(mockTranslation);

      const result = await resultPromise;
      expect(result).toBeTruthy();
    });
  });

  describe('getReciters', () => {
    it('should return reciters array', async () => {
      const mockReciters: Reciter[] = [
        {
          id: 1,
          name: 'Reciter Name'
        }
      ];

      const resultPromise = firstValueFrom(service.getReciters());

      const req = httpMock.expectOne('https://quranapi.pages.dev/api/reciters');
      expect(req.request.method).toBe('GET');
      req.flush(mockReciters);

      const result = await resultPromise;
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('Reciter Name');
    });
  });

  describe('getAudioRecitation', () => {
    it('should return audio recitation', async () => {
      const mockAudio: AudioRecitation = {
        audio_url: 'https://example.com/audio.mp3'
      };

      const resultPromise = firstValueFrom(service.getAudioRecitation(1, 1, 1));

      const req = httpMock.expectOne('https://quranapi.pages.dev/api/reciters/1/chapters/1/verses/1/audio');
      expect(req.request.method).toBe('GET');
      req.flush(mockAudio);

      const result = await resultPromise;
      expect(result.audio_url).toBe('https://example.com/audio.mp3');
    });
  });
});
