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
  car: ['Driving Time', 'Driving Distance'],
  bicycle: ['Cycling Time', 'Bicycle Time', 'Driving Distance'],
  pedestrian: ['Walking Time', 'Walking Distance'],
};

async function ensureTravelModes(): Promise<TravelMode[]> {
  if (supportedTravelModes.length) {
    return supportedTravelModes;
  }
  const routeModule: any = route;
  if (typeof routeModule.fetchServiceDescription === 'function') {
    const info = await routeModule.fetchServiceDescription(ROUTE_URL);
    supportedTravelModes = info.supportedTravelModes || [];
  }
  return supportedTravelModes;
}

function resolveTravelMode(profile: TravelProfile, modes: TravelMode[]): TravelMode | null {
  const candidates = travelModeNames[profile];
  for (const candidate of candidates) {
    const found = modes.find((mode: any) => mode.name === candidate || mode.travelModeName === candidate);
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
  // At the equator, 1 degree ≈ 111,320 meters
  // Adjust for latitude
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

/**
 * Get barrier radius based on incident severity
 * Higher severity = larger avoidance zone
 */
function getBarrierRadiusForSeverity(severity: number): number {
  // Base radius + extra based on severity (1-5)
  // Severity 1: 100m, Severity 5: 300m
  return 100 + (severity - 1) * 50;
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

  // Filter incidents to avoid based on selected types
  const incidentsToAvoid = plan.avoidTypes.length === 0
    ? []
    : incidents.filter((incident) => plan.avoidTypes.includes(incident.type));

  console.log('[RoutingService] Creating barriers for', incidentsToAvoid.length, 'incidents');

  // Create polygon barriers (circles) around incidents
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
        BarrierType: 0, // 0 = restriction (complete block)
      },
    });
  });

  // Also create point barriers as fallback (some routing services handle them better)
  const pointBarriers: Graphic[] = incidentsToAvoid.map((incident) => 
    new Graphic({
      geometry: new Point({
        latitude: incident.lat,
        longitude: incident.lng,
        spatialReference: stopSpatialRef,
      }),
      attributes: { 
        Name: incident.type,
        BarrierType: 0,
        // Add cost attribute to make passing through very expensive
        Attr_Minutes: 999999,
        Attr_TravelTime: 999999,
      },
    })
  );

  const params = new RouteParameters({
    stops,
    returnRoutes: true,
    returnDirections: false,
    outputLines: 'true-shape',
    outSpatialReference: spatialReference ?? new SpatialReference({ wkid: ROUTE_OUT_WKID }),
    // Important: Set to find best route considering barriers
    findBestSequence: false,
    preserveFirstStop: true,
    preserveLastStop: true,
  });

  if (travelMode) {
    params.travelMode = travelMode as any;
  }

  // Add polygon barriers (more effective for creating avoidance zones)
  if (polygonBarriers.length > 0) {
    params.polygonBarriers = new FeatureSet({
      features: polygonBarriers,
      spatialReference: stopSpatialRef,
    });
    console.log('[RoutingService] Added', polygonBarriers.length, 'polygon barriers');
  }

  // Also add point barriers as additional deterrent
  if (pointBarriers.length > 0) {
    params.pointBarriers = new FeatureSet({
      features: pointBarriers,
      spatialReference: stopSpatialRef,
    });
    console.log('[RoutingService] Added', pointBarriers.length, 'point barriers');
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

  const distanceKm =
    typeof attrs.Total_Kilometers === 'number'
      ? attrs.Total_Kilometers
      : typeof attrs.Total_Miles === 'number'
        ? attrs.Total_Miles * 1.60934
        : undefined;

  const timeMinutes =
    typeof attrs.Total_TravelTime === 'number'
      ? attrs.Total_TravelTime
      : typeof attrs.Total_Time === 'number'
        ? attrs.Total_Time
        : undefined;

  return {
    geometry,
    geometryWgs84Json: geometryWgs84?.toJSON() ?? geometry.toJSON(),
    distanceText: distanceKm != null ? `${distanceKm.toFixed(2)} km` : 'distance unavailable',
    timeText: timeMinutes != null ? `${Math.round(timeMinutes)} min` : 'time unavailable',
  };
}