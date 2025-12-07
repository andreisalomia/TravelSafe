import { useState, useEffect, useCallback } from 'react';
import MapComponent from './components/MapComponent';
import AuthForm from './components/AuthForm';
import NavbarComponent from './components/Navbar';
import EventModal from './components/EventModal';
import { authService } from './services/authService';
import { Spinner, Container } from 'react-bootstrap';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [showEventModal, setShowEventModal] = useState(false);
  const [clickedCoords, setClickedCoords] = useState<{ latitude: number; longitude: number } | null>(null);

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

  // new handler: called by MapComponent when the map is clicked
  const handleMapClick = useCallback((coords: { latitude: number; longitude: number }) => {
    setClickedCoords(coords);
    setShowEventModal(true);
  }, []); // stable identity

  const handleEventCreated = (event: any) => {
    console.log('Event created:', event);
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
      <div style={{ marginTop: '56px', height: 'calc(100vh - 56px)' }}>
        <MapComponent onMapClick={handleMapClick} />
      </div>

      <EventModal
        show={showEventModal}
        latitude={clickedCoords?.latitude ?? null}
        longitude={clickedCoords?.longitude ?? null}
        onClose={() => setShowEventModal(false)}
        onCreated={handleEventCreated}
      />
    </div>
  );
}

export default App;