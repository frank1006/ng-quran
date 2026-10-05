import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { QuranApiService } from './quran-api.service';
import { firstValueFrom } from 'rxjs';

const BASE = 'https://quranapi.pages.dev/api/';
const LOCAL = '/data/quran/';

describe('QuranApiService', () => {
  let service: QuranApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
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
    it('maps the surah list to chapters numbered from 1', async () => {
      const resultPromise = firstValueFrom(service.getChapters());

      httpMock.expectOne(`${LOCAL}surah.json`).flush([
        {
          surahName: 'Al-Faatiha',
          surahNameArabic: 'الفاتحة',
          surahNameArabicLong: 'سُورَةُ ٱلْفَاتِحَةِ',
          surahNameTranslation: 'The Opening',
          revelationPlace: 'Mecca',
          totalAyah: 7
        }
      ]);

      const result = await resultPromise;
      expect(result).toEqual([
        {
          id: 1,
          name: 'الفاتحة',
          transliteration: 'Al-Faatiha',
          translation: 'The Opening',
          type: 'Meccan',
          total_verses: 7
        }
      ]);
    });

    it('falls back to the online API when the bundled file is missing', async () => {
      const resultPromise = firstValueFrom(service.getChapters());
      httpMock.expectOne(`${LOCAL}surah.json`).flush('missing', { status: 404, statusText: 'Not Found' });
      httpMock.expectOne(`${BASE}surah.json`).flush([]);
      expect(await resultPromise).toEqual([]);
    });

    it('surfaces HTTP errors when both sources fail', async () => {
      const resultPromise = firstValueFrom(service.getChapters());
      httpMock.expectOne(`${LOCAL}surah.json`).flush('missing', { status: 404, statusText: 'Not Found' });
      httpMock.expectOne(`${BASE}surah.json`).flush('error', { status: 500, statusText: 'Server Error' });
      await expect(resultPromise).rejects.toBeTruthy();
    });
  });

  describe('getTafsir', () => {
    it('should return tafsir for a verse', async () => {
      const resultPromise = firstValueFrom(service.getTafsir(1, 1));

      const req = httpMock.expectOne(`${BASE}tafsir/1_1.json`);
      expect(req.request.method).toBe('GET');
      req.flush({ text: 'Tafsir text here' });

      const result = await resultPromise;
      expect(result.text).toBe('Tafsir text here');
    });
  });

  describe('getTranslation', () => {
    it('requests the full translation for a language', async () => {
      const resultPromise = firstValueFrom(service.getTranslation('english' as never));
      httpMock.expectOne(`${BASE}english.json`).flush({ '1': { '1': 'In the Name of Allah' } });

      const result = await resultPromise;
      expect(result['1']['1']).toBe('In the Name of Allah');
    });
  });
});
