import esriConfig from '@arcgis/core/config';
import Point from '@arcgis/core/geometry/Point';
import Polygon from '@arcgis/core/geometry/Polygon';
import Polyline from '@arcgis/core/geometry/Polyline';
import SpatialReference from '@arcgis/core/geometry/SpatialReference';
import Graphic from '@arcgis/core/Graphic';
import FeatureSet from '@arcgis/core/rest/support/FeatureSet';
import RouteParameters from '@arcgis/core/rest/support/RouteParameters';
import * as route from '@arcgis/core/rest/route';
import * as webMercatorUtils from '@arcgis/core/geometry/support/webMercatorUtils';
import type TravelMode from '@arcgis/core/rest/support/TravelMode';
import type { MarkerData } from './eventsService';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export type TravelProfile = 'car' | 'bicycle' | 'pedestrian';

export interface RoutePlanRequest {
  start: LatLng;
  end: LatLng;
  mode: TravelProfile;
  avoidTypes: string[];
}

export interface RouteResult {
  geometry: Polyline;
  geometryWgs84Json: __esri.PolylineProperties;
  distanceText: string;
  timeText: string;
}

const ROUTE_URL = 'https://route-api.arcgis.com/arcgis/rest/services/World/Route/NAServer/Route_World';
const STOP_WKID = 4326;
const ROUTE_OUT_WKID = 4326;

// Barrier radius in meters - incidents will be avoided within this distance
const BARRIER_RADIUS_METERS = 200; // 200 meters buffer around each incident

let supportedTravelModes: TravelMode[] = [];

const travelModeNames: Record<TravelProfile, string[]> = {
  car: ['Driving Time', 'Driving Distance', 'Driving'],
  bicycle: ['Cycling Time', 'Bicycle Time', 'Biking'],
  pedestrian: ['Walking Time', 'Walking Distance', 'Walking'],
};

async function ensureTravelModes(): Promise<TravelMode[]> {
  if (supportedTravelModes.length) {
    return supportedTravelModes;
  }
  const routeModule: any = route;
  try {
    if (typeof routeModule.fetchServiceDescription === 'function') {
        const info = await routeModule.fetchServiceDescription(ROUTE_URL);
        supportedTravelModes = info.supportedTravelModes || [];
    }
  } catch(e) { console.warn("Could not fetch travel modes", e); }
  return supportedTravelModes;
}

function resolveTravelMode(profile: TravelProfile, modes: TravelMode[]): TravelMode | null {
  const candidates = travelModeNames[profile];
  for (const candidate of candidates) {
    const found = modes.find((mode: any) => 
        mode.name === candidate || 
        mode.travelModeName === candidate ||
        mode.name.includes(candidate)
    );
    if (found) return found;
  }
  return modes.length ? modes[0] : null;
}

/**
 * Create a circular polygon around a point (approximated with 32 vertices)
 * This creates a buffer zone that the routing service will avoid
 */
function createCirclePolygon(
  centerLat: number,
  centerLon: number,
  radiusMeters: number,
  spatialReference: SpatialReference
): Polygon {
  const numPoints = 32;
  const rings: number[][] = [];
  
  // Convert radius from meters to degrees (approximate)
  const latRadians = (centerLat * Math.PI) / 180;
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLon = 111320 * Math.cos(latRadians);
  
  const radiusDegreesLat = radiusMeters / metersPerDegreeLat;
  const radiusDegreesLon = radiusMeters / metersPerDegreeLon;
  
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i * 2 * Math.PI) / numPoints;
    const lat = centerLat + radiusDegreesLat * Math.sin(angle);
    const lon = centerLon + radiusDegreesLon * Math.cos(angle);
    rings.push([lon, lat]);
  }
  
  return new Polygon({
    rings: [rings],
    spatialReference,
  });
}

function getBarrierRadiusForSeverity(severity: number): number {
  return 30 + (severity * 20); // Ajustat pentru oraș (mai mic)
}

