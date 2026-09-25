import { logger } from './logger';

export interface PlaceLookupResult {
  name: string;
  address?: string;
  mapsUrl: string;
  websiteUrl?: string;
  rating?: number;
}

export interface NearbyPlaceItem {
  name: string;
  type: string;
  categoryBadge: 'kids_focus' | 'special_event' | 'outdoor_free' | 'family_all';
  rating: number;
  distance: string;
  travelTime?: string;
  lat?: number;
  lng?: number;
  url?: string;
  cost: 'Free' | '£' | '££' | '£££';
  reason: string;
  matchFound?: boolean;
  matchDetails?: string;
  description?: string;
  location?: string;
  dates?: string;
}

/**
 * Looks up verified Google Maps venue details, official website links, and addresses.
 * Uses Google Places API endpoint with zero AI grounding costs.
 */
export async function lookupPlaceDetails(venueName: string, locationHint: string = ''): Promise<PlaceLookupResult> {
  const query = `${venueName} ${locationHint}`.trim();
  const fallbackMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

  if (!venueName) {
    return { name: venueName, mapsUrl: fallbackMapsUrl };
  }

  try {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      return { name: venueName, mapsUrl: fallbackMapsUrl };
    }

    const endpoint = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
    const response = await fetch(endpoint);
    if (!response.ok) {
      return { name: venueName, mapsUrl: fallbackMapsUrl };
    }

    const data = await response.json();
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const topResult = data.results[0];
      const placeId = topResult.place_id;
      const mapsUrl = placeId 
        ? `https://www.google.com/maps/place/?q=place_id:${placeId}` 
        : fallbackMapsUrl;

      return {
        name: topResult.name || venueName,
        address: topResult.formatted_address,
        mapsUrl,
        rating: topResult.rating
      };
    }
  } catch (error) {
    logger.info('Google Places API client lookup skipped, using fallback Google Maps link', error);
  }

  return { name: venueName, mapsUrl: fallbackMapsUrl };
}

/**
 * Fetches verified permanent places (playgrounds, farm parks, family pubs, leisure centers) via Google Places API.
 * Uses GCP's $200 free monthly credit ($0.00 grounding cost).
 */
export async function fetchNearbyPlaces(locationQuery: string, radiusMiles: number = 10, keyword: string = 'family activity playground park'): Promise<NearbyPlaceItem[]> {
  try {
    const url = `/api/places/search?query=${encodeURIComponent(keyword)}&location=${encodeURIComponent(locationQuery)}&radius=${radiusMiles}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    
    const data = await res.json();
    if (data.status === 'OK' && data.results) {
      return data.results.slice(0, 9).map((p: any) => ({
        name: p.name,
        type: p.types?.[0] || 'place',
        categoryBadge: 'family_all',
        rating: p.rating || 0,
        distance: '', // Will be calculated by frontend
        lat: p.geometry?.location?.lat,
        lng: p.geometry?.location?.lng,
        reason: 'Recommended local family spot based on search.',
        location: p.formatted_address,
        dates: ''
      }));
    }
  } catch (error) {
    logger.error('Failed to fetch nearby places proxy', error);
  }
  return [];
}
