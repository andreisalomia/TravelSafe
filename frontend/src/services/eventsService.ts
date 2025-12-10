import api from './api';
import axios from 'axios';

// --- INTERFEȚE (Tipuri de date) ---

export interface MapData {
  markers: MarkerData[];
  heatmap: HeatmapPoint[];
}

export interface MarkerData {
  id: number;
  type: string;
  severity: number;
  lat: number;
  lng: number;
  description: string;
  created_at: string;
}

export interface HeatmapPoint {
  lat: number;
  lng: number;
  weight: number;
}

export interface Event {
  id: number;
  type: string;
  severity: number;
  latitude: number;
  longitude: number;
  status: string;
  expires_at: string | null;
  created_at: string;
  reported_by: number | null;
  reports_count: number;
}

export interface CreateEventData {
  type: string;
  severity: number;
  latitude: number;
  longitude: number;
}

export interface UpdateEventData {
  type?: string;
  severity?: number;
  latitude?: number;
  longitude?: number;
  status?: string;
}

export interface EventsResponse {
  events: Event[];
  count: number;
}

export interface EventStatistics {
  total_events: number;
  active_events: number;
  resolved_events: number;
  by_type: Record<string, number>;
  by_severity: Record<string, number>;
}

// --- CONSTANTE PENTRU UI ---

export const EVENT_TYPE_LABELS: Record<string, string> = {
  accident: 'Accident',
  construction: 'Construction',
  traffic_jam: 'Traffic Jam',
  road_closure: 'Road Closure',
  hazard: 'Hazard',
  police: 'Police',
  other: 'Other',
};

export const EVENT_TYPE_COLORS: Record<string, string> = {
  accident: '#dc3545',
  construction: '#ffc107',
  traffic_jam: '#ff5722',
  road_closure: '#9c27b0',
  hazard: '#ff9800',
  police: '#2196f3',
  other: '#607d8b',
};

export const SEVERITY_LABELS: Record<number, string> = {
  1: 'Very Low',
  2: 'Low',
  3: 'Medium',
  4: 'High',
  5: 'Critical',
};

// --- SERVICIUL PRINCIPAL (CRUD) ---

export const eventsService = {
  async getAllEvents(filters?: {
    type?: string;
    severity?: number;
    status?: string;
    limit?: number;
  }): Promise<EventsResponse> {
    const params = new URLSearchParams();
    if (filters?.type) params.append('type', filters.type);
    if (filters?.severity) params.append('severity', filters.severity.toString());
    if (filters?.status) params.append('status', filters.status);
    if (filters?.limit) params.append('limit', filters.limit.toString());

    // Ruta din backend este sub /api/events
    const response = await api.get<EventsResponse>(
      `/api/events?${params.toString()}`
    );
    return response.data;
  },

  async getEvent(id: number): Promise<Event> {
    const response = await api.get<{ event: Event }>(`/api/events/${id}`);
    return response.data.event;
  },

  async createEvent(data: CreateEventData): Promise<Event> {
    const response = await api.post<{ event: Event }>('/api/events/', data);
    return response.data.event;
  },

  async updateEvent(id: number, data: UpdateEventData): Promise<Event> {
    const response = await api.put<{ event: Event }>(`/api/events/${id}`, data);
    return response.data.event;
  },

  async deleteEvent(id: number): Promise<void> {
    await api.delete(`/api/events/${id}`);
  },

  async reportEvent(id: number): Promise<{ reports_count: number }> {
    const response = await api.post<{ reports_count: number }>(
      `/api/events/${id}/report`
    );
    return response.data;
  },

  async getNearbyEvents(
    latitude: number,
    longitude: number,
    radius: number = 5
  ): Promise<EventsResponse & { center: { latitude: number; longitude: number }; radius_km: number }> {
    const response = await api.get(
      `/api/events/nearby?latitude=${latitude}&longitude=${longitude}&radius=${radius}`
    );
    return response.data;
  },

  async getStatistics(): Promise<EventStatistics> {
    const response = await api.get<{ statistics: EventStatistics }>(
      '/api/events/statistics'
    );
    return response.data.statistics;
  },
};

// --- FUNCȚIA PENTRU MAP COMPONENT ---

// URL-ul Backend-ului
const BASE_URL = 'http://127.0.0.1:5000';

export const getMapData = async (): Promise<MapData> => {
  try {
    const response = await axios.get<MapData>(`${BASE_URL}/api/events/map-data`);
    return response.data;
  } catch (error) {
    console.error("❌ Eroare la preluarea datelor GIS:", error);
    return { markers: [], heatmap: [] };
  }
};