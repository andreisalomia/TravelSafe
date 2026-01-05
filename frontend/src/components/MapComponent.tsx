import { useEffect, useRef, useState } from 'react';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import esriConfig from '@arcgis/core/config';
import Graphic from '@arcgis/core/Graphic';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import Point from '@arcgis/core/geometry/Point';
import Polyline from '@arcgis/core/geometry/Polyline';
import SimpleLineSymbol from '@arcgis/core/symbols/SimpleLineSymbol';
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol';
import HeatmapRenderer from '@arcgis/core/renderers/HeatmapRenderer';

import { getMapData, type MarkerData, eventsService } from '../services/eventsService';
import type { FavoritePlace } from '../services/favoritesService';

import '@arcgis/core/assets/esri/themes/light/main.css';
// commit
interface MapComponentProps {  
  onMapClick?: (coords: { latitude: number; longitude: number }) => void;
  onIncidentsLoaded?: (markers: MarkerData[]) => void;
  onFavoriteClick?: (favorite: FavoritePlace) => void;
  onIncidentDeleted?: (id: number) => void;
  favorites?: FavoritePlace[];
  canDeleteIncidents?: boolean;
  refreshIncidentsTick?: number;
  // Accept either Polyline instance or JSON properties
  activeRoute?: __esri.PolylineProperties | Polyline | null;
  routeStops?: { start?: { latitude: number; longitude: number }; end?: { latitude: number; longitude: number } };
  forcePointSelection?: boolean;
}

