from . import db
from datetime import datetime
from sqlalchemy.sql import func

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), unique=True, nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), default='user')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    events = db.relationship('Event', backref='reporter', lazy=True)
    notifications = db.relationship('Notification', backref='recipient', lazy=True)
    favorites = db.relationship('UserFavorite', backref='owner', lazy=True)
    route_requests = db.relationship('RouteRequest', backref='requester', lazy=True)

    def __repr__(self):
        return f'<User {self.username}>'


class Notification(db.Model):
    __tablename__ = 'notifications'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    title = db.Column(db.String(100), nullable=False)
    message = db.Column(db.Text, nullable=False)
    is_read = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class UserFavorite(db.Model):
    __tablename__ = 'user_favorites'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name = db.Column(db.String(100)) # ex: "Acasa", "Birou"
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)


class Event(db.Model):
    __tablename__ = 'events'

    id = db.Column(db.Integer, primary_key=True)
    reported_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    type = db.Column(db.String(50), nullable=False)
    severity = db.Column(db.Integer, nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(20), default='active')
    expires_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    report_meta = db.relationship('EventReport', backref='event', uselist=False, cascade="all, delete-orphan")

    route_links = db.relationship('RouteEventLink', backref='event', lazy=True)

class EventReport(db.Model):
    __tablename__ = 'events_reports'

    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey('events.id'), nullable=False) 
    reports_count = db.Column(db.Integer, default=1)

class HazardDefault(db.Model):
    __tablename__ = 'hazards_default'

    id = db.Column(db.Integer, primary_key=True)
    type = db.Column(db.String(50), nullable=False)
    severity = db.Column(db.Integer, nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)

class RouteRequest(db.Model):
    __tablename__ = 'route_requests'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    start_lat = db.Column(db.Float, nullable=False)
    start_long = db.Column(db.Float, nullable=False)
    end_lat = db.Column(db.Float, nullable=False)
    end_long = db.Column(db.Float, nullable=False)
    mode = db.Column(db.String(20), default='car')
    avoid_types = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    result_route = db.relationship('Route', backref='request', uselist=False, cascade="all, delete-orphan")

class Route(db.Model):
    __tablename__ = 'routes'

    id = db.Column(db.Integer, primary_key=True)
    request_id = db.Column(db.Integer, db.ForeignKey('route_requests.id'), nullable=False)
    polyline = db.Column(db.Text, nullable=False)
    score = db.Column(db.Integer, default=100)
    
    impacts = db.relationship('RouteEventLink', backref='route', lazy=True)

class RouteEventLink(db.Model):
    __tablename__ = 'route_event_links'

    id = db.Column(db.Integer, primary_key=True)
    event_id = db.Column(db.Integer, db.ForeignKey('events.id'), nullable=False)
    route_id = db.Column(db.Integer, db.ForeignKey('routes.id'), nullable=False)
    impact_score = db.Column(db.Integer)