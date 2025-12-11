import esriConfig from '@arcgis/core/config';
import Point from '@arcgis/core/geometry/Point';
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
const ROUTE_OUT_WKID = 4326; // Keep WGS84 to avoid projection issues

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

  const pointBarriers: Graphic[] =
    plan.avoidTypes.length === 0
      ? []
      : incidents
          .filter((incident) => plan.avoidTypes.includes(incident.type))
          .map(
            (incident) =>
              new Graphic({
                geometry: new Point({
                  latitude: incident.lat,
                  longitude: incident.lng,
                  spatialReference: stopSpatialRef,
                }),
                attributes: { Name: incident.type },
              })
          );

  const params = new RouteParameters({
    stops,
    returnRoutes: true,
    returnDirections: false,
    outputLines: 'true-shape',
    outSpatialReference: spatialReference ?? new SpatialReference({ wkid: ROUTE_OUT_WKID }),
  });

  if (travelMode) {
    params.travelMode = travelMode as any;
  }

  if (pointBarriers.length) {
    params.pointBarriers = new FeatureSet({
      features: pointBarriers,
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
