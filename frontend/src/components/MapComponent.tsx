import { useEffect, useRef } from 'react';
import Map from '@arcgis/core/Map';
import MapView from '@arcgis/core/views/MapView';
import esriConfig from '@arcgis/core/config';

import '@arcgis/core/assets/esri/themes/light/main.css';

interface MapComponentProps {
  onMapClick?: (coords: { latitude: number; longitude: number }) => void;
}

const MapComponent = ({ onMapClick }: MapComponentProps) => {
  const mapDiv = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<MapView | null>(null);
  const clickHandleRef = useRef<any>(null);

  // Initialize map/view once
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
      zoom: 13
    });

    viewRef.current = view;

    return () => {
      // cleanup on unmount only
      if (clickHandleRef.current) {
        clickHandleRef.current.remove();
        clickHandleRef.current = null;
      }
      if (viewRef.current) {
        viewRef.current.destroy();
        viewRef.current = null;
      }
    };
  }, []); // empty deps -> init once

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    // remove previous handler if present
    if (clickHandleRef.current) {
      clickHandleRef.current.remove();
      clickHandleRef.current = null;
    }

    if (onMapClick) {
      const handler = (evt: any) => {
        if (evt.mapPoint) {
          onMapClick({
            latitude: evt.mapPoint.latitude,
            longitude: evt.mapPoint.longitude
          });
        }
      };
      clickHandleRef.current = view.on('click', handler);
    }

    // cleanup only the click handler when onMapClick changes/unmount
    return () => {
      if (clickHandleRef.current) {
        clickHandleRef.current.remove();
        clickHandleRef.current = null;
      }
    };
  }, [onMapClick]);

  return <div className="map-container" ref={mapDiv} style={{ height: '100%', width: '100%' }} />;
};

export default MapComponent;