const MapComponent = ({
  onMapClick,
  onIncidentsLoaded,
  onFavoriteClick,
  onIncidentDeleted,
  favorites = [],
  canDeleteIncidents = false,
  refreshIncidentsTick = 0,
  activeRoute,
  routeStops,
  forcePointSelection = false
}: MapComponentProps) => {
  const mapDiv = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<MapView | null>(null);
  const layersLoadedRef = useRef<boolean>(false);
  const routeLayerRef = useRef<GraphicsLayer | null>(null);
  const routeStopsLayerRef = useRef<GraphicsLayer | null>(null);
  const incidentsLayerRef = useRef<GraphicsLayer | null>(null);
  const favoritesLayerRef = useRef<GraphicsLayer | null>(null);
  const heatmapLayerRef = useRef<FeatureLayer | null>(null);
  const clickHandlerRef = useRef<typeof onMapClick | undefined>(undefined);
  const incidentsHandlerRef = useRef<typeof onIncidentsLoaded | undefined>(undefined);
  const favoriteHandlerRef = useRef<typeof onFavoriteClick | undefined>(undefined);
  const incidentDeletedHandlerRef = useRef<typeof onIncidentDeleted | undefined>(undefined);
  const incidentsDataRef = useRef<MarkerData[]>([]);
  const favoritesRef = useRef<FavoritePlace[]>([]);
  const canDeleteIncidentsRef = useRef<boolean>(canDeleteIncidents);
  
  // Track when the view is ready
  const [viewReady, setViewReady] = useState(false);

  useEffect(() => {
    clickHandlerRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    incidentsHandlerRef.current = onIncidentsLoaded;
  }, [onIncidentsLoaded]);

  useEffect(() => {
    favoriteHandlerRef.current = onFavoriteClick;
  }, [onFavoriteClick]);

  useEffect(() => {
    incidentDeletedHandlerRef.current = onIncidentDeleted;
  }, [onIncidentDeleted]);

  useEffect(() => {
    favoritesRef.current = favorites;
  }, [favorites]);

  useEffect(() => {
    canDeleteIncidentsRef.current = canDeleteIncidents;
  }, [canDeleteIncidents]);

  const loadIncidents = async () => {
    const view = viewRef.current;
    if (!view || !view.map) return;

    const data = await getMapData();
    if (!data || !data.markers) {
      console.warn('No map data received from backend.');
      return;
    }

    incidentsDataRef.current = data.markers;
    incidentsHandlerRef.current?.(data.markers);

    if (!incidentsLayerRef.current) {
      incidentsLayerRef.current = new GraphicsLayer({ title: 'Markere Incidente' });
      view.map.add(incidentsLayerRef.current);
    }
    const graphicsLayer = incidentsLayerRef.current;
    graphicsLayer.removeAll();

    data.markers.forEach((marker) => {
      const point = new Point({
        longitude: marker.lng,
        latitude: marker.lat
      });

      const markerSymbol = new SimpleMarkerSymbol({
        color: getSeverityColor(marker.severity),
        outline: { color: [255, 255, 255], width: 1 },
        size: '12px'
      });

      const graphic = new Graphic({
        geometry: point,
        symbol: markerSymbol,
        attributes: {
          ObjectId: marker.id,
          Tip: marker.type.toUpperCase(),
          Descriere: marker.description,
          Severitate: marker.severity
        },
        popupTemplate: {
          title: '{Tip}',
          content: 'Severitate: {Severitate}/5<br>Descriere: {Descriere}'
        }
      });

      graphicsLayer.add(graphic);
    });

    const heatmapGraphics = data.markers.map((marker, index) => {
      return new Graphic({
        geometry: new Point({ longitude: marker.lng, latitude: marker.lat }),
        attributes: {
          ObjectID: index,
          severity_val: marker.severity
        }
      });
    });

    if (heatmapLayerRef.current && view.map) {
      view.map.remove(heatmapLayerRef.current);
    }

    const heatmapLayer = new FeatureLayer({
      source: heatmapGraphics,
      objectIdField: 'ObjectID',
      fields: [
        { name: 'ObjectID', alias: 'ObjectID', type: 'oid' },
        { name: 'severity_val', alias: 'Severity Value', type: 'integer' }
      ],
      renderer: new HeatmapRenderer({
        field: 'severity_val',
        colorStops: [
          { ratio: 0, color: 'rgba(0, 255, 0, 0)' },
          { ratio: 0.2, color: 'rgba(0, 255, 0, 1)' },
          { ratio: 0.5, color: 'rgba(255, 255, 0, 1)' },
          { ratio: 0.8, color: 'rgba(255, 140, 0, 1)' },
          { ratio: 1, color: 'rgba(255, 0, 0, 1)' }
        ],
        radius: 16
      }) as any
    });
    heatmapLayerRef.current = heatmapLayer;
    view.map.add(heatmapLayer, 0);
  };

  // --- CONFIGURARE CULORI ---
  const getSeverityColor = (severity: number): number[] => {
    if (severity >= 5) return [255, 0, 0, 0.9];
    if (severity === 4) return [255, 165, 0, 0.9];
    if (severity === 3) return [255, 255, 0, 0.9];
    if (severity === 2) return [173, 255, 47, 0.9];
    return [0, 255, 0, 0.9];
  };

  // Initialize map
  useEffect(() => {
    esriConfig.apiKey = import.meta.env.VITE_ARCGIS_API_KEY as string;
    if (!mapDiv.current) return;

    const map = new Map({
      basemap: 'streets-navigation-vector'
    });

    const view = new MapView({
      container: mapDiv.current,
      map,
      center: [26.1025, 44.4268],
      zoom: 12
    });

    viewRef.current = view;

    view.when(async () => {
      console.log('[MapComponent] View is ready');
      
      // Create route layers immediately when view is ready
      if (!routeLayerRef.current) {
        routeLayerRef.current = new GraphicsLayer({ title: 'Active Route' });
        if (view.map) {
          view.map.add(routeLayerRef.current);
        }
        console.log('[MapComponent] Route layer created');
      }
      if (!routeStopsLayerRef.current) {
        routeStopsLayerRef.current = new GraphicsLayer({ title: 'Route Stops' });
        if (view.map) {
          view.map.add(routeStopsLayerRef.current);
        }
        console.log('[MapComponent] Route stops layer created');
      }
      
      // Mark view as ready - this will trigger the route rendering effect
      setViewReady(true);
      
      if (layersLoadedRef.current) return;
      await loadIncidents();
      layersLoadedRef.current = true;

      view.on('click', async (event) => {
        const response = await view.hitTest(event);
        const hitFavorite = response.results.find((result: any) => {
          return result?.graphic?.layer?.title === 'Favorite Places';
        }) as any;

        if (hitFavorite?.graphic?.attributes?.favoriteId != null) {
          const favoriteId = hitFavorite.graphic.attributes.favoriteId;
          const favorite = favoritesRef.current.find((fav) => fav.id === favoriteId);
          if (favorite) {
            // While picking start/end (forcePointSelection), consume the click for routing.
            if (forcePointSelection) {
              favoriteHandlerRef.current?.(favorite);
              return;
            }
            // Otherwise, allow map click to continue so incidents can be added near favorites.
          }
        }

        const hitMarker = response.results.find((result: any) => {
          return result?.graphic?.layer?.title === 'Markere Incidente';
        }) as any;

        if (hitMarker && hitMarker.graphic?.attributes?.ObjectId != null) {
          const eventId = hitMarker.graphic.attributes.ObjectId as number;
          if (canDeleteIncidentsRef.current) {
            const confirmed = window.confirm('Delete this incident? This action is irreversible.');
            if (confirmed) {
              try {
                await eventsService.deleteEvent(eventId);
                incidentsDataRef.current = incidentsDataRef.current.filter((e) => e.id !== eventId);
                incidentsHandlerRef.current?.(incidentsDataRef.current);
                incidentDeletedHandlerRef.current?.(eventId);
                incidentsLayerRef.current?.remove(hitMarker.graphic);
              } catch (err) {
                console.error('Failed to delete incident', err);
                alert('Failed to delete incident.');
              }
            }
            return;
          }
          // During point picking we should not block selection even if a marker is hit.
          if (!forcePointSelection) {
            return;
          }
        }
        clickHandlerRef.current?.({
          latitude: event.mapPoint.latitude,
          longitude: event.mapPoint.longitude
        });
      });
    });

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, []);

  // Render route when activeRoute changes AND view is ready
  useEffect(() => {
    console.log('[MapComponent] Route effect triggered', { 
      viewReady, 
      hasActiveRoute: !!activeRoute,
      hasRouteStops: !!routeStops,
      activeRouteType: activeRoute ? typeof activeRoute : 'null',
      activeRoutePaths: activeRoute && 'paths' in activeRoute ? (activeRoute as any).paths?.length : 'N/A'
    });

    // Wait for view to be ready
    if (!viewReady) {
      console.log('[MapComponent] View not ready yet, skipping route render');
      return;
    }

    const view = viewRef.current;
    if (!view || !view.map) {
      console.log('[MapComponent] View or map is null');
      return;
    }

    const routeLayer = routeLayerRef.current;
    const stopsLayer = routeStopsLayerRef.current;
    
    if (!routeLayer || !stopsLayer) {
      console.log('[MapComponent] Route layers not initialized');
      return;
    }

    // Clear existing graphics
    routeLayer.removeAll();
    stopsLayer.removeAll();

    if (!activeRoute) {
      console.log('[MapComponent] No active route to display');
      return;
    }

    // Create Polyline from the route data
    let geometry: Polyline;
    try {
      if (activeRoute instanceof Polyline) {
        geometry = activeRoute;
        console.log('[MapComponent] Using existing Polyline instance');
      } else {
        // It's a JSON/properties object, create new Polyline
        geometry = new Polyline(activeRoute);
        console.log('[MapComponent] Created new Polyline from JSON', {
          paths: geometry.paths,
          pathCount: geometry.paths?.length,
          firstPathLength: geometry.paths?.[0]?.length
        });
      }
    } catch (err) {
      console.error('[MapComponent] Failed to create Polyline:', err);
      return;
    }

    if (!geometry || !geometry.paths || geometry.paths.length === 0) {
      console.log('[MapComponent] Geometry has no paths', { geometry });
      return;
    }

    console.log('[MapComponent] Adding route graphic with', geometry.paths.length, 'paths');

    const routeGraphic = new Graphic({
      geometry,
      symbol: new SimpleLineSymbol({
        color: [64, 99, 255, 0.85],
        width: 4
      })
    });
    routeLayer.add(routeGraphic);
    console.log('[MapComponent] Route graphic added');

    // Add start marker
    if (routeStops?.start) {
      const startGraphic = new Graphic({
        geometry: new Point({
          latitude: routeStops.start.latitude,
          longitude: routeStops.start.longitude
        }),
        symbol: new SimpleMarkerSymbol({
          color: [46, 204, 113, 0.95],
          size: '14px',
          outline: { color: [255, 255, 255], width: 2 }
        }),
        attributes: { name: 'Start' },
        popupTemplate: { title: 'Start' }
      });
      stopsLayer.add(startGraphic);
      console.log('[MapComponent] Start marker added at', routeStops.start);
    }

    // Add end marker
    if (routeStops?.end) {
      const endGraphic = new Graphic({
        geometry: new Point({
          latitude: routeStops.end.latitude,
          longitude: routeStops.end.longitude
        }),
        symbol: new SimpleMarkerSymbol({
          color: [231, 76, 60, 0.95],
          size: '14px',
          outline: { color: [255, 255, 255], width: 2 }
        }),
        attributes: { name: 'Destination' },
        popupTemplate: { title: 'Destination' }
      });
      stopsLayer.add(endGraphic);
      console.log('[MapComponent] End marker added at', routeStops.end);
    }

    // Zoom to fit the route
    const allGraphics = [routeGraphic, ...stopsLayer.graphics.toArray()];
    view
      .goTo(
        {
          target: allGraphics,
          padding: { top: 50, bottom: 50, left: 50, right: 350 } // Extra right padding for the info card
        },
        { duration: 500 }
      )
      .then(() => {
        console.log('[MapComponent] View zoomed to route');
      })
      .catch((err) => {
        console.warn('[MapComponent] Failed to zoom to route:', err);
      });

  }, [activeRoute, routeStops, viewReady]);

  // Render favorites layer when favorites change
  useEffect(() => {
    if (!viewReady) {
      return;
    }
    const view = viewRef.current;
    if (!view) return;

    if (!favoritesLayerRef.current) {
      favoritesLayerRef.current = new GraphicsLayer({ title: 'Favorite Places' });
      view.map?.add(favoritesLayerRef.current);
    }

    const layer = favoritesLayerRef.current;
    layer.removeAll();

    favorites.forEach((fav) => {
      const graphic = new Graphic({
        geometry: new Point({
          latitude: fav.latitude,
          longitude: fav.longitude
        }),
        symbol: new SimpleMarkerSymbol({
          style: 'diamond',
          color: [123, 31, 162, 0.95],
          size: '14px',
          outline: { color: [255, 255, 255], width: 2 }
        }),
        attributes: {
          favoriteId: fav.id,
          name: fav.name
        },
        popupTemplate: {
          title: fav.name || 'Favorite place',
          content: `Lat: ${fav.latitude.toFixed(5)}, Lon: ${fav.longitude.toFixed(5)}`
        }
      });
      layer.add(graphic);
    });
  }, [favorites, viewReady]);

  // Refresh incidents when parent requests
  useEffect(() => {
    if (!viewReady) return;
    loadIncidents();
  }, [refreshIncidentsTick, viewReady]);

  return <div className="map-container" ref={mapDiv} style={{ height: '100%', width: '100%' }} />;
};

export default MapComponent;
