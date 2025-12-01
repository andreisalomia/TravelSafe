import { useEffect, useRef } from 'react';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import esriConfig from '@arcgis/core/config';

import '@arcgis/core/assets/esri/themes/light/main.css';

const MapComponent = () => {
  const mapDiv = useRef<HTMLDivElement>(null);

  useEffect(() => {
  esriConfig.apiKey = import.meta.env.VITE_ARCGIS_API_KEY as string;

  if (mapDiv.current) {
    const map = new Map({
      basemap: "streets-navigation-vector"
    });

      const view = new MapView({
        container: mapDiv.current,
        map: map,
        center: [26.1025, 44.4268],
        zoom: 13
      });

      return () => {
        if (view) {
          view.destroy();
        }
      };
    }
  }, []);

  return <div className="map-container" ref={mapDiv} style={{ height: '100vh', width: '100%' }}></div>;
};

export default MapComponent; 