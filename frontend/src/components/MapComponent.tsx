import { useEffect, useRef } from 'react';
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

import { getMapData, type MarkerData } from '../services/eventsService';

import '@arcgis/core/assets/esri/themes/light/main.css';

interface MapComponentProps {
  onMapClick?: (coords: { latitude: number; longitude: number }) => void;
  onIncidentsLoaded?: (markers: MarkerData[]) => void;
  activeRoute?: Polyline | null;
  routeStops?: { start?: { latitude: number; longitude: number }; end?: { latitude: number; longitude: number } };
  forcePointSelection?: boolean;
}

const MapComponent = ({
  onMapClick,
  onIncidentsLoaded,
  activeRoute,
  routeStops,
  forcePointSelection = false
}: MapComponentProps) => {
  const mapDiv = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<MapView | null>(null);
  const layersLoadedRef = useRef<boolean>(false);
  const routeLayerRef = useRef<GraphicsLayer | null>(null);
  const routeStopsLayerRef = useRef<GraphicsLayer | null>(null);
  const clickHandlerRef = useRef<typeof onMapClick | undefined>(undefined);
  const incidentsHandlerRef = useRef<typeof onIncidentsLoaded | undefined>(undefined);

  useEffect(() => {
    clickHandlerRef.current = onMapClick;
  }, [onMapClick]);

  useEffect(() => {
    incidentsHandlerRef.current = onIncidentsLoaded;
  }, [onIncidentsLoaded]);

  // --- CONFIGURARE CULORI ---
  const getSeverityColor = (severity: number): number[] => {
    if (severity >= 5) return [255, 0, 0, 0.9];
    if (severity === 4) return [255, 165, 0, 0.9];
    if (severity === 3) return [255, 255, 0, 0.9];
    if (severity === 2) return [173, 255, 47, 0.9];
    return [0, 255, 0, 0.9];
  };

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
      if (layersLoadedRef.current) return;
      const data = await getMapData();

      if (!data || !data.markers) {
        console.warn('No map data received from backend.');
        return;
      }

      incidentsHandlerRef.current?.(data.markers);

      const graphicsLayer = new GraphicsLayer({ title: 'Markere Incidente' });

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

      map.add(graphicsLayer);

      const heatmapGraphics = data.markers.map((marker, index) => {
        return new Graphic({
          geometry: new Point({ longitude: marker.lng, latitude: marker.lat }),
          attributes: {
            ObjectID: index,
            severity_val: marker.severity
          }
        });
      });

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

      map.add(heatmapLayer, 0);
      layersLoadedRef.current = true;

      view.on('click', async (event) => {
        const response = await view.hitTest(event);
        const hitMarker = response.results.find((result: any) => {
          return (
            result.graphic &&
            result.graphic.layer &&
            result.graphic.layer.title === 'Markere Incidente'
          );
        });

        // During point picking we should not block selection even if a marker is hit.
        if (hitMarker && !forcePointSelection) {
          return;
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

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !view.map) return;

    if (!routeLayerRef.current) {
      routeLayerRef.current = new GraphicsLayer({ title: 'Active Route' });
      view.map.add(routeLayerRef.current);
    }
    if (!routeStopsLayerRef.current) {
      routeStopsLayerRef.current = new GraphicsLayer({ title: 'Route Stops' });
      view.map.add(routeStopsLayerRef.current);
    }

    const routeLayer = routeLayerRef.current;
    const stopsLayer = routeStopsLayerRef.current;
    routeLayer.removeAll();
    stopsLayer.removeAll();

    if (!activeRoute) {
      return;
    }

    const geometry =
      activeRoute instanceof Polyline ? activeRoute : new Polyline(activeRoute as any);

    if (!geometry || !geometry.paths?.length) {
      return;
    }

    const routeGraphic = new Graphic({
      geometry,
      symbol: new SimpleLineSymbol({
        color: [64, 99, 255, 0.85],
        width: 4
      })
    });
    routeLayer.add(routeGraphic);

    if (routeStops?.start) {
      stopsLayer.add(
        new Graphic({
          geometry: new Point({
            latitude: routeStops.start.latitude,
            longitude: routeStops.start.longitude
          }),
          symbol: new SimpleMarkerSymbol({
            color: [46, 204, 113, 0.95],
            size: '12px',
            outline: { color: [255, 255, 255], width: 1.5 }
          }),
          attributes: { name: 'Start' },
          popupTemplate: { title: 'Start' }
        })
      );
    }

    if (routeStops?.end) {
      stopsLayer.add(
        new Graphic({
          geometry: new Point({
            latitude: routeStops.end.latitude,
            longitude: routeStops.end.longitude
          }),
          symbol: new SimpleMarkerSymbol({
            color: [231, 76, 60, 0.95],
            size: '12px',
            outline: { color: [255, 255, 255], width: 1.5 }
          }),
          attributes: { name: 'Destination' },
          popupTemplate: { title: 'Destination' }
        })
      );
    }

    view
      .goTo(
        {
          target: [routeGraphic, ...stopsLayer.graphics.toArray()],
          padding: { top: 40, bottom: 40, left: 40, right: 40 }
        },
        { duration: 400 }
      )
      .catch(() => {});
  }, [activeRoute, routeStops]);

  return <div className="map-container" ref={mapDiv} style={{ height: '100%', width: '100%' }} />;
};

export default MapComponent;
