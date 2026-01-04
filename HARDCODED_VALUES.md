# Hardcoded Values in QuranFlow App

This document lists all hardcoded values found throughout the application. These values could potentially be moved to configuration files or environment variables for better maintainability.

## API Endpoints & URLs

### Prayer Times API
- **Base URL**: `https://api.aladhan.com/v1`
  - Location: `src/app/services/prayer-time.service.ts:19`
  - Used for: Fetching prayer times and Hijri dates

### Quran API
- **Base URL**: `https://quranapi.pages.dev/api/`
  - Location: `src/app/services/quran-api.service.ts:26`
  - Used for: Fetching Quran chapters, verses, translations, and audio

### Geocoding API
- **Base URL**: `https://nominatim.openstreetmap.org/reverse`
  - Location: `src/app/pages/qibla/services/qibla.service.ts:272`
  - Used for: Reverse geocoding to get city/country names
  - **User-Agent**: `'QuranApp/1.0'` (hardcoded in request header)

### Google Fonts
- **Fonts URL**: `https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap`
  - Location: `src/index.html:25`
  - Used for: Loading Poppins font family

## Geographic Coordinates

### Mecca (Kaaba) Coordinates
- **Latitude**: `21.4225`
- **Longitude**: `39.8262`
- Location: `src/app/pages/qibla/services/qibla.service.ts:8-11`
- Used for: Calculating Qibla direction
- **Note**: These are the exact coordinates of the Kaaba in Mecca

## Prayer Time Calculation

### Prayer Calculation Method
- **Default Method**: `4` (Umm Al-Qura)
  - Location: `src/app/services/prayer-time.service.ts:20`
  - Used for: Prayer time calculation method sent to API

## Cache Configuration

### Prayer Times Cache
- **Cache Range**: `3` days (before and after current date)
  - Location: `src/app/store/prayer-time.store.ts:30`
- **Cache Expiry**: `7` days
  - Location: `src/app/store/prayer-time.store.ts:33`
- **Cache Version**: `'1.0.0'`
  - Location: `src/app/store/prayer-time.store.ts:32`
- **Storage Key**: `'prayer-time-cache'`
  - Location: `src/app/store/prayer-time.store.ts:31`
- **Save Debounce**: `500` ms
  - Location: `src/app/store/prayer-time.store.ts:36`
- **Keep Days** (when clearing old cache): `3` days
  - Location: `src/app/store/prayer-time.store.ts:340`

### Quran API Cache
- **Max Cached Chapters**: `20` chapters
  - Location: `src/app/services/quran-api.service.ts:31`
- **Cache Version**: `'1.0.0'`
  - Location: `src/app/services/quran-api.service.ts:30`
- **Storage Keys**:
  - `'quran-api-reciters'` - Location: `src/app/services/quran-api.service.ts:27`
  - `'quran-api-chapters'` - Location: `src/app/services/quran-api.service.ts:28`
  - `'quran-api-chapter-'` (prefix) - Location: `src/app/services/quran-api.service.ts:29`

### Service Worker Cache (ngsw-config.json)
- **Prayer Times API**:
  - Max Age: `1d` (1 day)
  - Max Entries: `20`
  - Timeout: `10s`
- **Quran API**:
  - Max Age: `30d` (30 days)
  - Max Entries: `50`
  - Timeout: `10s`
- **Geocoding API**:
  - Max Age: `7d` (7 days)
  - Max Entries: `100`
  - Timeout: `5s`

### Location Info Cache
- **Cache Precision**: `2` decimal places
  - Location: `src/app/pages/qibla/services/qibla.service.ts:260`
  - Used for: Rounding coordinates for cache keys

## Timeouts & Intervals

### Home Component
- **Time Update Interval**: `1000` ms (1 second)
  - Location: `src/app/pages/home/home.component.ts:24`
  - Used for: Updating prayer trajectory timer
- **Location Info Retry Delay**: `1000` ms
  - Location: `src/app/pages/home/home.component.ts:358`

### Qibla Component
- **Location Timeout**: `300` ms
  - Location: `src/app/pages/qibla/qibla.component.ts:111`
- **Compass Health Check Interval**: `3000` ms (3 seconds)
  - Location: `src/app/pages/qibla/qibla.component.ts:322`
- **Compass Data Timeout**: `5000` ms (5 seconds)
  - Location: `src/app/pages/qibla/qibla.component.ts:292`
- **Initial Compass Check Delay**: `3000` ms
  - Location: `src/app/pages/qibla/qibla.component.ts:299`