export async function calculateRoute(
  plan: RoutePlanRequest,
  incidents: MarkerData[],
  spatialReference?: __esri.SpatialReference
): Promise<RouteResult> {
  const apiKey = import.meta.env.VITE_ARCGIS_API_KEY as string | undefined;
  if (!apiKey) {
    throw new Error('Missing ArcGIS API key (VITE_ARCGIS_API_KEY)');
  }
  esriConfig.apiKey = apiKey;

  const modes = await ensureTravelModes();
  const travelMode = resolveTravelMode(plan.mode, modes);

  const stopSpatialRef = new SpatialReference({ wkid: STOP_WKID });
  const stops = new FeatureSet({
    features: [
      new Graphic({
        geometry: new Point({
          latitude: plan.start.latitude,
          longitude: plan.start.longitude,
          spatialReference: stopSpatialRef,
        }),
        attributes: { Name: 'Start' },
      }),
      new Graphic({
        geometry: new Point({
          latitude: plan.end.latitude,
          longitude: plan.end.longitude,
          spatialReference: stopSpatialRef,
        }),
        attributes: { Name: 'Destination' },
      }),
    ],
    spatialReference: stopSpatialRef,
  });

  const incidentsToAvoid = plan.avoidTypes.length === 0
    ? []
    : incidents.filter((incident) => plan.avoidTypes.includes(incident.type));

  console.log('[RoutingService] Creating barriers for', incidentsToAvoid.length, 'incidents');

  // Create polygon barriers
  const polygonBarriers: Graphic[] = incidentsToAvoid.map((incident) => {
    const radius = getBarrierRadiusForSeverity(incident.severity);
    const polygon = createCirclePolygon(
      incident.lat,
      incident.lng,
      radius,
      stopSpatialRef
    );
    
    return new Graphic({
      geometry: polygon,
      attributes: {
        Name: `${incident.type}_${incident.id}`,
        // MODIFICARE: Folosim Cost (1) in loc de Restrictie (0) pentru a evita erorile
        BarrierType: 1, 
        Attr_CostFactor: 10 // Penalizare mare, dar permite trecerea daca e singura optiune
      },
    });
  });

  // NU mai folosim pointBarriers pentru ca se suprapun si dau eroare
  const pointBarriers: Graphic[] = [];

  const params = new RouteParameters({
    stops,
    returnRoutes: true,
    returnDirections: false,
    outputLines: 'true-shape',
    outSpatialReference: spatialReference ?? new SpatialReference({ wkid: ROUTE_OUT_WKID }),
    findBestSequence: false,
    preserveFirstStop: true,
    preserveLastStop: true,
  });

  if (travelMode) {
    // --- MODIFICARE CRITICĂ PENTRU PIETONI ---
    if (plan.mode === 'pedestrian') {
        // Ignorăm ierarhia străzilor (nu căuta bulevarde, ia-o pe scurtătură)
        travelMode.useHierarchy = false;
        
        // Permitem întoarcerea oriunde (pietonii se pot întoarce pe loc)
        (travelMode as any).uturnAtStops = 0; // esriNFSBAllowBacktrack

        // Eliminăm restricțiile de Sens Unic
        if (travelMode.restrictionAttributeNames) {
             travelMode.restrictionAttributeNames = travelMode.restrictionAttributeNames.filter(
                 name => !['OneWay', 'TurnRestriction', 'One Way'].includes(name)
             );
        }
    }
    params.travelMode = travelMode as any;
  }

  if (polygonBarriers.length > 0) {
    params.polygonBarriers = new FeatureSet({
      features: polygonBarriers,
      spatialReference: stopSpatialRef,
    });
  }

  const result = await route.solve(ROUTE_URL, params);
  const routeResults = (result as any).routeResults as any[];

  if (!routeResults || !routeResults.length) {
    throw new Error('No route returned from routing service');
  }

  const routeFeature = routeResults[0].route as Graphic;
  const attrs = routeFeature.attributes as Record<string, number | string | undefined>;
  const geometry = routeFeature.geometry as Polyline;
  const geometryWgs84 =
    geometry.spatialReference?.wkid === STOP_WKID
      ? geometry
      : (webMercatorUtils.webMercatorToGeographic(geometry) as Polyline) ?? geometry;

  // --- CALCUL DISTANȚĂ ---
    let distanceKm = 0;
    if (typeof attrs.Total_Kilometers === 'number') {
        distanceKm = attrs.Total_Kilometers;
    } else if (typeof attrs.Total_Miles === 'number') {
        distanceKm = attrs.Total_Miles * 1.60934;
    } else {
        // Fallback: Calculăm lungimea geometrică dacă API-ul nu returnează atributul
        // Folosim WebMercatorUtils pentru precizie
        distanceKm = webMercatorUtils.geodesicLength(geometry, "kilometers");
    }

    // --- CALCUL TIMP (FIX) ---
    let timeMinutes = 0;
    
    // 1. Încercăm să luăm din atributele ArcGIS
    if (typeof attrs.Total_TravelTime === 'number') {
        timeMinutes = attrs.Total_TravelTime;
    } else if (typeof attrs.Total_Time === 'number') {
        timeMinutes = attrs.Total_Time;
    } else if (typeof attrs.Total_Minutes === 'number') {
        timeMinutes = attrs.Total_Minutes;
    } else {
        // 2. FALLBACK MANUAL: Dacă ArcGIS nu dă timpul (se întâmplă des la pietoni), îl calculăm noi
        // Viteze medii: Mașină 30km/h, Bicicletă 15km/h, Pieton 5km/h
        let speedKmh = 30; 
        if (plan.mode === 'bicycle') speedKmh = 15;
        if (plan.mode === 'pedestrian') speedKmh = 5;
        
        timeMinutes = (distanceKm / speedKmh) * 60;
        console.log(`[Routing] Calculated fallback time: ${timeMinutes.toFixed(1)} min (Distance: ${distanceKm.toFixed(2)}km, Speed: ${speedKmh}km/h)`);
    }

    return {
      geometry,
      geometryWgs84Json: geometryWgs84?.toJSON() ?? geometry.toJSON(),
      distanceText: `${distanceKm.toFixed(2)} km`,
      timeText: `${Math.round(timeMinutes)} min`,
    };
}