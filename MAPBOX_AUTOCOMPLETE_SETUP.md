# Mapbox Autocomplete Setup

This document describes the Mapbox-based city/suburb autocomplete feature implementation.

## Environment Variables

Add the following environment variables to your `.env.local` (for local development) and your production environment (Vercel, etc.):

```bash
# Required: Mapbox API token
# Get this from https://account.mapbox.com/access-tokens/
# IMPORTANT: Create a token restricted to:
#   - Only Geocoding API scope
#   - Your domain restrictions (if applicable)
MAPBOX_TOKEN=your_mapbox_token_here

# Optional: Mapbox API endpoint (defaults to production endpoint)
MAPBOX_ENDPOINT=https://api.mapbox.com/geocoding/v5/mapbox.places

# Optional: Default language for results (defaults to "en")
MAPBOX_DEFAULT_LANGUAGE=en

# Optional: Default result limit (defaults to 6)
MAPBOX_DEFAULT_LIMIT=6
```

## Security Notes

1. **Token Security**: The Mapbox token is never exposed to the browser. All requests go through the server-side proxy at `/api/places/autocomplete`.

2. **Token Restrictions**: When creating your Mapbox token:
   - Restrict it to only the Geocoding API
   - Add URL restrictions if calling from browser (though we proxy server-side)
   - Use a separate token for production vs development

3. **Rate Limiting**: The API route includes IP-based rate limiting (30 requests/minute per IP) to prevent abuse.

## Implementation Details

### API Route: `/api/places/autocomplete`

- **Method**: GET
- **Query Parameters**:
  - `q` (required): Search query (min 3 chars, max 80 chars)
  - `limit` (optional): Number of results (1-10, default 6)
  - `language` (optional): Language code (default: "en")
  - `country` (optional): ISO-3166 alpha-2 country codes (comma-separated, e.g., "au,sg")
  - `proximity` (optional): "lng,lat" for better ranking

- **Response**: 
  ```json
  {
    "results": [
      {
        "id": "string",
        "label": "Surry Hills, New South Wales, Australia",
        "placeType": "neighborhood",
        "country": "Australia",
        "region": "New South Wales",
        "city": "Sydney",
        "suburb": "Surry Hills",
        "postcode": "2010",
        "lng": 151.2093,
        "lat": -33.8688
      }
    ]
  }
  ```

### Component: `PlaceAutocomplete`

- **Props**:
  - `value`: Current input value
  - `onChangeValue`: Callback when input changes
  - `onSelectPlace`: Callback when a place is selected
  - `placeholder`: Input placeholder (default: "Suburb or City")
  - `country`: Country bias (e.g., "au")
  - `className`: Additional CSS classes
  - `id`: Input ID for accessibility
  - `data-testid`: Test ID

- **Features**:
  - Debounced search (250ms)
  - Minimum 3 characters before querying
  - Keyboard navigation (Arrow Up/Down, Enter, Escape)
  - Mouse support
  - Loading states
  - Error handling
  - Accessible (ARIA-compliant combobox)

### Integration

The `PlaceAutocomplete` component is integrated into `SearchForm` and replaces the plain text input. When a place is selected:

- The input is filled with the place label
- The normalized place object is stored in state
- On form submission, lat/lng and other metadata are included in URL params

### Caching

- In-memory cache with 24-hour TTL
- Cache key includes: query, limit, language, country, proximity
- Automatic cleanup of expired entries
- **Note**: For production with multiple instances, consider using Redis/Upstash/Vercel KV

### Rate Limiting

- IP-based rate limiting
- 30 requests per minute per IP
- Returns 429 status when limit exceeded
- **Note**: For production with multiple instances, consider using Redis/Upstash for distributed rate limiting

## Testing Checklist

- [ ] Typing "Surr" returns "Surry Hills..." (AU)
- [ ] Typing "San" returns global results
- [ ] Arrow navigation works (Up/Down)
- [ ] Enter key selects highlighted option
- [ ] Escape key closes dropdown
- [ ] Mouse click selects option
- [ ] Loading spinner appears during search
- [ ] Error message shows on API failure
- [ ] "No matches" shows when no results
- [ ] Selected place fills input and stores lat/lng
- [ ] Form submission includes lat/lng in URL params

## Future Enhancements

1. **Proximity Search**: Use user's location (with permission) to bias results
2. **Recent Searches**: Store and show recently searched places
3. **Favorites**: Allow users to save favorite locations
4. **Distributed Caching**: Move to Redis/Upstash for multi-instance deployments
5. **Distributed Rate Limiting**: Move to Redis/Upstash for multi-instance deployments
