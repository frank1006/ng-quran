# QuranFlow - Nx Monorepo

QuranFlow is an Islamic PWA application providing prayer times, Quran reading, and Qibla direction finder. This repository has been refactored into an Nx monorepo to support future scalability and maintainability.

## 🏗️ Monorepo Structure

```
quranflow/
├── apps/
│   ├── quranflow-web/      # Angular PWA application (main frontend)
│   └── quranflow-api/      # NestJS backend API (minimal, ready for expansion)
│
├── libs/
│   ├── quran-domain/       # Shared Quran types and interfaces
│   ├── prayer-domain/      # Shared Prayer Time types and interfaces
│   ├── shared-utils/       # Shared utilities, constants, and types
│   ├── shared-ui/          # Shared UI components (placeholder)
│   └── ai-contracts/       # Future: MCP prompts & RAG contracts (placeholder)
│
└── tools/
    └── scripts/            # Utility scripts for ingestion, AI, migrations
```

## 🚀 Quick Start

### Prerequisites

- Node.js (v18+)
- npm (v11.6.2+)

### Installation

```bash
npm install
```

### Development

**Start the Angular PWA:**
```bash
npm start
# or
nx serve quranflow-web
```

**Start with HTTPS (for PWA features):**
```bash
npm run start:https
```

**Start the NestJS API:**
```bash
npm run serve:api
# or
nx serve quranflow-api
```

The Angular app will be available at `http://localhost:4200`  
The NestJS API will be available at `http://localhost:3000`

### Building

**Build Angular app:**
```bash
npm run build
# or
nx build quranflow-web
```

**Build NestJS API:**
```bash
npm run build:api
# or
nx build quranflow-api
```

## 📦 Applications

### `quranflow-web` (Angular PWA)

The main frontend application - a Progressive Web App built with Angular 21.

**Features:**
- Prayer times with location-based calculations
- Quran reading with translations
- Qibla compass direction
- Offline support via service workers
- Push notifications for prayer times
- Responsive design for mobile and desktop

**Routes:**
- `/` → Redirects to `/prayer`
- `/prayer` → Prayer times page
- `/quran` → Quran surah list
- `/quran/:surahId` → Surah detail page
- `/qibla` → Qibla compass
- `/profile` → Settings/profile page

**PWA Configuration:**
- Service worker: `apps/quranflow-web/ngsw-config.json`
- Manifest: `apps/quranflow-web/public/manifest.webmanifest`
- Offline support for all routes and API calls

### `quranflow-api` (NestJS)

Minimal NestJS backend API, ready for future expansion.

**Current Endpoints:**
- `GET /` → Welcome message
- `GET /health` → Health check endpoint

**Future Expansion:**
- AI/RAG endpoints for Quran-related queries
- User authentication and preferences
- Data ingestion services
- MCP (Model Context Protocol) integration

## 📚 Libraries

### Domain Libraries

#### `@quran-domain`
Shared types and interfaces for Quran data.

**Exports:**
- `SurahListItem`, `SurahResponse`, `VerseResponse`
- `Chapter`, `ChapterWithVerses`, `Verse`
- `Reciter`, `AudioRecitation`
- `TranslationLanguage`, `TafsirResponse`

**Usage:**
```typescript
import { Chapter, Verse, Reciter } from '@quran-domain';
```

#### `@prayer-domain`
Shared types and interfaces for Prayer Time data.

**Exports:**
- `LocationCoordinates`, `PrayerTimings`, `PrayerTimeData`
- `HijriDate`, `AladhanApiResponse`
- `ServiceState`, `PrayerTimeState`

**Usage:**
```typescript
import { PrayerTimeData, LocationCoordinates } from '@prayer-domain';
```

### Utility Libraries

#### `@shared-utils`
Shared utilities, constants, and types used across applications.

**Exports:**
- `TimeFormat` enum (12h/24h)
- `NotificationPreferences`, `NotificationSettings`
- `ScheduledNotification`, `NotificationPermissionStatus`

**Usage:**
```typescript
import { TimeFormat, NotificationSettings } from '@shared-utils';
```

#### `@shared-ui` (Placeholder)
Future shared UI components library. Currently empty, ready for component extraction when needed.

#### `@ai-contracts` (Placeholder)
Future AI contracts library for MCP prompts and RAG contracts. Currently empty, ready for AI feature implementation.

## 🛠️ Development

### Nx Commands

**Run a specific target:**
```bash
nx <target> <project>
# Example: nx build quranflow-web
```

**Run multiple projects:**
```bash
nx run-many --target=build --projects=quranflow-web,quranflow-api
```

**View project graph:**
```bash
nx graph
```

**Run affected commands:**
```bash
nx affected:build
nx affected:test
```

### Code Organization

- **Apps**: Self-contained applications that can be built and deployed independently
- **Libs**: Reusable code that can be shared across apps
- **Domain-driven**: Types and interfaces organized by domain (quran, prayer)
- **Clear boundaries**: Frontend apps don't depend on backend apps

### Path Aliases

The monorepo uses TypeScript path aliases for clean imports:

```typescript
// Domain libraries
import { Chapter } from '@quran-domain';
import { PrayerTimeData } from '@prayer-domain';

// Utility libraries
import { TimeFormat } from '@shared-utils';

// App-specific (if needed)
import { SomeComponent } from '@quranflow-web/app/components';
```

## 🔄 Migration Notes

This repository was migrated from a single Angular application to an Nx monorepo while maintaining **ZERO breaking changes**:

✅ All routes remain unchanged  
✅ All API calls work identically  
✅ PWA functionality preserved  
✅ Service worker configuration maintained  
✅ Build output structure compatible  
✅ All existing features work as before  

### What Changed

- **Structure**: Code moved to `apps/quranflow-web/`
- **Imports**: Updated to use Nx path aliases (`@quran-domain`, `@prayer-domain`, `@shared-utils`)
- **Build**: Now uses Nx build system (compatible with Angular CLI)
- **Scripts**: Updated to use Nx commands (backward compatible)

### What Stayed the Same

- All routes and navigation
- All API endpoints and responses
- All UI/UX behavior
- All PWA features
- All service worker functionality
- All business logic

## 🧪 Testing

```bash
# Run tests for a specific project
nx test quranflow-web
nx test quranflow-api

# Run all tests
nx run-many --target=test --all
```

## 📝 Future Enhancements

### Planned Features

1. **AI/RAG Integration**
   - Quran question-answering
   - Context-aware verse suggestions
   - Tafsir explanations via AI

2. **Backend Expansion**
   - User authentication
   - Preferences sync
   - Data ingestion services

3. **Shared UI Components**
   - Extract reusable components to `@shared-ui`
   - Design system implementation

4. **Tools & Scripts**
   - Quran data ingestion scripts
   - AI training data preparation
   - Migration utilities

## 🔐 Security

- SSL certificates for HTTPS development are in `/ssl/` (gitignored)
- API keys and secrets should be stored in environment variables
- Service worker handles offline security properly

## 📄 License

Private project - All rights reserved

## 🤝 Contributing

This is a private project. For questions or suggestions, please contact the maintainers.

---

**Built with:**
- Angular 21
- NestJS 11
- Nx 22
- TypeScript 5.9
- RxJS 7.8
