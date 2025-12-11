import { useState, useEffect, useCallback, useMemo } from 'react';
import { Spinner, Container, Button, Card, Badge, Alert } from 'react-bootstrap';
import MapComponent from './components/MapComponent';
import AuthForm from './components/AuthForm';
import NavbarComponent from './components/Navbar';
import EventModal from './components/EventModal';
import RoutePlannerModal from './components/RoutePlannerModal';
import type { LatLng } from './services/routingService';
import { authService } from './services/authService';
import { calculateRoute, type TravelProfile, type RouteResult } from './services/routingService';
import { routesService, type RouteLogResponse, type RouteOptionsResponse } from './services/routesService';
import type { MarkerData } from './services/eventsService';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [showEventModal, setShowEventModal] = useState(false);
  const [clickedCoords, setClickedCoords] = useState<LatLng | null>(null);

  const [showRouteModal, setShowRouteModal] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<'start' | 'end' | null>(null);
  const [routeStart, setRouteStart] = useState<LatLng | null>(null);
  const [routeEnd, setRouteEnd] = useState<LatLng | null>(null);
  const [incidents, setIncidents] = useState<MarkerData[]>([]);
  const [activeRoute, setActiveRoute] = useState<RouteResult | null>(null);
  const [routeMode, setRouteMode] = useState<TravelProfile>('car');
  const [routeAvoidTypes, setRouteAvoidTypes] = useState<string[]>([]);
  const [routeOptions, setRouteOptions] = useState<RouteOptionsResponse | null>(null);
  const [routeEvaluation, setRouteEvaluation] = useState<RouteLogResponse | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distanceText: string; timeText: string } | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');

  useEffect(() => {
    const checkAuth = async () => {
      const token = authService.getStoredToken();
      const storedUser = authService.getStoredUser();
      
      if (token && storedUser) {
        const isValid = await authService.verifyToken();
        if (isValid) {
          setIsAuthenticated(true);
          setUser(storedUser);
        } else {
          authService.clearAuth();
        }
      }
      setLoading(false);
    };

    checkAuth();
  }, []);

  useEffect(() => {
    const loadRouteOptions = async () => {
      if (!isAuthenticated) return;
      try {
        const options = await routesService.getOptions();
        setRouteOptions(options);
      } catch (err) {
        console.error('Unable to load route options', err);
      }
    };
    loadRouteOptions();
  }, [isAuthenticated]);

  useEffect(() => {
    if (routeOptions && routeAvoidTypes.length === 0 && routeOptions.default_avoid_types?.length) {
      setRouteAvoidTypes(routeOptions.default_avoid_types);
    }
  }, [routeOptions, routeAvoidTypes.length]);

  const handleAuthSuccess = (_token: string, userData: any) => {
    setIsAuthenticated(true);
    setUser(userData);
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      authService.clearAuth();
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  const handleMapClick = useCallback(
    (coords: LatLng) => {
      if (pendingSelection) {
        if (pendingSelection === 'start') {
          setRouteStart(coords);
        } else {
          setRouteEnd(coords);
        }
        setPendingSelection(null);
        setRouteError('');
        setShowRouteModal(true);
        return;
      }
      setClickedCoords(coords);
      setShowEventModal(true);
    },
    [pendingSelection]
  );

  const handleEventCreated = (event: any) => {
    console.log('Event created:', event);
  };

  const availableIncidentTypes = useMemo(() => {
    const types = new Set<string>();
    incidents.forEach((i) => types.add(i.type));
    routeOptions?.available_event_types.forEach((t) => types.add(t));
    return Array.from(types).sort();
  }, [incidents, routeOptions]);

  const handlePlanRoute = async ({ mode, avoidTypes }: { mode: TravelProfile; avoidTypes: string[] }) => {
    if (!routeStart || !routeEnd) {
      setRouteError('Select start and destination on the map.');
      return;
    }

    setRouteLoading(true);
    setRouteError('');
    setRouteEvaluation(null);

    try {
      const result = await calculateRoute(
        {
          start: routeStart,
          end: routeEnd,
          mode,
          avoidTypes
        },
        incidents
      );
      setActiveRoute(result);
      setRouteMode(mode);
      setRouteAvoidTypes(avoidTypes);
      setRouteInfo({ distanceText: result.distanceText, timeText: result.timeText });
      try {
        const evaluation = await routesService.logRoute({
          start: routeStart,
          end: routeEnd,
          mode,
          avoid_types: avoidTypes,
          polyline: result.geometryWgs84Json
        });
        setRouteEvaluation(evaluation);
      } catch (logErr) {
        console.error('Failed to log route in backend', logErr);
      }
      setShowRouteModal(false);
    } catch (err: any) {
      console.error('Route error', err);
      setRouteError(err?.message || 'Failed to calculate route');
    } finally {
      setRouteLoading(false);
    }
  };

  const clearRoute = () => {
    setActiveRoute(null);
    setRouteInfo(null);
    setRouteEvaluation(null);
  };

  if (loading) {
    return (
      <Container fluid className="min-vh-100 d-flex align-items-center justify-content-center">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </Container>
    );
  }

  if (!isAuthenticated) {
    return <AuthForm onAuthSuccess={handleAuthSuccess} />;
  }

  return (
    <div className="App">
      <NavbarComponent user={user} onLogout={handleLogout} />
      <div style={{ marginTop: '56px', height: 'calc(100vh - 56px)', position: 'relative' }}>
        <MapComponent
          onMapClick={handleMapClick}
          onIncidentsLoaded={setIncidents}
          activeRoute={activeRoute?.geometry ?? null}
          routeStops={{
            start: routeStart || undefined,
            end: routeEnd || undefined
          }}
          forcePointSelection={!!pendingSelection}
        />

        <div className="position-absolute top-0 end-0 m-3 d-flex flex-column align-items-end gap-2" style={{ zIndex: 1000 }}>
          <Button variant="primary" onClick={() => setShowRouteModal(true)}>
            New Route
          </Button>
          {pendingSelection && (
            <Alert variant="info" className="py-2 px-3 mb-0">
              Click on the map to set {pendingSelection === 'start' ? 'start' : 'destination'}. You can tap incidents too while picking.
            </Alert>
          )}
        </div>

        {routeError && !showRouteModal && (
          <div className="position-absolute bottom-0 start-0 m-3" style={{ zIndex: 1000 }}>
            <Alert variant="danger" className="mb-0">
              {routeError}
            </Alert>
          </div>
        )}

        {activeRoute && routeInfo && (
          <div className="position-absolute top-0 end-0 m-3" style={{ zIndex: 1000, minWidth: '260px' }}>
            <Card>
              <Card.Body>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <div className="fw-semibold">Active Route</div>
                  <Badge bg="secondary" className="text-uppercase">{routeMode}</Badge>
                </div>
                <div className="d-flex justify-content-between">
                  <span>Distance</span>
                  <span className="fw-semibold">{routeInfo.distanceText}</span>
                </div>
                <div className="d-flex justify-content-between">
                  <span>ETA</span>
                  <span className="fw-semibold">{routeInfo.timeText}</span>
                </div>
                {routeEvaluation && (
                  <>
                    <div className="d-flex justify-content-between align-items-center mt-2">
                      <span>Safety</span>
                      <Badge
                        bg={
                          routeEvaluation.score >= 80
                            ? 'success'
                            : routeEvaluation.score >= 60
                              ? 'warning'
                              : 'danger'
                        }
                      >
                        {routeEvaluation.score}/100
                      </Badge>
                    </div>
                    {routeEvaluation.impacts.length > 0 ? (
                      <div className="mt-2">
                        <small className="text-muted">Nearby incidents impacting this path</small>
                        <ul className="small mb-0 ps-3">
                          {routeEvaluation.impacts.slice(0, 3).map((impact) => (
                            <li key={impact.event_id}>
                              {impact.type} (sev {impact.severity}) • {impact.distance_km} km away • impact {impact.impact_score}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="mt-2">
                        <small className="text-success">No incidents within the safety buffer.</small>
                      </div>
                    )}
                  </>
                )}
                {routeAvoidTypes.length > 0 && (
                  <div className="mt-2">
                    <small className="text-muted">Avoiding</small>
                    <div className="d-flex flex-wrap gap-1 mt-1">
                      {routeAvoidTypes.map((t) => (
                        <Badge bg="light" text="dark" key={t}>
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="d-flex justify-content-end mt-3">
                  <Button size="sm" variant="outline-danger" onClick={clearRoute}>
                    Close route
                  </Button>
                </div>
              </Card.Body>
            </Card>
          </div>
        )}
      </div>

      <EventModal
        show={showEventModal}
        latitude={clickedCoords?.latitude ?? null}
        longitude={clickedCoords?.longitude ?? null}
        onClose={() => setShowEventModal(false)}
        onCreated={handleEventCreated}
      />

      <RoutePlannerModal
        show={showRouteModal}
        start={routeStart}
        end={routeEnd}
        availableTypes={availableIncidentTypes}
        initialMode={routeMode}
        initialAvoidTypes={routeAvoidTypes}
        loading={routeLoading}
        error={routeError}
        onClose={() => {
          setShowRouteModal(false);
          setPendingSelection(null);
        }}
        onPickPoint={(target) => {
          setPendingSelection(target);
          setShowRouteModal(false);
        }}
        onSubmit={handlePlanRoute}
      />
    </div>
  );
}

export default App;
