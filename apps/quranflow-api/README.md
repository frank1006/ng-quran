# QuranFlow API

NestJS backend API for Quran data management and ingestion.

## Features

- **Data Ingestion**: Fetch and store Quran data from external API
- **Read-only APIs**: Expose Quran data to frontend
- **PostgreSQL Database**: Normalized schema for Surahs, Ayahs, and Translations
- **AI-Ready Schema**: Prepared for future RAG/embeddings integration

## Database Schema

### Entities

- **Surah**: Chapters of the Quran (114 total)
  - `id` (1-114)
  - `name_ar`, `name_en`
  - `revelation_type` (Mecca/Madina)
  - `ayah_count`

- **Ayah**: Verses of the Quran
  - `id` (UUID)
  - `surah_id` (FK)
  - `ayah_number`
  - `arabic_text` (Uthmani script)
  - `arabic_text_simple`
  - Mushaf metadata (page, juz, hizb, etc.)

- **Translation**: Translations in multiple languages
  - `id` (UUID)
  - `ayah_id` (FK)
  - `language_code` (en, ur, bn, etc.)
  - `text`
  - `source`, `attribution`

### Indexes

- Composite index on `(surah_id, ayah_number)` for efficient lookups
- Index on `language_code` for translation queries

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL 12+ (or use SQLite for local development)

### Installation

```bash
npm install
```

### Database Configuration

Create a `.env` file in `apps/quranflow-api/`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=quranflow
DB_SSL=false
NODE_ENV=development
PORT=3000
```

### Database Setup

1. Create PostgreSQL database:
```sql
CREATE DATABASE quranflow;
```

2. The schema will be auto-synced in development mode (TypeORM `synchronize: true`).
   For production, use migrations instead.

## Running the API

```bash
# Development
npm run serve:api

# Production build
npm run build:api
```

## API Endpoints

### Read-only Quran APIs

- `GET /quran/surahs` - Get all surahs
- `GET /quran/surah/:id` - Get surah by ID with all ayahs
- `GET /quran/surah/:id/ayahs` - Get all ayahs for a surah
- `GET /quran/ayah/:id` - Get ayah by UUID
- `GET /quran/ayah/:id/translations?lang=en` - Get translations for an ayah

### Admin Endpoints

- `POST /admin/ingest/quran` - Trigger data ingestion (dev-only)

**Note**: Ingestion endpoint is protected and only works in development mode.
For production, implement proper authentication.

## Data Ingestion

### Manual Ingestion

Trigger ingestion via API:

```bash
curl -X POST http://localhost:3000/admin/ingest/quran
```

### Ingestion Process

1. **Fetch**: Retrieves surah list from `https://quranapi.pages.dev/api/surah.json`
2. **Validate**: Ensures 114 surahs are present
3. **Transform**: Maps external API format to our schema
4. **Upsert**: Inserts or updates data (idempotent)
5. **Verify**: Validates data integrity after ingestion

### Ingestion Features

- **Idempotent**: Safe to run multiple times
- **Rate Limiting**: 100ms delay between API calls
- **Error Handling**: Continues processing even if individual surahs fail
- **Validation**: Verifies surah count and ayah sequence integrity
- **Logging**: Comprehensive progress and error logging

## Data Safety

⚠️ **Important**: Quran text is immutable. The ingestion service:
- Never modifies existing Arabic text
- Only updates metadata fields
- Preserves all existing translations
- Validates data integrity before committing

## Frontend Compatibility

The API responses are designed to match the existing frontend expectations:
- Same data shape as external API
- Compatible with `Chapter`, `Verse`, `Translation` interfaces
- Backward compatible response format

## Future AI/RAG Preparation

The schema includes placeholders for future AI integration:
- `ayah_uuid` / `surah_uuid`: For vector DB mapping
- `metadata` (JSONB): For embeddings and AI metadata
- **Note**: AI logic is NOT implemented yet - these are placeholders only

## Project Structure

```
apps/quranflow-api/src/
├── database/
│   └── database.module.ts       # TypeORM configuration
├── quran/
│   ├── entities/                 # Database entities
│   ├── quran.module.ts
│   ├── quran.service.ts          # Business logic
│   ├── quran.controller.ts       # API endpoints
│   └── quran.repository.ts       # Data access
└── ingestion/
    ├── ingestion.module.ts
    ├── quran.ingestion.service.ts # Ingestion logic
    └── ingestion.controller.ts   # Admin endpoints
```

## Development

### TypeScript

The project uses TypeScript with strict type checking.

### Linting

No linting errors should be present. Run:

```bash
npm run build:api
```

## Production Considerations

1. **Database**: Use migrations instead of `synchronize: true`
2. **Authentication**: Implement proper auth for ingestion endpoints
3. **Rate Limiting**: Add API rate limiting middleware
4. **Caching**: Consider Redis for frequently accessed data
5. **Monitoring**: Add logging and monitoring (e.g., Sentry)
6. **Backups**: Regular database backups for Quran data

## License

This project is part of the QuranFlow application.

