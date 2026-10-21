import { TestBed } from '@angular/core/testing';
import { UserStoreService } from './user-store.service';

describe('UserStoreService: the translation turned off', () => {
  beforeEach(() => localStorage.clear());

  it('keeps "none" on the phone and in what goes to the account', () => {
    const store = TestBed.inject(UserStoreService);
    store.setQuranTranslationLanguage('none');
    expect(store.quranTranslationLanguage()).toBe('none');
    expect(store.syncedData().translation).toBe('none');
  });

  it('takes "none" from the account', () => {
    const store = TestBed.inject(UserStoreService);
    store.applySynced({ translation: 'none' });
    expect(store.quranTranslationLanguage()).toBe('none');
  });
});
