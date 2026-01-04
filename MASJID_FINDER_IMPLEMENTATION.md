# Masjid Finder - Implementation Guide

## Overview

The Masjid Finder feature allows users to discover nearby mosques/masjids directly from the Prayer page. It uses the OpenStreetMap Overpass API to find mosques within a configurable radius from the user's location.

## Features

- ✅ **Find Masjid Button**: Prominent button on Prayer page with mosque icon
- ✅ **Nearby Mosque List**: Displays all mosques within selected radius
- ✅ **Radius Selector**: Adjustable search radius (1km to 50km)
- ✅ **Distance Display**: Shows distance to each mosque
- ✅ **Directions Integration**: Opens Google Maps for navigation
- ✅ **Toggle View**: Seamlessly switches between prayers and masjid list
- ✅ **Location Info**: Shows mosque name, address, phone (if available)

## Architecture

### Components

```
┌─────────────────────────────────────────┐
│         PrayerComponent                 │
│  - Toggle between prayers/masjid       │
│  - Manages view state                   │
└─────────────────────────────────────────┘
              │
              ├─────────────────┐
              │                 │
              ▼                 ▼
    ┌──────────────┐   ┌──────────────┐
    │ PrayerList    │   │ MasjidList   │
    │ Component     │   │ Component    │
    └──────────────┘   └──────────────┘
                              │
                              ▼
                    ┌──────────────┐
                    │ MasjidService│
                    │ - Overpass   │
                    │   API calls  │
                    └──────────────┘
```

### File Structure

**Service:**
- `src/app/services/masjid.service.ts` - Overpass API integration

**Components:**
- `src/app/pages/prayer/components/masjid-list/masjid-list.component.ts`
- `src/app/pages/prayer/components/masjid-list/masjid-list.component.html`
- `src/app/pages/prayer/components/masjid-list/masjid-list.component.css`

**Updated:**
- `src/app/pages/prayer/prayer.component.ts` - Added toggle logic
- `src/app/pages/prayer/prayer.component.html` - Added button and masjid list
- `src/app/pages/prayer/prayer.component.css` - Added button styles

## Overpass API Integration

### API Endpoint

**URL**: `https://overpass-api.de/api/interpreter`

**Method**: POST

**Query Format**: Overpass QL (Query Language)

### Query Structure

```overpass
[out:json][timeout:25];
(
  node["amenity"="place_of_worship"]["religion"="muslim"](around:RADIUS,LAT,LON);
  way["amenity"="place_of_worship"]["religion"="muslim"](around:RADIUS,LAT,LON);
  relation["amenity"="place_of_worship"]["religion"="muslim"](around:RADIUS,LAT,LON);
);
out center meta;
```

**Parameters:**
- `RADIUS`: Search radius in meters
- `LAT`: User's latitude
- `LON`: User's longitude

**Tags Searched:**
- `amenity=place_of_worship` - Place of worship
- `religion=muslim` - Muslim religion

**Element Types:**
- `node` - Point locations
- `way` - Areas/buildings (uses center coordinates)
- `relation` - Complex structures (uses center coordinates)

### Response Processing

The service processes Overpass API responses and extracts:

- **Name**: `name` or `name:en` tag
- **Coordinates**: `lat`/`lon` for nodes, `center` for ways/relations
- **Address**: `addr:street`, `addr:city`, `addr:postcode`
- **Contact**: `phone`, `website`
- **Hours**: `opening_hours`

### Distance Calculation

Uses **Haversine Formula** to calculate distance:

```typescript
calculateDistance(lat1, lon1, lat2, lon2): number {
  const R = 6371; // Earth's radius in km
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in kilometers
}
```

## User Interface

### Find Masjid Button

**Location**: Between date header and prayer list

