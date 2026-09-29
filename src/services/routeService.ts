import { logger } from './logger';

export interface RouteDistanceResult {
  miles: number;
  formattedDistance: string;
  source: 'road-osrm' | 'haversine-estimate' | 'google';
  originFormatted?: string;
  destinationFormatted?: string;
}

/**
 * Extracts a UK postcode from a string (e.g. "14 High Street, Guildford GU1 4RF" -> "GU1 4RF").
 */
export function extractUkPostcode(address: string): string | null {
  if (!address) return null;
  // Standard UK postcode regex (covers all valid formats)
  const postcodeRegex = /([Gg][Ii][Rr]\s*0[Aa]{2})|((([A-Za-z][0-9]{1,2})|(([A-Za-z][A-Ha-hJ-Yj-y][0-9]{1,2})|(([A-Za-z][0-9][A-Za-z])|([A-Za-z][A-Ha-hJ-Yj-y][0-9][A-Za-z]?))))\s*[0-9][A-Za-z]{2})/;
  const match = address.match(postcodeRegex);
  return match ? match[0].trim().toUpperCase() : null;
}

/**
 * Resolves latitude and longitude for a UK postcode using free postcodes.io API.
 */
async function geocodeUkPostcode(postcode: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const clean = postcode.replace(/\s+/g, '');
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === 200 && data.result) {
      return {
        lat: data.result.latitude,
        lng: data.result.longitude,
      };
    }
  } catch (err) {
    logger.warn('Failed to geocode UK postcode via postcodes.io', err);
  }
  return null;
}

/**
 * Calculates straight-line distance in miles using the Haversine formula,
 * adjusted with a 1.28x UK driving winding factor to approximate road miles.
 */
function calculateHaversineRoadMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const straightMiles = R * c;
  // Apply standard UK road route winding factor (1.28)
  return Math.round(straightMiles * 1.28 * 10) / 10;
}

/**
 * Resolves coordinates and postcode for any UK address or street, checking postcode first then Nominatim.
 */
export async function geocodeUkAddress(
  addressOrPostcode: string
): Promise<{ lat: number; lng: number; postcode?: string; formatted?: string } | null> {
  const clean = addressOrPostcode.trim();
  if (!clean) return null;

  // 1. Try extracting a UK postcode directly
  const pc = extractUkPostcode(clean);
  if (pc) {
    const coords = await geocodeUkPostcode(pc);
    if (coords) {
      return { ...coords, postcode: pc, formatted: pc };
    }
  }

  // 2. Fall back to free UK Nominatim street-level geocoding for full addresses
  try {
    const searchTarget = clean.toLowerCase().includes('uk') || clean.toLowerCase().includes('united kingdom')
      ? clean
      : `${clean}, UK`;
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchTarget)}&format=json&countrycodes=gb&limit=1`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const item = data[0];
        const extractedPc = extractUkPostcode(item.display_name);
        return {
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon),
          postcode: extractedPc || undefined,
          formatted: item.display_name
        };
      }
    }
  } catch (err) {
    logger.warn('Failed to geocode UK street address via Nominatim', err);
  }

  return null;
}

/**
 * Calculates road driving distance between two addresses or UK postcodes.
 * Zero-configuration: Works using free UK open data (Postcodes.io + Nominatim + OSRM) with no API keys or CORS issues!
 */
export async function calculateDrivingDistance(
  origin: string,
  destination: string
): Promise<RouteDistanceResult | null> {
  const originClean = origin.trim();
  const destClean = destination.trim();

  if (!originClean || !destClean) return null;

  // Geocode both points (resolves postcodes or full street addresses cleanly)
  const [originGeo, destGeo] = await Promise.all([
    geocodeUkAddress(originClean),
    geocodeUkAddress(destClean),
  ]);

  if (originGeo && destGeo) {
    // Query OSRM free driving route service
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originGeo.lng},${originGeo.lat};${destGeo.lng},${destGeo.lat}?overview=false`;
      const osrmRes = await fetch(osrmUrl);
      if (osrmRes.ok) {
        const osrmData = await osrmRes.json();
        if (osrmData.routes && osrmData.routes.length > 0) {
          const distanceMetres = osrmData.routes[0].distance;
          const miles = Math.round((distanceMetres / 1609.344) * 10) / 10;
          return {
            miles,
            formattedDistance: `${miles} miles`,
            source: 'road-osrm',
            originFormatted: originGeo.postcode || originGeo.formatted || originClean,
            destinationFormatted: destGeo.postcode || destGeo.formatted || destClean,
          };
        }
      }
    } catch (osrmErr) {
      logger.warn('OSRM routing request failed, falling back to Haversine road estimate', osrmErr);
    }

    // Fallback: Haversine distance with road winding factor
    const fallbackMiles = calculateHaversineRoadMiles(
      originGeo.lat,
      originGeo.lng,
      destGeo.lat,
      destGeo.lng
    );
    return {
      miles: fallbackMiles,
      formattedDistance: `~${fallbackMiles} miles (estimate)`,
      source: 'haversine-estimate',
      originFormatted: originGeo.postcode || originGeo.formatted || originClean,
      destinationFormatted: destGeo.postcode || destGeo.formatted || destClean,
    };
  }

  return null;
}
