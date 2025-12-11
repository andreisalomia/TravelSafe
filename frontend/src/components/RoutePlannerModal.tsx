import { useEffect, useMemo, useState } from 'react';
import { Modal, Form, Button, Badge, Alert, Row, Col } from 'react-bootstrap';
import type { LatLng, TravelProfile } from '../services/routingService';

interface RoutePlannerModalProps {
  show: boolean;
  start: LatLng | null;
  end: LatLng | null;
  availableTypes: string[];
  initialMode?: TravelProfile;
  initialAvoidTypes?: string[];
  loading?: boolean;
  error?: string;
  onClose: () => void;
  onPickPoint: (target: 'start' | 'end') => void;
  onSubmit: (plan: { mode: TravelProfile; avoidTypes: string[] }) => void;
}

const travelModeLabels: Record<TravelProfile, string> = {
  car: 'Car',
  bicycle: 'Bike',
  pedestrian: 'Pedestrian',
};

const RoutePlannerModal = ({
  show,
  start,
  end,
  availableTypes,
  initialMode = 'car',
  initialAvoidTypes = [],
  loading = false,
  error,
  onClose,
  onPickPoint,
  onSubmit,
}: RoutePlannerModalProps) => {
  const [mode, setMode] = useState<TravelProfile>(initialMode);
  const [selectedAvoid, setSelectedAvoid] = useState<string[]>(initialAvoidTypes);

  useEffect(() => {
    if (show) {
      setMode(initialMode);
      setSelectedAvoid(initialAvoidTypes);
    }
  }, [show, initialMode, initialAvoidTypes]);

  const toggleAvoid = (type: string) => {
    setSelectedAvoid((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ mode, avoidTypes: selectedAvoid });
  };

  const coordinateLabel = (coords: LatLng | null) =>
    coords ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}` : 'Not set';

  const sortedTypes = useMemo(() => [...availableTypes].sort(), [availableTypes]);

  return (
    <Modal show={show} onHide={onClose} centered>
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>Plan a Safe Route</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-semibold">Start</div>
                <div className="text-muted">{coordinateLabel(start)}</div>
              </div>
              <Button
                variant="outline-primary"
                size="sm"
                onClick={() => onPickPoint('start')}
                disabled={loading}
              >
                Pick on map
              </Button>
            </div>
          </div>
          <div className="mb-3">
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-semibold">Destination</div>
                <div className="text-muted">{coordinateLabel(end)}</div>
              </div>
              <Button
                variant="outline-primary"
                size="sm"
                onClick={() => onPickPoint('end')}
                disabled={loading}
              >
                Pick on map
              </Button>
            </div>
          </div>

          <Form.Group className="mb-3">
            <Form.Label>Travel mode</Form.Label>
            <div className="d-flex gap-2">
              {(['car', 'bicycle', 'pedestrian'] as TravelProfile[]).map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant={mode === value ? 'primary' : 'outline-secondary'}
                  onClick={() => setMode(value)}
                  disabled={loading}
                >
                  {travelModeLabels[value]}
                </Button>
              ))}
            </div>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Incidents to avoid</Form.Label>
            {sortedTypes.length === 0 ? (
              <div className="text-muted">No incident types available yet.</div>
            ) : (
              <Row xs={1} sm={2} className="g-2">
                {sortedTypes.map((type) => (
                  <Col key={type}>
                    <Form.Check
                      type="checkbox"
                      id={`avoid-${type}`}
                      label={<span className="text-capitalize">{type.replace('_', ' ')}</span>}
                      checked={selectedAvoid.includes(type)}
                      onChange={() => toggleAvoid(type)}
                      disabled={loading}
                    />
                  </Col>
                ))}
              </Row>
            )}
            {selectedAvoid.length > 0 && (
              <div className="mt-2">
                <small className="text-muted">Avoiding:</small>{' '}
                {selectedAvoid.map((t) => (
                  <Badge bg="secondary" className="me-1" key={t}>
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            type="submit"
            disabled={loading || !start || !end}
            title={!start || !end ? 'Pick start and destination on the map' : undefined}
          >
            {loading ? 'Calculating...' : 'Calculate route'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default RoutePlannerModal;
