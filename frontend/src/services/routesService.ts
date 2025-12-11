import api from './api';
import type { LatLng, TravelProfile } from './routingService';

export interface RouteOptionsResponse {
  travel_modes: string[];
  available_event_types: string[];
  default_avoid_types: string[];
}

export interface RouteImpact {
  event_id: number;
  type: string;
  severity: number;
  distance_km: number;
  impact_score: number;
}

export interface RouteLogPayload {
  start: LatLng;
  end: LatLng;
  mode: TravelProfile;
  avoid_types: string[];
  polyline?: unknown;
}

export interface RouteLogResponse {
  request_id: number;
  route_id: number | null;
  score: number;
  impacts: RouteImpact[];
}

export const routesService = {
  async getOptions(): Promise<RouteOptionsResponse> {
    const { data } = await api.get<RouteOptionsResponse>('/api/routes/options');
    return data;
  },

  async logRoute(payload: RouteLogPayload): Promise<RouteLogResponse> {
    const { data } = await api.post<RouteLogResponse>('/api/routes/', payload);
    return data;
  }
};
