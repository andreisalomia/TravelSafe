from flask import Blueprint, jsonify, request
from datetime import datetime, timedelta
from ..models import Event, EventReport, User
from ..auth import token_required
from .. import db

events_bp = Blueprint('events', __name__)

@events_bp.route('/', methods=['GET'])
def get_all_events():
    try:
        event_type = request.args.get('type')
        severity = request.args.get('severity')
        status = request.args.get('status', 'active')
        limit = request.args.get('limit', 100, type=int)
        
        query = Event.query
        
        if event_type:
            query = query.filter_by(type=event_type)
        
        if severity:
            query = query.filter_by(severity=int(severity))
        
        if status:
            query = query.filter_by(status=status)
        
        events = query.order_by(Event.created_at.desc()).limit(limit).all()
        
        events_data = []
        for event in events:
            event_dict = {
                'id': event.id,
                'type': event.type,
                'severity': event.severity,
                'latitude': event.latitude,
                'longitude': event.longitude,
                'status': event.status,
                'expires_at': event.expires_at.isoformat() if event.expires_at else None,
                'created_at': event.created_at.isoformat(),
                'reported_by': event.reported_by,
                'reports_count': event.report_meta.reports_count if event.report_meta else 1
            }
            events_data.append(event_dict)
        
        return jsonify({
            'events': events_data,
            'count': len(events_data)
        }), 200
        
    except Exception as e:
        return jsonify({'message': f'Error fetching events: {str(e)}'}), 500

@events_bp.route('/<int:event_id>', methods=['GET'])
def get_event(event_id):
    try:
        event = Event.query.get(event_id)
        
        if not event:
            return jsonify({'message': 'Event not found'}), 404
        
        reporter = None
        if event.reported_by:
            user = User.query.get(event.reported_by)
            if user:
                reporter = {
                    'id': user.id,
                    'username': user.username
                }
        
        event_data = {
            'id': event.id,
            'type': event.type,
            'severity': event.severity,
            'latitude': event.latitude,
            'longitude': event.longitude,
            'status': event.status,
            'expires_at': event.expires_at.isoformat() if event.expires_at else None,
            'created_at': event.created_at.isoformat(),
            'reported_by': event.reported_by,
            'reporter': reporter,
            'reports_count': event.report_meta.reports_count if event.report_meta else 1
        }
        
        return jsonify({'event': event_data}), 200
        
    except Exception as e:
        return jsonify({'message': f'Error fetching event: {str(e)}'}), 500

