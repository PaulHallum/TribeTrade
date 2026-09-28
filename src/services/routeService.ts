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
 * Calculates road driving distance between two addresses or UK postcodes.
 * Zero-configuration: Works using free UK open data (Postcodes.io + OSRM) with no API keys required!
 */
export async function calculateDrivingDistance(
  origin: string,
  destination: string
): Promise<RouteDistanceResult | null> {
  const originClean = origin.trim();
  const destClean = destination.trim();

  if (!originClean || !destClean) return null;

  // 1. Try extracting UK postcodes from origin and destination
  const originPostcode = extractUkPostcode(originClean);
  const destPostcode = extractUkPostcode(destClean);

  if (originPostcode && destPostcode) {
    const [originCoords, destCoords] = await Promise.all([
      geocodeUkPostcode(originPostcode),
      geocodeUkPostcode(destPostcode),
    ]);

    if (originCoords && destCoords) {
      // 2. Query OSRM free driving route service
      try {
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${originCoords.lng},${originCoords.lat};${destCoords.lng},${destCoords.lat}?overview=false`;
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
              originFormatted: originPostcode,
              destinationFormatted: destPostcode,
            };
          }
        }
      } catch (osrmErr) {
        logger.warn('OSRM routing request failed, falling back to Haversine road estimate', osrmErr);
      }

      // Fallback: Haversine distance with road winding factor
      const fallbackMiles = calculateHaversineRoadMiles(
        originCoords.lat,
        originCoords.lng,
        destCoords.lat,
        destCoords.lng
      );
      return {
        miles: fallbackMiles,
        formattedDistance: `~${fallbackMiles} miles (estimate)`,
        source: 'haversine-estimate',
        originFormatted: originPostcode,
        destinationFormatted: destPostcode,
      };
    }
  }

  // 3. If no postcodes, check if Google Distance Matrix is available via backend or client key
  try {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (apiKey) {
      const endpoint = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(originClean)}&destinations=${encodeURIComponent(destClean)}&units=imperial&key=${apiKey}`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        if (data.rows?.[0]?.elements?.[0]?.status === 'OK') {
          const element = data.rows[0].elements[0];
          const metres = element.distance.value;
          const miles = Math.round((metres / 1609.344) * 10) / 10;
          return {
            miles,
            formattedDistance: element.distance.text,
            source: 'google',
            originFormatted: data.origin_addresses?.[0],
            destinationFormatted: data.destination_addresses?.[0],
          };
        }
      }
    }
  } catch (googleErr) {
    logger.warn('Google Maps Distance Matrix check skipped', googleErr);
  }

  return null;
}
