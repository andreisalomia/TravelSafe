import { useState, useEffect, useCallback, useMemo } from 'react';
import { Spinner, Container, Button, Card, Badge, Alert } from 'react-bootstrap';
import MapComponent from './components/MapComponent';
import AuthForm from './components/AuthForm';
import NavbarComponent from './components/Navbar';
import EventModal from './components/EventModal';
import RoutePlannerModal from './components/RoutePlannerModal';
import FavoritesModal from './components/FavoritesModal';
import NotificationsModal from './components/NotificationsModal';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import type { LatLng } from './services/routingService';
import { authService } from './services/authService';
import { calculateRoute, type TravelProfile, type RouteResult } from './services/routingService';
import { routesService, type RouteLogResponse, type RouteOptionsResponse } from './services/routesService';
import { favoritesService, type FavoritePlace } from './services/favoritesService';
import { notificationsService, type NotificationItem } from './services/notificationsService';
import type { MarkerData } from './services/eventsService';
import ProfileModal from './components/ProfileModel';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [showEventModal, setShowEventModal] = useState(false);
  const [clickedCoords, setClickedCoords] = useState<LatLng | null>(null);
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);
  const [favorites, setFavorites] = useState<FavoritePlace[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [favoritesSaving, setFavoritesSaving] = useState(false);
  const [favoritesError, setFavoritesError] = useState('');
  const [pendingFavoriteSelection, setPendingFavoriteSelection] = useState(false);
  const [favoritePickedCoords, setFavoritePickedCoords] = useState<LatLng | null>(null);
  const [incidentsRefreshTick, setIncidentsRefreshTick] = useState(0);
  const isAdmin = user?.role === 'admin';
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [, setSeenNotificationIds] = useState<Set<number>>(new Set());

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
  const [showProfileModal, setShowProfileModal] = useState(false);

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
    const loadFavorites = async () => {
      if (!isAuthenticated) {
        setFavorites([]);
        setNotifications([]);
        setSeenNotificationIds(new Set());
        return;
      }
      setFavoritesLoading(true);
      setFavoritesError('');
      try {
        const items = await favoritesService.list();
        setFavorites(items);
      } catch (err: any) {
        console.error('Unable to load favorites', err);
        setFavoritesError(err?.response?.data?.message || 'Unable to load favorites');
      } finally {
        setFavoritesLoading(false);
      }
    };

    loadFavorites();
  }, [isAuthenticated]);

  useEffect(() => {
    if (routeOptions && routeAvoidTypes.length === 0 && routeOptions.default_avoid_types?.length) {
      setRouteAvoidTypes(routeOptions.default_avoid_types);
    }
  }, [routeOptions, routeAvoidTypes.length]);

  const fetchNotifications = useCallback(async () => {
    try {
      const items = await notificationsService.list();
      setNotifications(items);

      const newOnes: NotificationItem[] = [];
      setSeenNotificationIds((prev) => {
        const updated = new Set(prev);
        for (const n of items) {
          if (!n.is_read && !prev.has(n.id)) {
            newOnes.push(n);
          }
          updated.add(n.id);
        }
        return updated;
      });

      for (const n of newOnes) {
        toast.info(
          <div>
            <strong>{n.title}</strong>
            <div className="small">{n.message}</div>
          </div>,
          {
            toastId: n.id,
            autoClose: 8000,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
            progress: undefined
          }
        );
        try {
          await notificationsService.markRead(n.id);
          setNotifications((prev) =>
            prev.map((item) => (item.id === n.id ? { ...item, is_read: true } : item))
          );
        } catch (err) {
          console.error('Failed to mark notification read', err);
        }
      }
    } catch (err) {
      console.error('Unable to load notifications', err);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchNotifications();
  }, [fetchNotifications, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated && showNotificationsModal) {
      fetchNotifications();
    }
  }, [fetchNotifications, isAuthenticated, showNotificationsModal]);


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
      setFavorites([]);
      setShowFavoritesModal(false);
      setPendingFavoriteSelection(false);
      setFavoritePickedCoords(null);
    }
  };

  const handleFavoriteAdd = async (payload: { name: string; latitude: number; longitude: number }) => {
    setFavoritesSaving(true);
    setFavoritesError('');
    try {
      const favorite = await favoritesService.create(payload);
      setFavorites((prev) => [favorite, ...prev]);
    } catch (err: any) {
      setFavoritesError(err?.response?.data?.message || 'Unable to save favorite');
      throw err;
    } finally {
      setFavoritesSaving(false);
    }
  };

  const handleFavoriteDelete = async (favoriteId: number) => {
    setFavoritesSaving(true);
    setFavoritesError('');
    try {
      await favoritesService.remove(favoriteId);
      setFavorites((prev) => prev.filter((fav) => fav.id !== favoriteId));
    } catch (err: any) {
      setFavoritesError(err?.response?.data?.message || 'Unable to delete favorite');
    } finally {
      setFavoritesSaving(false);
    }
  };

  const applyFavoriteToRoute = (favorite: FavoritePlace, target: 'start' | 'end') => {
    const coords = { latitude: favorite.latitude, longitude: favorite.longitude };
    if (target === 'start') {
      setRouteStart(coords);
    } else {
      setRouteEnd(coords);
    }
    setPendingSelection(null);
    setRouteError('');
  };

  const handleFavoriteClick = (favorite: FavoritePlace) => {
    if (pendingSelection) {
      applyFavoriteToRoute(favorite, pendingSelection);
      return;
    }

    // Only set points; do not force open the route modal.
    if (!routeStart || (routeStart && routeEnd)) {
      applyFavoriteToRoute(favorite, 'start');
    } else {
      applyFavoriteToRoute(favorite, 'end');
    }
  };

  const handleIncidentDeleted = (id: number) => {
    setIncidents((prev) => prev.filter((inc) => inc.id !== id));
  };

  const handleDeleteNotification = async (id: number) => {
    try {
      await notificationsService.remove(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error('Failed to delete notification', err);
    }
  };

  const startFavoriteMapPick = () => {
    setFavoritesError('');
    setPendingFavoriteSelection(true);
    setShowFavoritesModal(false);
  };

  const handleMapClick = useCallback(
    (coords: LatLng) => {
      if (pendingFavoriteSelection) {
        setFavoritePickedCoords(coords);
        setPendingFavoriteSelection(false);
        setShowFavoritesModal(true);
        return;
      }
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
    [pendingFavoriteSelection, pendingSelection]
  );

  const handleEventCreated = (_event: any) => {
    // Fire a toast immediately if this incident is near one of the user's favorites.
    const NEARBY_FAV_KM = 0.5; // keep in sync with backend NEARBY_FAVORITE_DISTANCE_KM
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const haversineKm = (a: LatLng, b: LatLng) => {
      const R = 6371;
      const dLat = toRad(b.latitude - a.latitude);
      const dLon = toRad(b.longitude - a.longitude);
      const lat1 = toRad(a.latitude);
      const lat2 = toRad(b.latitude);
      const sinDLat = Math.sin(dLat / 2);
      const sinDLon = Math.sin(dLon / 2);
      const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
      return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    };

    favorites.forEach((fav) => {
      const dist = haversineKm(
        { latitude: _event.latitude, longitude: _event.longitude },
        { latitude: fav.latitude, longitude: fav.longitude }
      );
      if (dist <= NEARBY_FAV_KM) {
        toast.info(
          <div>
            <strong>Incident nearby</strong>
            <div className="small">
              {`New ${_event.type} near "${fav.name || 'favorite place'}" (${dist.toFixed(2)} km)`}
            </div>
          </div>,
          {
            autoClose: 8000,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true
          }
        );
      }
    });

    setIncidentsRefreshTick((v) => v + 1);
    fetchNotifications();
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
      // Enhanced error logging for debugging
      console.error('Route error details:', {
        message: err?.message,
        name: err?.name,
        details: err?.details,
        stack: err?.stack,
        fullError: err
      });
      setRouteError(err?.message || err?.details?.messages?.join(', ') || 'Failed to calculate route');
    } finally {
      setRouteLoading(false);
    }
  };

  const clearRoute = () => {
    setActiveRoute(null);
    setRouteInfo(null);
    setRouteEvaluation(null);
  };

  const refreshUserData = async () => {
    try {
      const userData = await authService.getCurrentUser();
      setUser(userData);
    } catch (err) {
      console.error("Failed to refresh user data", err);
    }
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
      <ToastContainer
        position="bottom-right"
        newestOnTop
        autoClose={8000}
        closeOnClick
        pauseOnHover
        draggable
        hideProgressBar={false}
        style={{ zIndex: 11000 }}
      />
      <NavbarComponent
        user={user}
        onLogout={handleLogout}
        onOpenFavorites={() => {
          setFavoritesError('');
          setPendingFavoriteSelection(false);
          setShowFavoritesModal(true);
        }}
        onOpenNotifications={() => {
          setShowNotificationsModal(true);
        }}
        onOpenProfile={() => {
          refreshUserData();
          setShowProfileModal(true);
        }}
      />
      <div style={{ marginTop: '56px', height: 'calc(100vh - 56px)', position: 'relative' }}>
        <MapComponent
          onMapClick={handleMapClick}
          onIncidentsLoaded={setIncidents}
          onFavoriteClick={handleFavoriteClick}
          onIncidentDeleted={handleIncidentDeleted}
          favorites={favorites}
          canDeleteIncidents={isAdmin}
          refreshIncidentsTick={incidentsRefreshTick}
          // FIX: Use geometryWgs84Json instead of geometry to ensure proper serialization through React state
          activeRoute={activeRoute?.geometryWgs84Json ?? null}
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

      <ProfileModal
        show={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        user={user}
      />

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
        favorites={favorites}
        onClose={() => {
          setShowRouteModal(false);
          setPendingSelection(null);
        }}
        onPickPoint={(target) => {
          setPendingSelection(target);
          setShowRouteModal(false);
        }}
        onSelectFavorite={(target, favorite) => applyFavoriteToRoute(favorite, target)}
        onSubmit={handlePlanRoute}
      />

      <FavoritesModal
        show={showFavoritesModal}
        favorites={favorites}
        loading={favoritesLoading}
        saving={favoritesSaving}
        error={favoritesError}
        start={routeStart}
        end={routeEnd}
        pickedCoords={favoritePickedCoords}
        onPickOnMap={startFavoriteMapPick}
        onClose={() => {
          setShowFavoritesModal(false);
          setFavoritesError('');
        }}
        onAdd={handleFavoriteAdd}
        onDelete={handleFavoriteDelete}
        onUse={(favorite, target) => applyFavoriteToRoute(favorite, target)}
      />

      <NotificationsModal
        show={showNotificationsModal}
        notifications={notifications}
        onClose={() => setShowNotificationsModal(false)}
        onDelete={handleDeleteNotification}
      />
    </div>
  );
}

export default App;
