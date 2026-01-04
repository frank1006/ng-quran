# Cache Functionality Summary - What Persists After Refresh

## Overview
The app uses a **multi-layer caching strategy** with both **in-memory** and **persistent (localStorage)** caches. When the app refreshes, all persistent caches are automatically restored, ensuring offline functionality and fast load times.

---

## 1. Prayer Times Cache

### Storage Key
`'prayer-time-cache'`

### What's Cached
- **Prayer times** for multiple dates (3 days before/after current date)
- **Current GPS location** (latitude, longitude)
- **Last fetch timestamp**

### Cache Details
- **Expiry**: 7 days from last fetch
- **Version**: `1.0.0`
- **Auto-cleanup**: Removes entries older than 7 days
- **Storage**: localStorage

### On App Refresh
✅ **Automatically restored**:
- All cached prayer times
- Last known location
- App can work offline with cached data

### Cache Structure
```json
{
  "version": "1.0.0",
  "cache": {
    "2024-01-15": { timings: {...}, location: {...}, hijriDate: {...} },
    "2024-01-16": { timings: {...}, location: {...}, hijriDate: {...} }
  },
  "currentLocation": { "latitude": 25.2048, "longitude": 55.2708 },
  "lastFetchDate": "2024-01-15T10:30:00.000Z"
}
```

---

## 2. Location Info Cache (Quadrant/City/Country)

### Storage Key
`'location-info-cache'`

### What's Cached
- **Quadrant** (suburb/neighbourhood/city/state)
- **City name**
- **Country name**
- **GPS coordinates** (rounded to 2 decimal places)

### Cache Details
- **Expiry**: 7 days from cache timestamp
- **Version**: `1.0.0`
- **Max Entries**: 50 locations (LRU-like behavior)
- **Precision**: 2 decimal places (~1.1km radius)
- **Storage**: localStorage

### On App Refresh
✅ **Automatically restored**:
- All cached location info
- Last known location (fallback if API fails)
- No need to re-fetch location names

### Cache Structure
```json
{
  "version": "1.0.0",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "cache": {
    "25.20,55.27": {
      "quadrant": "Downtown",
      "city": "Dubai",
      "country": "United Arab Emirates"
    }
  }
}
```

---

## 3. Quran API Cache

### Storage Keys
- `'quran-api-chapters'` - List of all 114 chapters
- `'quran-api-reciters'` - List of reciters
- `'quran-api-chapter-{id}'` - Individual chapter with verses

### What's Cached
- **Chapters list** (all 114 surahs)
- **Reciters list** (all available reciters)
- **Individual chapters** with:
  - Arabic text
  - Translations (English, Bengali, Urdu)
  - Verse data

### Cache Details
- **Expiry**: No expiry (static data)
- **Version**: `1.0.0`
- **Max Chapters**: 20 chapters cached (LRU cleanup)
- **Storage**: localStorage + in-memory

### On App Refresh
✅ **Automatically restored**:
- Chapters list (instant load)
- Reciters list (instant load)
- Previously viewed chapters (up to 20)
- Translations for cached chapters

### Cache Structure
```json
// Chapters
{
  "version": "1.0.0",
  "chapters": [...],
  "timestamp": "2024-01-15T10:30:00.000Z"
}

// Individual Chapter
{
  "version": "1.0.0",
  "chapter": { id: 1, name: "...", verses: [...] },
  "translations": { english: [...], bengali: [...], urdu: [...] },
  "timestamp": "2024-01-15T10:30:00.000Z",
  "chapterId": 1
}
```

---

## 4. User Preferences Cache

### Storage Keys
- `'app_time_format'` - Time format preference (12/24 hour)
- `'quran-translation-language'` - Selected translation language
- `'qibla_compass_permission_granted'` - Compass permission status

### What's Cached
- **Time format** (12-hour or 24-hour)
- **Translation language** (English/Bengali/Urdu)
- **Compass permission** status

### Cache Details
- **Expiry**: Never (user preference)
- **Storage**: localStorage

### On App Refresh
✅ **Automatically restored**:
- Time format preference
- Translation language selection
- Compass permission status

---

## 5. Service Worker Cache (PWA)

### Configuration
`ngsw-config.json`

### What's Cached
- **App assets** (JS, CSS, HTML)
- **Static files** (icons, images, fonts)
- **API responses**:
  - Prayer times API (1 day cache)
  - Quran API (30 days cache)
  - Geocoding API (7 days cache)

### Cache Details
- **Strategy**: 
  - Assets: Prefetch
  - Prayer times: Freshness (1 day)
  - Quran: Performance (30 days)
  - Geocoding: Performance (7 days)
- **Storage**: Browser Cache API (Service Worker)

### On App Refresh
✅ **Automatically restored**:
- App loads instantly (cached assets)
- API responses served from cache
- Works fully offline

---

## Cache Loading Flow on App Refresh

