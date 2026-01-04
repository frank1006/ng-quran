# QuranFlow App Summary

## Overview
**QuranFlow** is a Progressive Web Application (PWA) designed to help Muslims with their daily religious practices. The app provides prayer times, Quran reading with audio recitation, and a Qibla compass feature, all optimized for offline use.

## Core Functionality

### 1. Prayer Times (Home Page)
- **Real-time Prayer Times**: Displays all 6 daily prayers (Fajr, Shuruq, Dhuhr, Asr, Maghrib, Isha)
- **Location-based**: Automatically fetches prayer times based on user's GPS location
- **Date Navigation**: Navigate between dates to view past/future prayer times
- **Active Prayer Indicator**: Highlights the current/next prayer
- **Countdown Timer**: Shows time remaining until the next prayer
- **Prayer Trajectory**: Visual timeline showing the progression of prayers throughout the day
- **Hijri Date Display**: Shows Islamic calendar date alongside Gregorian date
- **City Name Display**: Shows current location city name
- **Offline Support**: Caches prayer times for offline access

### 2. Quran Reading
- **Complete Quran**: Access to all 114 chapters (Surahs)
- **Verse-by-Verse Reading**: View individual verses with Arabic text
- **Multiple Translations**: 
  - English translations
  - Bengali translations
  - Urdu translations
- **Audio Recitation**: 
  - Multiple reciters (1-5 available)
  - Verse-by-verse audio playback
  - Audio player controls (play, pause, next, previous)
  - Auto-play functionality
- **Offline Caching**: Chapters and translations cached for offline reading
- **Smart Caching**: LRU (Least Recently Used) cache management to prevent storage bloat

### 3. Qibla Compass
- **Direction to Mecca**: Calculates the bearing from user's location to Kaaba in Mecca
- **Device Compass Integration**: Uses device orientation API for real-time compass
- **Visual Compass**: Interactive compass interface showing direction
- **Turn Instructions**: Provides guidance (Turn Left/Right or "Facing Makkah")
- **Location Info**: Displays current city and country
- **Permission Management**: Handles compass permission requests and status
- **Health Monitoring**: Detects when compass stops working and provides feedback

### 4. Settings
- **Time Format**: Toggle between 12-hour and 24-hour time formats
- **Compass Permission Management**: View and manage compass permissions
- **Data Reset**: Clear all cached data and reset preferences
- **App Information**: View app name, version, and build number
- **Mission & Privacy**: Expandable sections for app mission and privacy information

## Key Features

### Progressive Web App (PWA)
- **Service Worker**: Full offline support with service worker
- **App Manifest**: Installable as a native app
- **Offline Banner**: Visual indicator when offline
- **Network Status Detection**: Monitors online/offline status
- **Cached API Responses**: Prayer times, Quran data, and geocoding cached for offline use

### Offline-First Architecture
- **Smart Caching Strategy**:
  - Prayer times: 1-day cache with freshness strategy
  - Quran data: 30-day cache with performance strategy
  - Geocoding: 7-day cache
- **LocalStorage Management**: Efficient cache with version control
- **Graceful Degradation**: App works with cached data when offline
- **Cache Size Management**: Automatic cleanup of old cached chapters

### User Experience
- **Bottom Navigation**: Easy navigation between main sections
- **Loading States**: Visual feedback during data loading
- **Error Handling**: User-friendly error messages
- **Connection Error Component**: Dedicated UI for network issues
- **Responsive Design**: Works on mobile and desktop devices

### Performance Optimizations
- **Lazy Loading**: Components loaded on demand
- **Memory Caching**: In-memory cache for frequently accessed data
- **Efficient API Calls**: Shared observables prevent duplicate requests
- **Optimized Build**: Production builds with minification and optimization

## Technology Stack

### Frontend Framework
- **Angular 21.0.0**: Modern Angular with standalone components
- **TypeScript 5.9.2**: Type-safe development
- **RxJS 7.8.0**: Reactive programming for async operations

### Build Tools
- **Angular CLI 21.0.4**: Build and development tools
- **Angular Build**: Modern build system
- **Vitest 4.0.8**: Unit testing framework

### PWA & Service Workers
- **@angular/service-worker**: Angular service worker for PWA features
- **@angular/pwa**: PWA schematics and configuration
- **ngsw-config.json**: Service worker configuration

### State Management
- **Angular Signals**: Reactive state management using signals
- **Computed Signals**: Derived state calculations
- **Effects**: Side effect management

### APIs & Services
- **Aladhan API** (`api.aladhan.com`): Prayer times and Hijri dates
- **Quran API** (`quranapi.pages.dev`): Quran text, translations, and audio
- **OpenStreetMap Nominatim**: Reverse geocoding for location names

### Styling
- **CSS**: Custom styling with modern design
- **Responsive Design**: Mobile-first approach

### Analytics
- **Vercel Analytics**: Web analytics integration

### Development Tools
- **Prettier**: Code formatting
- **ESLint**: Code linting (via Angular CLI)
- **jsdom**: DOM simulation for testing

## Architecture Patterns

### Component Structure
- **Standalone Components**: All components are standalone (no NgModules)
- **Feature-based Organization**: Components organized by feature (home, quran, qibla, settings)
- **Shared Components**: Reusable UI components (bottom-nav, loading-spinner, etc.)

### Service Layer
- **Injectable Services**: Root-level services for dependency injection
- **Store Pattern**: Centralized state management (PrayerTimeStore)
- **API Services**: Separate services for different APIs (PrayerTimeService, QuranApiService, QiblaService)

### Error Handling
- **Global Error Handler**: Centralized error handling
- **HTTP Interceptors**: Error interception and handling
- **User-friendly Messages**: Translated error messages for users

### Caching Strategy
- **Multi-layer Caching**:
  1. In-memory cache (RxJS shareReplay)
  2. LocalStorage cache (persistent)
  3. Service Worker cache (network layer)
- **Cache Versioning**: Version control for cache invalidation
- **LRU Cache**: Automatic cleanup of old cached data

## Project Structure
```
src/
├── app/
│   ├── core/              # Core utilities (logger, error handler)
│   ├── interceptors/      # HTTP interceptors
│   ├── pages/             # Feature pages
│   │   ├── home/          # Prayer times page
│   │   ├── quran/         # Quran reading page
│   │   ├── qibla/         # Qibla compass page
│   │   └── settings/      # Settings page
│   ├── services/          # Business logic services
│   ├── shared/            # Shared components
│   └── store/             # State management
├── index.html
├── main.ts
└── styles.css
```

## Browser Compatibility
- Modern browsers with support for:
  - Service Workers
  - Geolocation API
  - Device Orientation API (for compass)
  - LocalStorage
  - Fetch API

## Security & Privacy
- **No User Data Collection**: App uses location only for prayer times
- **Local Storage**: All preferences stored locally
- **HTTPS Required**: PWA features require secure context
- **Permission-based Access**: User grants permissions for location and compass

## Performance Metrics
- **Initial Bundle**: Optimized for < 1MB (production)
- **Component Styles**: < 8kB per component
- **Cache Limits**: 
  - Prayer times: 20 entries
  - Quran chapters: 20 entries
  - Geocoding: 100 entries

## Development
- **Development Server**: `ng serve` (runs on port 4200)
- **HTTPS Development**: `npm run start:https` (for testing PWA features)
- **Production Build**: `ng build` (optimized production build)
- **Testing**: `ng test` (Vitest test runner)

## Deployment
- **Static Site**: Can be deployed to any static hosting
- **PWA Ready**: Includes service worker and manifest
- **Prerendering**: Supports prerendered routes for SEO

