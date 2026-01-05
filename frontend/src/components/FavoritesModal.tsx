import { useEffect, useMemo, useState } from 'react';
import { Modal, Button, Form, ListGroup, Stack, Alert, Badge, Spinner } from 'react-bootstrap';
import type { FavoritePlace } from '../services/favoritesService';
import type { LatLng } from '../services/routingService';

interface FavoritesModalProps {
  show: boolean;
  favorites: FavoritePlace[];
  loading?: boolean;
  saving?: boolean;
  error?: string;
  start?: LatLng | null;
  end?: LatLng | null;
  pickedCoords?: LatLng | null;
  onClose: () => void;
  onAdd: (payload: { name: string; latitude: number; longitude: number }) => Promise<void> | void;
  onDelete: (id: number) => Promise<void> | void;
  onUse: (favorite: FavoritePlace, target: 'start' | 'end') => void;
  onPickOnMap: () => void;
}

const formatCoords = (coords: { latitude: number; longitude: number }) =>
  `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;

const FavoritesModal = ({
  show,
  favorites,
  loading = false,
  saving = false,
  error,
  start,
  end,
  pickedCoords,
  onClose,
  onAdd,
  onDelete,
  onUse,
  onPickOnMap
}: FavoritesModalProps) => {
  const [name, setName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [localError, setLocalError] = useState('');

  const defaultCoords = useMemo(() => pickedCoords || start || end, [pickedCoords, start, end]);

  useEffect(() => {
    if (show) {
      setLocalError('');
      setName('');
      if (defaultCoords) {
        setLatitude(defaultCoords.latitude.toString());
        setLongitude(defaultCoords.longitude.toString());
      } else {
        setLatitude('');
        setLongitude('');
      }
    }
  }, [show, defaultCoords]);

  const applyCoords = (coords: LatLng | null | undefined) => {
    if (!coords) return;
    setLatitude(coords.latitude.toString());
    setLongitude(coords.longitude.toString());
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (!name.trim()) {
      setLocalError('Please provide a name for this place.');
      return;
    }

    const lat = Number(latitude);
    const lng = Number(longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setLocalError('Latitude and longitude must be valid numbers.');
      return;
    }

    try {
      await onAdd({
        name: name.trim(),
        latitude: lat,
        longitude: lng
      });
      setName('');
    } catch {
      // Parent handler already surfaces API errors through `error`
    }
  };

  return (
    <Modal show={show} onHide={onClose} centered size="lg">
      <Form onSubmit={handleAdd}>
        <Modal.Header closeButton>
          <Modal.Title>Favorite Places</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {(error || localError) && (
            <Alert variant="danger" className="mb-3" onClose={() => setLocalError('')} dismissible={!!localError}>
              {localError || error}
            </Alert>
          )}

          <div className="mb-3">
            <div className="fw-semibold mb-2">Add a new place</div>
            <div className="d-flex gap-3 flex-wrap">
              <Form.Group controlId="favoriteName" className="flex-grow-1" style={{ minWidth: '200px' }}>
                <Form.Label>Name</Form.Label>
                <Form.Control
                  type="text"
                  placeholder="Home, Office, Gym..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={100}
                  disabled={saving}
                  required
                />
              </Form.Group>
              <Form.Group controlId="favoriteLat" style={{ minWidth: '180px' }}>
                <Form.Label>Latitude</Form.Label>
                <Form.Control
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  disabled={saving}
                  required
                />
              </Form.Group>
              <Form.Group controlId="favoriteLng" style={{ minWidth: '180px' }}>
                <Form.Label>Longitude</Form.Label>
                <Form.Control
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  disabled={saving}
                  required
                />
              </Form.Group>
            </div>
            <div className="d-flex flex-wrap gap-2 mt-2">
              <Button
                size="sm"
                variant="outline-secondary"
                onClick={() => applyCoords(start)}
                disabled={saving || !start}
              >
                Use start point
              </Button>
              <Button
                size="sm"
                variant="outline-secondary"
                onClick={() => applyCoords(end)}
                disabled={saving || !end}
              >
                Use destination
              </Button>
              <Button
                size="sm"
                variant="outline-secondary"
                onClick={onPickOnMap}
                disabled={saving}
              >
                Pick on map
              </Button>
              {defaultCoords && (
                <Badge bg="light" text="dark" className="align-self-center">
                  Prefilled: {formatCoords(defaultCoords)}
                </Badge>
              )}
            </div>
            <div className="mt-3 d-flex justify-content-end">
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-2" />
                    Saving...
                  </>
                ) : (
                  'Add favorite'
                )}
              </Button>
            </div>
          </div>

          <div>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div className="fw-semibold">Saved places</div>
              {loading && (
                <div className="d-flex align-items-center gap-2">
                  <Spinner animation="border" size="sm" />
                  <span className="small text-muted">Loading</span>
                </div>
              )}
            </div>
            {favorites.length === 0 ? (
              <div className="text-muted small">
                No favorites yet. Add a place to quickly set it as start or destination when planning a route.
              </div>
            ) : (
              <ListGroup>
                {favorites.map((fav) => (
                  <ListGroup.Item
                    key={fav.id}
                    className="d-flex justify-content-between align-items-center flex-wrap gap-2"
                  >
                    <div>
                      <div className="fw-semibold">{fav.name || 'Favorite place'}</div>
                      <div className="text-muted small">{formatCoords(fav)}</div>
                    </div>
                    <Stack direction="horizontal" gap={2} className="ms-auto">
                      <Button
                        size="sm"
                        variant="outline-primary"
                        onClick={() => onUse(fav, 'start')}
                        disabled={saving}
                      >
                        Set start
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-primary"
                        onClick={() => onUse(fav, 'end')}
                        disabled={saving}
                      >
                        Set destination
                      </Button>
                      <Button
                        size="sm"
                        variant="outline-danger"
                        onClick={() => onDelete(fav.id)}
                        disabled={saving}
                      >
                        Delete
                      </Button>
                    </Stack>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Close
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default FavoritesModal;