**Design:**
- Full-width button
- Mosque icon + "Find Masjid" text
- Orange border (#ffb030)
- Hover effect with shadow

**Behavior:**
- Clicking replaces prayer list with masjid list
- Button disappears when masjid list is shown

### Masjid List View

**Header:**
- Title: "Nearby Mosques"
- Close button (X icon)
- Radius selector buttons

**Radius Options:**
- 1km, 2km, 5km, 10km, 15km, 20km, 25km, 50km
- Active radius highlighted
- Clicking updates search immediately

**Masjid Items:**
- Mosque icon
- Name (bold)
- Address (if available)
- Distance badge
- Phone number (if available)
- Directions button (opens Google Maps)

**States:**
- Loading: Spinner with "Finding nearby mosques..."
- Error: Error message with retry button
- Empty: "No mosques found" message
- Success: List of mosques sorted by distance

## Implementation Details

### MasjidService

**Key Methods:**

```typescript
getNearbyMasjids(latitude, longitude, radiusKm): Observable<Masjid[]>
// Fetches mosques from Overpass API

calculateDistance(lat1, lon1, lat2, lon2): number
// Calculates distance using Haversine formula

formatDistance(distanceKm): string
// Formats distance (e.g., "1.5km" or "500m")

getDefaultRadius(): number
// Returns default radius (5km)

getRadiusLimits(): { min: number, max: number }
// Returns min (1km) and max (50km) limits
```

### MasjidListComponent

**Inputs:**
- `latitude`: User's latitude
- `longitude`: User's longitude
- `radius`: Search radius in kilometers

**Outputs:**
- `radiusChange`: Emits when radius changes
- `close`: Emits when user closes masjid list

**Features:**
- Auto-loads masjids on init
- Reloads when radius changes
- Sorts by distance (nearest first)
- Opens Google Maps for directions

### PrayerComponent Integration

**New Signals:**
```typescript
showMasjidList = signal<boolean>(false)
masjidSearchRadius = signal<number>(5)
currentLocation = computed(() => {...})
```

**New Methods:**
```typescript
toggleMasjidList(): void
closeMasjidList(): void
onMasjidRadiusChange(radius: number): void
```

## Data Flow

### Finding Masjids

```
1. User clicks "Find Masjid" button
   ↓
2. PrayerComponent.showMasjidList = true
   ↓
3. MasjidListComponent receives location & radius
   ↓
4. Calls MasjidService.getNearbyMasjids()
   ↓
5. Service constructs Overpass QL query
   ↓
6. Fetches from Overpass API
   ↓
7. Processes response elements
   ↓
8. Calculates distances
   ↓
9. Sorts by distance
   ↓
10. Returns Masjid[] array
   ↓
11. Component displays list
```

### Changing Radius

```
1. User clicks radius button (e.g., "10km")
   ↓
2. MasjidListComponent.onRadiusChange(10)
   ↓
3. Emits radiusChange event
   ↓
4. PrayerComponent updates masjidSearchRadius signal
   ↓
5. MasjidListComponent receives new radius
   ↓
6. ngOnChanges triggers
   ↓
7. Reloads masjids with new radius
```

## Overpass API Details

### Rate Limits

- **Free Tier**: No strict limits, but be respectful
- **Best Practice**: Cache results when possible
- **Timeout**: 25 seconds per query

### Query Optimization

- Uses `around` filter for efficient radius search
- Searches all element types (node, way, relation)
- Uses `out center meta` to get coordinates for ways/relations

### Response Format

```json
{
  "elements": [
    {
      "type": "node",
      "id": 123456,
      "lat": 40.7128,
      "lon": -74.0060,
      "tags": {
        "amenity": "place_of_worship",
        "religion": "muslim",
        "name": "Masjid Name",
        "addr:street": "Street Name",
        "phone": "+1234567890"
      }
    }
  ]
}
```

## Error Handling

### API Errors

- **Network Error**: Shows "Failed to load mosques" with retry button
- **Timeout**: Overpass API timeout (25s) - shows error message
- **Invalid Response**: Returns empty array, shows "No mosques found"

### Location Errors

- **No Location**: Shows "Location not available"
- **Invalid Coordinates**: Validates before API call

### User Experience

- **Loading State**: Spinner with message
- **Error State**: Error icon, message, and retry button
- **Empty State**: Location icon, message, and hint

## Styling

### Find Masjid Button

```css
.find-masjid-button {
  width: 100%;
  padding: var(--space-md) var(--space-lg);
  border: 2px solid #ffb030;
  background: #ffffff;
  border-radius: var(--border-radius-all);
  color: #ffb030;
  font-weight: 600;
}
```

### Masjid List

- Card-based design
- Mosque icon for each item
- Distance badge
- Directions button (circular, orange)
- Responsive layout

## Performance

- **API Call**: ~1-3 seconds (depends on area density)
- **Distance Calculation**: < 1ms per mosque
- **Sorting**: O(n log n) - negligible for typical results
- **Rendering**: Efficient with Angular signals

## Future Enhancements

Potential improvements:
- [ ] Cache masjid results (localStorage)
- [ ] Map view integration
- [ ] Filter by mosque name
- [ ] Save favorite mosques
- [ ] Prayer times for specific mosque
- [ ] Mosque details page

## Summary

✅ **Complete Implementation:**
- MasjidService with Overpass API
- MasjidListComponent with full UI
- Find Masjid button on Prayer page
- Radius selector (1-50km)
- Toggle between prayers and masjid list
- Directions integration
- Error handling and loading states

**Status**: ✅ Production Ready

---

**Last Updated**: 2026-01-04  
**API**: OpenStreetMap Overpass API (Free)  
**Build Status**: ✅ PASSED

