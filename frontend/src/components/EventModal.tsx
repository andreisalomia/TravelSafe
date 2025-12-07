import { useState, useEffect } from 'react';
import { Modal, Form, Button, Alert, Spinner } from 'react-bootstrap';
import { eventsService, type CreateEventData } from '../services/eventsService';

interface EventModalProps {
  show: boolean;
  latitude: number | null;
  longitude: number | null;
  onClose: () => void;
  onCreated?: (event: any) => void;
}

const EventModal = ({ show, latitude, longitude, onClose, onCreated }: EventModalProps) => {
  const [type, setType] = useState('accident');
  const [severity, setSeverity] = useState<number>(3);
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!show) {
      setError('');
      setType('accident');
      setSeverity(3);
    }
  }, [show]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (latitude == null || longitude == null) {
      setError('Coordinates missing');
      return;
    }

    setError('');
    setLoading(true);

    const payload: CreateEventData = {
      type,
      severity,
      latitude,
      longitude
    };

    try {
      const created = await eventsService.createEvent(payload);
      onCreated?.(created);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create event');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal show={show} onHide={onClose} centered>
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>Report an Incident</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}

          <Form.Group className="mb-3">
            <Form.Label>Type</Form.Label>
            <Form.Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="accident">Accident</option>
              <option value="construction">Construction</option>
              <option value="traffic_jam">Traffic Jam</option>
              <option value="road_closure">Road Closure</option>
              <option value="hazard">Hazard</option>
              <option value="police">Police</option>
              <option value="other">Other</option>
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Severity</Form.Label>
            <Form.Select value={severity} onChange={(e) => setSeverity(Number(e.target.value))}>
              <option value={1}>1 - Very Low</option>
              <option value={2}>2 - Low</option>
              <option value={3}>3 - Medium</option>
              <option value={4}>4 - High</option>
              <option value={5}>5 - Critical</option>
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>Coordinates</Form.Label>
            <Form.Control readOnly value={latitude != null && longitude != null ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : 'N/A'} />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={loading}>
            {loading ? <Spinner animation="border" size="sm" /> : 'Report'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default EventModal;