import { Navbar, Container, Nav, Button } from 'react-bootstrap';

interface NavbarComponentProps {
  user: { username: string } | null;
  onLogout: () => void;
}

const NavbarComponent = ({ user, onLogout }: NavbarComponentProps) => {
  return (
    <Navbar bg="dark" variant="dark" className="shadow-sm" style={{ position: 'absolute', top: 0, width: '100%', zIndex: 1000 }}>
      <Container fluid>
        <Navbar.Brand href="#home">
          <strong>TravelSafe</strong>
        </Navbar.Brand>
        <Nav className="ms-auto align-items-center">
          {user && (
            <>
              <Navbar.Text className="me-3">
                Welcome, <strong>{user.username}</strong>!
              </Navbar.Text>
              <Button variant="outline-light" size="sm" onClick={onLogout}>
                Logout
              </Button>
            </>
          )}
        </Nav>
      </Container>
    </Navbar>
  );
};

export default NavbarComponent;