# Cache Implementation Regression Test Plan

## Test Scenarios

### 1. Listing Page (`/quran`) - Chapters Cache

#### Test 1.1: First Load (No Cache)
- **Action**: Navigate to `/quran` for the first time (clear localStorage first)
- **Expected**: 
  - ✅ HTTP request to `/api/surah.json`
  - ✅ Data saved to localStorage with key `quran-api-chapters`
  - ✅ In-memory cache (`chaptersCache$`) populated
- **Verify**: Check Network tab for HTTP request, check localStorage

#### Test 1.2: Second Load (In-Memory Cache)
- **Action**: Navigate away and back to `/quran` (without clearing cache)
- **Expected**: 
  - ✅ NO HTTP request (uses in-memory cache)
  - ✅ Data loads instantly
- **Verify**: Check Network tab - should see NO request to `surah.json`

#### Test 1.3: Page Refresh (localStorage Cache)
- **Action**: Refresh the page (F5) while on `/quran`
- **Expected**: 
  - ✅ NO HTTP request (uses localStorage cache)
  - ✅ Data loads instantly
  - ✅ In-memory cache repopulated from localStorage
- **Verify**: Check Network tab - should see NO request to `surah.json`

#### Test 1.4: App Restart (localStorage Cache)
- **Action**: Close and reopen the app, navigate to `/quran`
- **Expected**: 
  - ✅ NO HTTP request (uses localStorage cache)
  - ✅ Data loads instantly
- **Verify**: Check Network tab - should see NO request to `surah.json`

---

### 2. Listing Page (`/quran`) - Reciters Cache

#### Test 2.1: First Load (No Cache)
- **Action**: Navigate to `/quran` for the first time (clear localStorage first)
- **Expected**: 
  - ✅ HTTP request to `/api/reciters.json`
  - ✅ Data saved to localStorage with key `quran-api-reciters`
  - ✅ In-memory cache (`recitersCache$`) populated
- **Verify**: Check Network tab for HTTP request, check localStorage

#### Test 2.2: Second Load (In-Memory Cache)
- **Action**: Navigate away and back to `/quran`
- **Expected**: 
  - ✅ NO HTTP request (uses in-memory cache)
- **Verify**: Check Network tab - should see NO request to `reciters.json`

#### Test 2.3: Page Refresh (localStorage Cache)
- **Action**: Refresh the page (F5) while on `/quran`
- **Expected**: 
  - ✅ NO HTTP request (uses localStorage cache)
- **Verify**: Check Network tab - should see NO request to `reciters.json`

---

### 3. Detail Page (`/quran/:surahId`) - Chapter Cache

#### Test 3.1: First Load (No Cache)
- **Action**: Navigate to `/quran/1` for the first time (clear localStorage first)
- **Expected**: 
  - ✅ HTTP request to `/api/1.json`
  - ✅ Data saved to localStorage with key `quran-api-chapter-1`
  - ✅ In-memory cache (`chapterCacheMap`) populated with key `1`
- **Verify**: Check Network tab for HTTP request, check localStorage

#### Test 3.2: Navigate Away and Back (In-Memory Cache)
- **Action**: Navigate to `/quran/1`, then to `/quran`, then back to `/quran/1`
- **Expected**: 
  - ✅ NO HTTP request (uses in-memory cache)
  - ✅ Data loads instantly
- **Verify**: Check Network tab - should see NO request to `1.json`

#### Test 3.3: Navigate to Different Chapter, Then Back
- **Action**: Navigate to `/quran/1`, then to `/quran/2`, then back to `/quran/1`
- **Expected**: 
  - ✅ First visit to `/quran/1`: HTTP request
  - ✅ Visit to `/quran/2`: HTTP request
  - ✅ Second visit to `/quran/1`: NO HTTP request (uses in-memory cache)
- **Verify**: Check Network tab - should see only 2 requests total

#### Test 3.4: Page Refresh (localStorage Cache)
- **Action**: Navigate to `/quran/1`, then refresh the page (F5)
- **Expected**: 
  - ✅ NO HTTP request (uses localStorage cache)
  - ✅ Data loads instantly
  - ✅ In-memory cache repopulated from localStorage
- **Verify**: Check Network tab - should see NO request to `1.json`

#### Test 3.5: App Restart (localStorage Cache)
- **Action**: Navigate to `/quran/1`, close app, reopen, navigate to `/quran/1`
- **Expected**: 
  - ✅ NO HTTP request (uses localStorage cache)
  - ✅ Data loads instantly
- **Verify**: Check Network tab - should see NO request to `1.json`

