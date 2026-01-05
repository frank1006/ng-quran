# Regression Test: User Store Migration

## Test Date: 2026-01-05
## Changes: Migration from individual localStorage keys to unified `user-store`

## Pre-Migration Test Scenarios

### 1. Migration from Old Keys
- [ ] **Test 1.1**: Fresh install (no existing data)
  - Expected: App works normally, creates new `user-store`
  - Status: ⏳ Pending

- [ ] **Test 1.2**: Migration from `quran-store`
  - Setup: Create old `quran-store` with bookmarks, reciter, positions
  - Expected: Data migrates to `user-store`, old key removed
  - Status: ⏳ Pending

- [ ] **Test 1.3**: Migration from `app_time_format`
  - Setup: Set `app_time_format` to '12h'
  - Expected: Migrates to `user-store.timeFormat`, old key removed
  - Status: ⏳ Pending

- [ ] **Test 1.4**: Migration from `quran-translation-language`
  - Setup: Set to 'bengali'
  - Expected: Migrates to `user-store.quranTranslationLanguage`, old key removed
  - Status: ⏳ Pending

- [ ] **Test 1.5**: Migration from `prayer_scheduled_notifications`
  - Setup: Create scheduled notifications array
  - Expected: Migrates to `user-store.prayerScheduledNotifications`, old key removed
  - Status: ⏳ Pending

- [ ] **Test 1.6**: Combined migration (all old keys present)
  - Setup: Create all old keys with data
  - Expected: All data migrates correctly to `user-store`
  - Status: ⏳ Pending

## Functional Tests

### 2. Quran Features
- [ ] **Test 2.1**: Bookmark functionality
  - Action: Add/remove bookmarks
  - Expected: Works correctly, persists in `user-store`
  - Status: ⏳ Pending

- [ ] **Test 2.2**: Reciter selection
  - Action: Select different reciter
  - Expected: Persists in `user-store.selectedReciterId`
  - Status: ⏳ Pending

- [ ] **Test 2.3**: Last read position
  - Action: Navigate to verse, close and reopen
  - Expected: Restores to last read position
  - Status: ⏳ Pending

- [ ] **Test 2.4**: Scroll position
  - Action: Scroll in surah, navigate away and back
  - Expected: Restores scroll position
  - Status: ⏳ Pending

- [ ] **Test 2.5**: Player state
  - Action: Play audio, navigate away and back
  - Expected: Restores player state
  - Status: ⏳ Pending

- [ ] **Test 2.6**: Translation language
  - Action: Change translation language
  - Expected: Persists in `user-store.quranTranslationLanguage`
  - Status: ⏳ Pending

### 3. Settings Features
- [ ] **Test 3.1**: Time format preference
  - Action: Switch between 12h/24h
  - Expected: Persists in `user-store.timeFormat`, prayer times update
  - Status: ⏳ Pending

- [ ] **Test 3.2**: Reset all data
  - Action: Click "Reset Data and Permissions"
  - Expected: Clears `user-store`, resets to defaults
  - Status: ⏳ Pending

### 4. Notification Features
- [ ] **Test 4.1**: Schedule notifications
  - Action: Enable notifications, schedule prayers
  - Expected: Saves to `user-store.prayerScheduledNotifications`
  - Status: ⏳ Pending

- [ ] **Test 4.2**: Load scheduled notifications
  - Action: Reload app with scheduled notifications
  - Expected: Loads from `user-store`, notifications work
  - Status: ⏳ Pending

- [ ] **Test 4.3**: Cancel notifications
  - Action: Disable notification for prayer
  - Expected: Updates `user-store.prayerScheduledNotifications`
  - Status: ⏳ Pending

## Offline Mode Tests

### 5. Offline Functionality
- [ ] **Test 5.1**: Offline - Load existing data
  - Setup: Go offline, app has existing `user-store`
  - Expected: All user preferences load correctly
  - Status: ⏳ Pending

- [ ] **Test 5.2**: Offline - Save new data
  - Setup: Go offline, add bookmark
  - Expected: Saves to `user-store`, persists when online
  - Status: ⏳ Pending

- [ ] **Test 5.3**: Offline - Service worker compatibility
  - Setup: Go offline, verify service worker works
  - Expected: Service worker doesn't break, app functions
  - Status: ⏳ Pending

- [ ] **Test 5.4**: Offline - Migration during offline
  - Setup: Go offline with old keys, load app
  - Expected: Migration happens, data available offline
  - Status: ⏳ Pending

## Service Worker Tests

### 6. Service Worker Compatibility
- [ ] **Test 6.1**: Service worker registration
  - Expected: Service worker registers correctly
  - Status: ⏳ Pending

- [ ] **Test 6.2**: Background sync
  - Expected: Background sync doesn't access localStorage directly
  - Status: ⏳ Pending

- [ ] **Test 6.3**: Cache API compatibility
  - Expected: Cache API works independently of localStorage changes
  - Status: ⏳ Pending

## Edge Cases

### 7. Error Handling
- [ ] **Test 7.1**: Corrupted `user-store` data
  - Setup: Corrupt JSON in `user-store`
  - Expected: Handles gracefully, clears corrupted data
  - Status: ⏳ Pending

- [ ] **Test 7.2**: Missing fields in `user-store`
  - Setup: `user-store` with missing fields
  - Expected: Validates and fills defaults
  - Status: ⏳ Pending

- [ ] **Test 7.3**: Storage quota exceeded
  - Setup: Fill localStorage to capacity
  - Expected: Handles gracefully, clears old bookmarks
  - Status: ⏳ Pending

- [ ] **Test 7.4**: Invalid migration data
  - Setup: Corrupted old keys
  - Expected: Skips corrupted data, continues migration
  - Status: ⏳ Pending

## Performance Tests

### 8. Performance
- [ ] **Test 8.1**: Initial load time
  - Expected: No significant increase in load time
  - Status: ⏳ Pending

- [ ] **Test 8.2**: Migration performance
  - Expected: Migration completes quickly (< 100ms)
  - Status: ⏳ Pending

- [ ] **Test 8.3**: Save debounce
  - Expected: Multiple rapid changes debounced correctly
  - Status: ⏳ Pending

## Browser Compatibility

### 9. Browser Tests
- [ ] **Test 9.1**: Chrome/Edge
  - Status: ⏳ Pending

- [ ] **Test 9.2**: Firefox
  - Status: ⏳ Pending

- [ ] **Test 9.3**: Safari
  - Status: ⏳ Pending

- [ ] **Test 9.4**: Mobile browsers
  - Status: ⏳ Pending

## Notes
- Service workers run in separate context and don't access localStorage directly
- All localStorage access is in main thread (Angular services)
- Migration is one-time only (runs if `user-store` doesn't exist)
- Old keys are automatically cleaned up after migration

