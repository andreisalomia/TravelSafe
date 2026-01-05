import { Modal, Button, ListGroup, Badge, Row, Col } from 'react-bootstrap';

interface ProfileModalProps {
  show: boolean;
  onClose: () => void;
  user: any;
}

const ProfileModal = ({ show, onClose, user }: ProfileModalProps) => {
  if (!user) return null;

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Profil Utilizator</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="text-center mb-4">
          <h4>{user.username}</h4>
          <p className="text-muted">{user.email}</p>
          <Badge bg="info">{user.role}</Badge>
        </div>
        
        <h5>Activitate</h5>
        <ListGroup variant="flush">
          <ListGroup.Item className="d-flex justify-content-between align-items-center">
            Evenimente raportate
            <Badge bg="primary" pill>{user.stats?.events_reported || 0}</Badge>
          </ListGroup.Item>
          <ListGroup.Item className="d-flex justify-content-between align-items-center">
            Locații favorite
            <Badge bg="primary" pill>{user.stats?.favorites_count || 0}</Badge>
          </ListGroup.Item>
          <ListGroup.Item className="d-flex justify-content-between align-items-center">
            Rute calculate
            <Badge bg="primary" pill>{user.stats?.routes_planned || 0}</Badge>
          </ListGroup.Item>
        </ListGroup>
        
        <div className="mt-3 small text-muted text-end">
          Membru din: {new Date(user.created_at).toLocaleDateString()}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>Închide</Button>
      </Modal.Footer>
    </Modal>
  );
};

export default ProfileModal;