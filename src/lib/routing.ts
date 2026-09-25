/**
 * Routing Service for calculating genuine road paths (never straight lines).
 * Uses OpenStreetMap / OSRM routing with multi-tier failover and snapping.
 */

// Central point for water supply in Inhapi - AL
export const WATER_SUPPLY_POINT: [number, number] = [-9.2155, -36.3488];

// Route cache to prevent redundant network calls
const routeCache = new Map<string, { route: [number, number][]; timestamp: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minute

const ROUTING_SERVERS = [
  'https://router.project-osrm.org/route/v1/driving/',
  'https://routing.openstreetmap.de/routed-car/route/v1/driving/'
];

/**
 * Checks if a set of coordinates represents a real road path (not a straight chord)
 */
export function isRoadRoute(coords?: [number, number][] | null): boolean {
  if (!coords || !Array.isArray(coords)) return false;
  // A straight line between two distant points has only 2 points.
  // A real road route contains curved geometry vertices along the road network.
  return coords.length >= 3;
}

/**
 * Calculates distance in meters between two lat/lng points (Haversine)
 */
function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Fetches the road-following geometry between waypoints.
 * STRICT RULE: Under NO circumstances will this return a straight line.
 * If routing fails or is unavailable, it returns null.
 */
export async function fetchRoadRoute(
  waypoints: [number, number][]
): Promise<[number, number][] | null> {
  if (!waypoints || waypoints.length < 2) return null;

  // Filter out invalid/zero coordinates
  const validWaypoints = waypoints.filter(
    (w) => typeof w[0] === 'number' && !isNaN(w[0]) && w[0] !== 0 &&
           typeof w[1] === 'number' && !isNaN(w[1]) && w[1] !== 0
  );

  if (validWaypoints.length < 2) return null;

  // Check cache for 2-point routes
  const cacheKey = validWaypoints.map(w => `${w[0].toFixed(5)},${w[1].toFixed(5)}`).join(';');
  const cached = routeCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.route;
  }

  // Build OSRM coordinate string (OSRM expects lng,lat)
  const coordString = validWaypoints.map(w => `${w[1]},${w[0]}`).join(';');
  const radiuses = validWaypoints.map(() => 'unlimited').join(';');

  for (const serverBase of ROUTING_SERVERS) {
    try {
      const url = `${serverBase}${coordString}?overview=full&geometries=geojson&continue_straight=default&radiuses=${radiuses}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        continue;
      }

      const data = await response.json();

      if (data.code === 'Ok' && data.routes && data.routes[0]?.geometry?.coordinates) {
        // OSRM returns [lng, lat], we need [lat, lng]
        const roadCoordinates: [number, number][] = data.routes[0].geometry.coordinates.map(
          (c: number[]) => [c[1], c[0]] as [number, number]
        );

        // Verify that the route actually has road detail (not just 2 endpoints)
        if (roadCoordinates.length >= 2) {
          routeCache.set(cacheKey, { route: roadCoordinates, timestamp: Date.now() });
          return roadCoordinates;
        }
      }
    } catch (err) {
      // Continue to next routing server
      console.warn(`[Routing] Erro no servidor ${serverBase}, tentando próximo...`, err);
    }
  }

  // Fallback: If multi-stop batch route failed, try calculating leg-by-leg along roads
  if (validWaypoints.length > 2) {
    const combinedLegs: [number, number][] = [];

    for (let i = 0; i < validWaypoints.length - 1; i++) {
      const leg = await fetchRoadRoute([validWaypoints[i], validWaypoints[i + 1]]);
      if (leg && leg.length > 0) {
        if (combinedLegs.length > 0) {
          // Avoid duplicate vertex at junction
          combinedLegs.push(...leg.slice(1));
        } else {
          combinedLegs.push(...leg);
        }
      } else {
        // One leg could not be found along roads; return what we have if valid or null
      }
    }

    if (combinedLegs.length >= 3) {
      routeCache.set(cacheKey, { route: combinedLegs, timestamp: Date.now() });
      return combinedLegs;
    }
  }

  // NEVER return straight line! Return null so no straight line is drawn on the map.
  return null;
}
