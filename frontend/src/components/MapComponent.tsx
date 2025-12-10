import { useEffect, useRef } from 'react';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import esriConfig from '@arcgis/core/config';
import Graphic from '@arcgis/core/Graphic';
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer';
import FeatureLayer from '@arcgis/core/layers/FeatureLayer';
import Point from '@arcgis/core/geometry/Point';
import SimpleMarkerSymbol from '@arcgis/core/symbols/SimpleMarkerSymbol';
import HeatmapRenderer from '@arcgis/core/renderers/HeatmapRenderer';

// IMPORȚI: Folosim serviciul centralizat, nu axios direct
import { getMapData } from '../services/eventsService';

import '@arcgis/core/assets/esri/themes/light/main.css';

interface MapComponentProps {
  onMapClick?: (coords: { latitude: number; longitude: number }) => void;
}

const MapComponent = ({ onMapClick }: MapComponentProps) => {
  const mapDiv = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<MapView | null>(null);
  const layersLoadedRef = useRef<boolean>(false);

  // --- CONFIGURARE CULORI ---
  const getSeverityColor = (severity: number): number[] => {
    if (severity >= 5) return [255, 0, 0, 0.9];       // Roșu
    if (severity === 4) return [255, 165, 0, 0.9];    // Portocaliu
    if (severity === 3) return [255, 255, 0, 0.9];    // Galben
    if (severity === 2) return [173, 255, 47, 0.9];   // Verde-Gălbui
    return [0, 255, 0, 0.9];                          // Verde
  };

  useEffect(() => {
    // 1. Configurare API Key
    esriConfig.apiKey = import.meta.env.VITE_ARCGIS_API_KEY as string;

    if (!mapDiv.current) return;

    // 2. Inițializare Map și View
    const map = new Map({
      basemap: 'streets-navigation-vector' 
    });

    const view = new MapView({
      container: mapDiv.current,
      map: map,
      center: [26.1025, 44.4268], // București
      zoom: 12
    });

    viewRef.current = view;

    // 3. Încărcare date
    view.when(async () => {
      if (layersLoadedRef.current) return;
      
      console.log("🗺️ Harta ArcGIS inițializată. Cerem datele via eventsService...");

      // --- MODIFICARE: Folosim funcția getMapData care are URL-ul corect (/api/events/...) ---
      const data = await getMapData();

      if (!data || !data.markers) {
          console.warn("⚠️ Nu s-au primit date valide sau serverul este oprit.");
          return;
      }

      console.log(`✅ Date primite: ${data.markers.length} incidente.`);

      // --- A. Strat MARKERE (GraphicsLayer) ---
      const graphicsLayer = new GraphicsLayer({ title: "Markere Incidente" });
      
      data.markers.forEach((marker) => {
        const point = new Point({
          longitude: marker.lng,
          latitude: marker.lat
        });

        const markerSymbol = new SimpleMarkerSymbol({
          color: getSeverityColor(marker.severity),
          outline: { color: [255, 255, 255], width: 1 },
          size: "12px"
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
            title: "{Tip}",
            content: "Severitate: {Severitate}/5<br>Descriere: {Descriere}"
          }
        });

        graphicsLayer.add(graphic);
      });

      map.add(graphicsLayer);

      // --- B. Strat HEATMAP ---
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
        objectIdField: "ObjectID",
        fields: [
          { name: "ObjectID", alias: "ObjectID", type: "oid" },
          { name: "severity_val", alias: "Severity Value", type: "integer" }
        ],
        renderer: new HeatmapRenderer({
          field: "severity_val",
          colorStops: [
            { ratio: 0, color: "rgba(0, 255, 0, 0)" },
            { ratio: 0.2, color: "rgba(0, 255, 0, 1)" },
            { ratio: 0.5, color: "rgba(255, 255, 0, 1)" },
            { ratio: 0.8, color: "rgba(255, 140, 0, 1)" },
            { ratio: 1, color: "rgba(255, 0, 0, 1)" }
          ],
          radius: 16
        }) as any
      });

      map.add(heatmapLayer, 0);
      layersLoadedRef.current = true;
      

      // --- C. LOGICA CLICK ---
      view.on("click", async (event) => {
        const response = await view.hitTest(event);
        const hitMarker = response.results.find((result: any) => {
           return result.graphic && 
                  result.graphic.layer && 
                  result.graphic.layer.title === "Markere Incidente";
        });

        if (hitMarker) {
          console.log("🎯 Click pe marker existent.");
        } else {
          console.log("📍 Click pe hartă goală.");
          if (onMapClick) {
            onMapClick({
              latitude: event.mapPoint.latitude,
              longitude: event.mapPoint.longitude
            });
          }
        }
      });

    }); // End view.when

    return () => {
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, [onMapClick]);

  return <div className="map-container" ref={mapDiv} style={{ height: '100%', width: '100%' }} />;
};

export default MapComponent;