@events_bp.route('/', methods=['POST'])
@token_required
def create_event(current_user):
    try:
        data = request.get_json()
        
        required_fields = ['type', 'severity', 'latitude', 'longitude']
        for field in required_fields:
            if field not in data:
                return jsonify({'message': f'Missing required field: {field}'}), 400
        
        valid_types = ['accident', 'construction', 'traffic_jam', 'road_closure', 'hazard', 'police', 'other']
        if data['type'] not in valid_types:
            return jsonify({'message': f'Invalid event type. Must be one of: {", ".join(valid_types)}'}), 400
        
        try:
            severity = int(data['severity'])
            if severity < 1 or severity > 5:
                return jsonify({'message': 'Severity must be between 1 and 5'}), 400
        except (ValueError, TypeError):
            return jsonify({'message': 'Severity must be a number between 1 and 5'}), 400
        
        try:
            latitude = float(data['latitude'])
            longitude = float(data['longitude'])
            
            if latitude < -90 or latitude > 90:
                return jsonify({'message': 'Latitude must be between -90 and 90'}), 400
            
            if longitude < -180 or longitude > 180:
                return jsonify({'message': 'Longitude must be between -180 and 180'}), 400
                
        except (ValueError, TypeError):
            return jsonify({'message': 'Invalid coordinates format'}), 400
        
        tolerance = 0.001
        existing_event = Event.query.filter(
            Event.latitude.between(latitude - tolerance, latitude + tolerance),
            Event.longitude.between(longitude - tolerance, longitude + tolerance),
            Event.type == data['type'],
            Event.status == 'active'
        ).first()
        
        if existing_event:
            if not existing_event.report_meta:
                report_meta = EventReport(event_id=existing_event.id, reports_count=1)
                db.session.add(report_meta)
            
            existing_event.report_meta.reports_count += 1
            db.session.commit()
            
            return jsonify({
                'message': 'Event already exists. Report count increased.',
                'event': {
                    'id': existing_event.id,
                    'type': existing_event.type,
                    'severity': existing_event.severity,
                    'latitude': existing_event.latitude,
                    'longitude': existing_event.longitude,
                    'reports_count': existing_event.report_meta.reports_count
                }
            }), 200
        
        expires_at = datetime.utcnow() + timedelta(hours=24)
        
        new_event = Event(
            reported_by=current_user.id,
            type=data['type'],
            severity=severity,
            latitude=latitude,
            longitude=longitude,
            status='active',
            expires_at=expires_at
        )
        
        db.session.add(new_event)
        db.session.flush()
        
        report_meta = EventReport(
            event_id=new_event.id,
            reports_count=1
        )
        db.session.add(report_meta)
        
        db.session.commit()
        
        return jsonify({
            'message': 'Event created successfully',
            'event': {
                'id': new_event.id,
                'type': new_event.type,
                'severity': new_event.severity,
                'latitude': new_event.latitude,
                'longitude': new_event.longitude,
                'status': new_event.status,
                'expires_at': new_event.expires_at.isoformat(),
                'created_at': new_event.created_at.isoformat(),
                'reported_by': new_event.reported_by
            }
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Error creating event: {str(e)}'}), 500

@events_bp.route('/<int:event_id>', methods=['PUT'])
@token_required
def update_event(current_user, event_id):
    try:
        event = Event.query.get(event_id)
        
        if not event:
            return jsonify({'message': 'Event not found'}), 404
        
        if event.reported_by != current_user.id and current_user.role != 'admin':
            return jsonify({'message': 'Unauthorized to update this event'}), 403
        
        data = request.get_json()
        
        if 'type' in data:
            valid_types = ['accident', 'construction', 'traffic_jam', 'road_closure', 'hazard', 'police', 'other']
            if data['type'] not in valid_types:
                return jsonify({'message': f'Invalid event type. Must be one of: {", ".join(valid_types)}'}), 400
            event.type = data['type']
        
        if 'severity' in data:
            try:
                severity = int(data['severity'])
                if severity < 1 or severity > 5:
                    return jsonify({'message': 'Severity must be between 1 and 5'}), 400
                event.severity = severity
            except (ValueError, TypeError):
                return jsonify({'message': 'Severity must be a number'}), 400
        
        if 'status' in data:
            valid_statuses = ['active', 'resolved', 'expired']
            if data['status'] not in valid_statuses:
                return jsonify({'message': f'Invalid status. Must be one of: {", ".join(valid_statuses)}'}), 400
            event.status = data['status']
        
        if 'latitude' in data:
            try:
                latitude = float(data['latitude'])
                if latitude < -90 or latitude > 90:
                    return jsonify({'message': 'Latitude must be between -90 and 90'}), 400
                event.latitude = latitude
            except (ValueError, TypeError):
                return jsonify({'message': 'Invalid latitude format'}), 400
        
        if 'longitude' in data:
            try:
                longitude = float(data['longitude'])
                if longitude < -180 or longitude > 180:
                    return jsonify({'message': 'Longitude must be between -180 and 180'}), 400
                event.longitude = longitude
            except (ValueError, TypeError):
                return jsonify({'message': 'Invalid longitude format'}), 400
        
        db.session.commit()
        
        return jsonify({
            'message': 'Event updated successfully',
            'event': {
                'id': event.id,
                'type': event.type,
                'severity': event.severity,
                'latitude': event.latitude,
                'longitude': event.longitude,
                'status': event.status,
                'expires_at': event.expires_at.isoformat() if event.expires_at else None,
                'created_at': event.created_at.isoformat()
            }
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Error updating event: {str(e)}'}), 500

@events_bp.route('/<int:event_id>', methods=['DELETE'])
@token_required
def delete_event(current_user, event_id):
    try:
        event = Event.query.get(event_id)
        
        if not event:
            return jsonify({'message': 'Event not found'}), 404
        
        if event.reported_by != current_user.id and current_user.role != 'admin':
            return jsonify({'message': 'Unauthorized to delete this event'}), 403
        
        db.session.delete(event)
        db.session.commit()
        
        return jsonify({'message': 'Event deleted successfully'}), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Error deleting event: {str(e)}'}), 500

@events_bp.route('/<int:event_id>/report', methods=['POST'])
@token_required
def report_event(current_user, event_id):
    try:
        event = Event.query.get(event_id)
        
        if not event:
            return jsonify({'message': 'Event not found'}), 404
        
        if not event.report_meta:
            report_meta = EventReport(event_id=event.id, reports_count=1)
            db.session.add(report_meta)
        else:
            event.report_meta.reports_count += 1
        
        db.session.commit()
        
        return jsonify({
            'message': 'Event reported successfully',
            'reports_count': event.report_meta.reports_count
        }), 200
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Error reporting event: {str(e)}'}), 500

@events_bp.route('/statistics', methods=['GET'])
def get_statistics():
    try:
        total_events = Event.query.count()
        active_events = Event.query.filter_by(status='active').count()
        resolved_events = Event.query.filter_by(status='resolved').count()
        
        types_count = {}
        for event_type in ['accident', 'construction', 'traffic_jam', 'road_closure', 'hazard', 'police', 'other']:
            count = Event.query.filter_by(type=event_type, status='active').count()
            types_count[event_type] = count
        
        severity_count = {}
        for severity in range(1, 6):
            count = Event.query.filter_by(severity=severity, status='active').count()
            severity_count[str(severity)] = count
        
        return jsonify({
            'statistics': {
                'total_events': total_events,
                'active_events': active_events,
                'resolved_events': resolved_events,
                'by_type': types_count,
                'by_severity': severity_count
            }
        }), 200
        
    except Exception as e:
        return jsonify({'message': f'Error fetching statistics: {str(e)}'}), 500

@events_bp.route('/nearby', methods=['GET'])
def get_nearby_events():
    try:
        latitude = request.args.get('latitude', type=float)
        longitude = request.args.get('longitude', type=float)
        radius = request.args.get('radius', 5, type=float)
        
        if latitude is None or longitude is None:
            return jsonify({'message': 'Missing latitude or longitude'}), 400
        
        lat_delta = radius / 111.0
        lon_delta = radius / (111.0 * abs(float(latitude)))
        
        events = Event.query.filter(
            Event.latitude.between(latitude - lat_delta, latitude + lat_delta),
            Event.longitude.between(longitude - lon_delta, longitude + lon_delta),
            Event.status == 'active'
        ).all()
        
        events_data = []
        for event in events:
            event_dict = {
                'id': event.id,
                'type': event.type,
                'severity': event.severity,
                'latitude': event.latitude,
                'longitude': event.longitude,
                'status': event.status,
                'expires_at': event.expires_at.isoformat() if event.expires_at else None,
                'created_at': event.created_at.isoformat(),
                'reports_count': event.report_meta.reports_count if event.report_meta else 1
            }
            events_data.append(event_dict)
        
        return jsonify({
            'events': events_data,
            'count': len(events_data),
            'center': {
                'latitude': latitude,
                'longitude': longitude
            },
            'radius_km': radius
        }), 200
        
    except Exception as e:
        return jsonify({'message': f'Error fetching nearby events: {str(e)}'}), 500