### Settings Component
- **Permission Verification Interval**: `5000` ms (5 seconds)
  - Location: `src/app/pages/settings/settings.component.ts:50`
- **Permission Update Delay**: `100` ms
  - Location: `src/app/pages/settings/settings.component.ts:81`
- **Page Reload Delay**: `500` ms
  - Location: `src/app/pages/settings/settings.component.ts:163`

### Surah Detail Component
- **Scroll Timeout**: `200` ms
  - Location: `src/app/pages/quran/components/surah-detail.component.ts:113`
- **Player State Timeout**: `300` ms
  - Location: `src/app/pages/quran/components/surah-detail.component.ts:129`
- **Auto-scroll Timeouts**: `100`, `200`, `300`, `500` ms
  - Locations: Various in `surah-detail.component.ts`
- **Scroll Debounce**: `150` ms
  - Location: `src/app/pages/quran/components/surah-detail.component.ts:749`

### Geolocation
- **Geolocation Timeout**: `10000` ms (10 seconds)
  - Location: `src/app/services/prayer-time.service.ts:34`
- **Geolocation Maximum Age**: `0` (always get fresh location)
  - Location: `src/app/services/prayer-time.service.ts:35`
- **Permission Check Timeout**: `100` ms
  - Location: `src/app/services/permissions.service.ts:96`

### Network Status
- **Banner Hide Delay**: `3000` ms (3 seconds)
  - Location: `src/app/services/network-status.service.ts:37`

## Compass Configuration

### Compass Tolerance
- **Default Tolerance**: `15` degrees
  - Location: `src/app/pages/qibla/services/qibla.service.ts:248`
  - Used for: Determining if user is facing Mecca (within 15°)

### Compass Permission Storage
- **Storage Key**: `'qibla_compass_permission_granted'`
  - Location: `src/app/pages/qibla/services/qibla.service.ts:44`

## App Information

### App Metadata
- **App Name**: `'QuranFlow'`
  - Location: `src/app/app.ts:14`
  - Location: `src/app/pages/settings/settings.component.ts:24`
- **App Version**: `'Beta-v1'`
  - Location: `src/app/pages/settings/settings.component.ts:25`

## Storage Keys

### LocalStorage Keys
- `'prayer-time-cache'` - Prayer times cache
- `'quran-api-reciters'` - Reciters list cache
- `'quran-api-chapters'` - Chapters list cache
- `'quran-api-chapter-{id}'` - Individual chapter cache
- `'qibla_compass_permission_granted'` - Compass permission status
- `'app_time_format'` - Time format preference (12/24 hour)
- `'quran-translation-language'` - Selected translation language

## Error Codes & Status

### HTTP Status Codes (in error handling)
- `200` - Success (expected from API)
- `403` - Forbidden
- `404` - Not Found
- `429` - Too Many Requests
- `500`, `502`, `503` - Server Errors

### Geolocation Error Codes
- `0` - Not supported
- `1` - Permission denied
- `2` - Position unavailable
- `3` - Timeout

## UI Constants

### Translation Language Storage
- **Storage Key**: `'quran-translation-language'`
  - Location: `src/app/pages/quran/components/surah-detail.component.ts:63`

### Default Values
- **Default Time Format**: `TimeFormat.TWENTY_FOUR_HOUR`
  - Location: `src/app/pages/settings/settings.component.ts:155`
- **Unknown Location**: `'Unknown Location'`
  - Location: `src/app/pages/qibla/services/qibla.service.ts:282,307`
- **Unknown Country**: `'Unknown Country'`
  - Location: `src/app/pages/qibla/services/qibla.service.ts:283,308`
- **Current Location** (default): `'Current Location'`
  - Location: `src/app/pages/home/home.component.ts:45`

## Recommendations

### Should be moved to environment configuration:
1. **API URLs** - Should use environment variables for different environments (dev/staging/prod)
2. **Cache durations** - Could be configurable per environment
3. **Timeouts** - Could be adjusted based on network conditions
4. **App metadata** - Version, name could come from package.json or build config

### Can remain hardcoded (domain constants):
1. **Mecca coordinates** - These are fixed geographic coordinates
2. **Prayer calculation method** - Default method preference
3. **Compass tolerance** - UI/UX constant
4. **Storage keys** - Internal implementation detail

### Consider making configurable:
1. **Cache sizes** - Allow users to adjust cache limits
2. **Update intervals** - Could be adjusted for battery optimization
3. **Timeout values** - Could be adaptive based on network speed