### 1. App Initialization
```
App Starts
  ↓
PrayerTimeStore.loadFromLocalStorage()
  ↓
Restores: Prayer times, Location, Cache state
  ↓
QuranApiService (lazy load)
  ↓
Restores: Chapters, Reciters, Individual chapters
  ↓
QiblaService (on demand)
  ↓
Restores: Location info cache
  ↓
SettingsService
  ↓
Restores: Time format, Preferences
```

### 2. Cache Priority (When Data Needed)
```
1. Check in-memory cache (fastest)
   ↓ (if not found)
2. Check localStorage cache
   ↓ (if not found)
3. Check Service Worker cache
   ↓ (if not found)
4. Fetch from API
   ↓
5. Save to all caches
```

---

## Cache Expiry & Cleanup

### Automatic Cleanup
- **Prayer Times**: Removes entries older than 7 days
- **Location Info**: Removes entries older than 7 days
- **Quran Chapters**: Removes oldest entries when > 20 chapters
- **Location Info**: Removes oldest entries when > 50 locations

### Version Invalidation
- All caches check version on load
- If version mismatch → cache cleared automatically
- Ensures compatibility after app updates

### Manual Cleanup
- **Settings → Reset Data & Permissions**
  - Clears all caches
  - Resets preferences
  - Removes all localStorage data

---

## What Happens on Refresh - Summary

### ✅ Persists (Survives Refresh)
1. **Prayer times** (7 days worth)
2. **Location info** (quadrant, city, country)
3. **Quran chapters** (up to 20 most recent)
4. **User preferences** (time format, language)
5. **Compass permission** status
6. **GPS location** (last known)
7. **Service Worker cache** (assets, API responses)

### ❌ Lost on Refresh
1. **In-memory caches** (Map objects)
   - Rebuilt automatically from localStorage
2. **Active subscriptions** (RxJS observables)
   - Recreated on demand

### 🔄 Rebuilt Automatically
1. In-memory caches loaded from localStorage
2. Service Worker cache restored from browser
3. App state restored from stored data

---

## Cache Storage Summary

| Cache Type | Storage Key | Expiry | Max Size | Persists After Refresh |
|------------|-------------|--------|----------|------------------------|
| Prayer Times | `prayer-time-cache` | 7 days | Unlimited | ✅ Yes |
| Location Info | `location-info-cache` | 7 days | 50 entries | ✅ Yes |
| Quran Chapters | `quran-api-chapters` | Never | 1 entry | ✅ Yes |
| Quran Reciters | `quran-api-reciters` | Never | 1 entry | ✅ Yes |
| Individual Chapters | `quran-api-chapter-{id}` | Never | 20 entries | ✅ Yes |
| Time Format | `app_time_format` | Never | 1 entry | ✅ Yes |
| Translation Language | `quran-translation-language` | Never | 1 entry | ✅ Yes |
| Compass Permission | `qibla_compass_permission_granted` | Never | 1 entry | ✅ Yes |
| Service Worker | Browser Cache API | Varies | Varies | ✅ Yes |

---

## Benefits of This Caching Strategy

### 🚀 Performance
- **Instant load** of previously viewed content
- **No API calls** needed for cached data
- **Reduced bandwidth** usage

### 📱 Offline Support
- **Full functionality** without internet
- **Prayer times** available offline
- **Quran reading** available offline
- **Location info** available offline

### 💾 Storage Efficiency
- **Automatic cleanup** prevents bloat
- **LRU behavior** keeps most relevant data
- **Version control** ensures compatibility

### 🔄 User Experience
- **Seamless refresh** - no data loss
- **Fast navigation** - cached data loads instantly
- **Offline-first** - works without connection

---

## Cache Invalidation Triggers

1. **Time-based**: 7 days expiry for prayer times & location
2. **Version mismatch**: App update with new cache version
3. **Manual reset**: User clicks "Reset Data & Permissions"
4. **Size limit**: Automatic cleanup when limits exceeded
5. **Error recovery**: Cache cleared on corruption

---

## Testing Cache Persistence

### To Verify Cache Works After Refresh:
1. **Open app** → View prayer times
2. **Navigate to Quran** → Open a chapter
3. **Go to Settings** → Change time format
4. **Refresh browser** (F5 or Cmd+R)
5. **Verify**:
   - ✅ Prayer times still visible
   - ✅ Quran chapter still accessible
   - ✅ Time format preference maintained
   - ✅ Location info still displayed

### To Test Offline Mode:
1. **Open app** → Let it cache data
2. **Disable network** (airplane mode)
3. **Refresh app**
4. **Verify**:
   - ✅ App loads (Service Worker cache)
   - ✅ Prayer times visible (localStorage cache)
   - ✅ Quran chapters accessible (localStorage cache)
   - ✅ Location info displayed (localStorage cache)

---

## Conclusion

**All caches persist after refresh** through localStorage and Service Worker. The app maintains full functionality offline and provides instant load times for previously accessed data. The multi-layer caching strategy ensures both performance and reliability.