#### Test 3.6: Multiple Chapters Caching
- **Action**: Navigate to `/quran/1`, `/quran/2`, `/quran/3`, then back to `/quran/1`
- **Expected**: 
  - ✅ First visit to each: HTTP request
  - ✅ Revisit to `/quran/1`: NO HTTP request (uses in-memory cache)
- **Verify**: Check Network tab - should see 3 requests total (one per chapter)

---

### 4. Cache Versioning

#### Test 4.1: Version Mismatch
- **Action**: 
  1. Navigate to `/quran/1` (creates cache with version `1.0.0`)
  2. Manually change `CACHE_VERSION` in code to `1.0.1`
  3. Navigate to `/quran/1` again
- **Expected**: 
  - ✅ Old cache invalidated (removed from localStorage)
  - ✅ HTTP request made (new cache created)
- **Verify**: Check localStorage - old cache should be removed, new cache created

---

### 5. Cache Cleanup (LRU)

#### Test 5.1: Max Chapters Limit
- **Action**: 
  1. Navigate to 25 different chapters (exceeding `MAX_CACHED_CHAPTERS = 20`)
  2. Check localStorage
- **Expected**: 
  - ✅ Only 20 most recent chapters in localStorage
  - ✅ Oldest 5 chapters removed
- **Verify**: Check localStorage keys - should have max 20 `quran-api-chapter-*` keys

---

### 6. Error Handling

#### Test 6.1: localStorage Unavailable
- **Action**: Disable localStorage, navigate to `/quran/1`
- **Expected**: 
  - ✅ Falls back to HTTP request
  - ✅ In-memory cache still works
  - ✅ No errors in console
- **Verify**: Check Network tab - should see HTTP request, no errors

#### Test 6.2: Corrupted Cache Data
- **Action**: 
  1. Navigate to `/quran/1` (creates cache)
  2. Manually corrupt localStorage data for `quran-api-chapter-1`
  3. Navigate to `/quran/1` again
- **Expected**: 
  - ✅ Corrupted cache ignored
  - ✅ HTTP request made
  - ✅ New cache created
- **Verify**: Check Network tab - should see HTTP request, new cache in localStorage

---

## Common Issues to Check

### Issue 1: Service Re-instantiation
- **Symptom**: In-memory cache not persisting between navigations
- **Check**: Verify service is `providedIn: 'root'` (✅ Already correct)

### Issue 2: localStorage Not Being Read
- **Symptom**: HTTP requests on page refresh
- **Check**: Verify `getCachedChapter()` is being called and returning data

### Issue 3: Version Mismatch
- **Symptom**: Cache always invalidated
- **Check**: Verify `CACHE_VERSION` matches in stored data

### Issue 4: Component Not Using Service Method
- **Symptom**: Direct HTTP calls bypassing cache
- **Check**: Verify component uses `quranApi.getChapter()` not `http.get()` (✅ Already correct)

---

## Testing Checklist

- [ ] Test 1.1: First load of chapters (HTTP request)
- [ ] Test 1.2: Second load of chapters (in-memory cache)
- [ ] Test 1.3: Page refresh of chapters (localStorage cache)
- [ ] Test 1.4: App restart chapters (localStorage cache)
- [ ] Test 2.1: First load of reciters (HTTP request)
- [ ] Test 2.2: Second load of reciters (in-memory cache)
- [ ] Test 2.3: Page refresh of reciters (localStorage cache)
- [ ] Test 3.1: First load of chapter detail (HTTP request)
- [ ] Test 3.2: Navigate away and back (in-memory cache)
- [ ] Test 3.3: Navigate to different chapter, then back
- [ ] Test 3.4: Page refresh of chapter detail (localStorage cache)
- [ ] Test 3.5: App restart chapter detail (localStorage cache)
- [ ] Test 3.6: Multiple chapters caching
- [ ] Test 4.1: Version mismatch handling
- [ ] Test 5.1: Max chapters limit (LRU cleanup)
- [ ] Test 6.1: localStorage unavailable
- [ ] Test 6.2: Corrupted cache data

---

## How to Test

1. Open browser DevTools → Network tab
2. Filter by "Fetch/XHR" to see only API requests
3. Clear localStorage: `localStorage.clear()` in console
4. Navigate through the app following test scenarios
5. Verify HTTP requests in Network tab
6. Check localStorage: `localStorage.getItem('quran-api-chapters')` etc.

---

## Expected Behavior Summary

- **First visit**: HTTP request + cache save
- **Same session navigation**: NO HTTP request (in-memory cache)
- **Page refresh**: NO HTTP request (localStorage cache)
- **App restart**: NO HTTP request (localStorage cache)
- **Different chapter**: HTTP request (new data)
- **Revisit cached chapter**: NO HTTP request (cache hit)

