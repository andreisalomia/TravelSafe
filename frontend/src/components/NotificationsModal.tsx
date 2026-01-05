import { Modal, Button, ListGroup, Badge, Stack } from 'react-bootstrap';
import type { NotificationItem } from '../services/notificationsService';

interface NotificationsModalProps {
  show: boolean;
  notifications: NotificationItem[];
  onClose: () => void;
  onDelete: (id: number) => void;
}

const NotificationsModal = ({ show, notifications, onClose, onDelete }: NotificationsModalProps) => {
  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Notifications</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {notifications.length === 0 ? (
          <div className="text-muted">No notifications yet.</div>
        ) : (
          <ListGroup>
            {notifications.map((n) => (
              <ListGroup.Item key={n.id} className="d-flex align-items-start justify-content-between gap-2">
                <div>
                  <div className="d-flex align-items-center gap-2">
                    <strong>{n.title}</strong>
                    {!n.is_read && <Badge bg="warning" text="dark">New</Badge>}
                  </div>
                  <div className="text-muted small">{n.message}</div>
                  {n.created_at && (
                    <div className="text-muted small mt-1">
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                  )}
                </div>
                <Stack direction="horizontal" gap={2}>
                  <Button variant="outline-danger" size="sm" onClick={() => onDelete(n.id)}>
                    Delete
                  </Button>
                </Stack>
              </ListGroup.Item>
            ))}
          </ListGroup>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default NotificationsModal;
