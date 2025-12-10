from flask import Blueprint, jsonify, request
from ..models import Event, EventReport
from .. import db
from ..validators import (
    validate_coordinates, 
    validate_event_type, 
    validate_severity
)
from datetime import datetime
from . import api

# Definim Blueprint-ul (daca nu e deja definit in __init__.py din routes)
api = Blueprint('api', __name__)

# --- RUTA 1: GET - Date pentru Hartă (Markere + Heatmap) ---
@api.route('/map-data', methods=['GET'])
def get_map_data():
    """
    Returnează datele necesare pentru frontend:
    1. points: Lista detaliată pentru iconițe (Markere)
    2. heatmap: Lista simplă pentru zonele roșii (Heatmap)
    """
    
    print("📢 Request primit pe /api/map-data")
    
    try:        
        # Luăm doar evenimentele active
        active_events = Event.query.filter_by(status='active').all()
        
        markers = []
        heatmap_points = []
        
        for event in active_events:
            # 1. Construim datele pentru Markere (Userul dă click pe ele)
            markers.append({
                'id': event.id,
                'type': event.type,       # ex: 'accident', 'police'
                'severity': event.severity, # 1-5
                'lat': event.latitude,
                'lng': event.longitude,
                'created_at': event.created_at.isoformat(),
                'description': f"Incident: {event.type} (Severitate: {event.severity})"
            })

            # 2. Construim datele pentru Heatmap
            # Heatmap-ul are nevoie de locație și 'weight' (intensitate)
            # Severitatea 5 va fi mult mai 'roșie' decât severitatea 1
            heatmap_points.append({
                'lat': event.latitude,
                'lng': event.longitude,
                'weight': event.severity 
            })

        return jsonify({
            'markers': markers,
            'heatmap': heatmap_points
        }), 200
    except Exception as e:
        print(f"❌ Eroare server: {e}")
        return jsonify({'error': str(e)}), 500

# --- RUTA 2: POST - Raportare Incident Nou (folosind validators.py) ---
@api.route('/report', methods=['POST'])
# @token_required  <-- Decommentat cand vrei sa permiti doar userilor logati
def report_event():
    data = request.get_json()
    
    if not data:
        return jsonify({'message': 'No data provided'}), 400

    # 1. Validare Tip Eveniment
    is_valid_type, type_msg = validate_event_type(data.get('type'))
    if not is_valid_type:
        return jsonify({'message': type_msg}), 400

    # 2. Validare Coordonate
    is_valid_coord, coord_msg = validate_coordinates(data.get('latitude'), data.get('longitude'))
    if not is_valid_coord:
        return jsonify({'message': coord_msg}), 400

    # 3. Validare Severitate
    # Atentie: Functia ta returneaza 3 valori (bool, msg, valoare_convertita)
    is_valid_sev, sev_msg, valid_severity_int = validate_severity(data.get('severity'))
    if not is_valid_sev:
        return jsonify({'message': sev_msg}), 400

    try:
        # Creăm evenimentul
        new_event = Event(
            type=data.get('type'),
            severity=valid_severity_int,
            latitude=float(data.get('latitude')),
            longitude=float(data.get('longitude')),
            status='active',
            # reported_by=current_user.id  <-- Daca folosesti token_required
            expires_at=None # Sau poti calcula o expirare default (ex: +2 ore)
        )
        
        db.session.add(new_event)
        db.session.flush() # Pentru a obtine ID-ul

        # Creăm și intrarea în tabela de rapoarte
        new_report = EventReport(
            event_id=new_event.id,
            reports_count=1
        )
        db.session.add(new_report)
        
        db.session.commit()
        
        return jsonify({
            'message': 'Incident reported successfully',
            'event': {
                'id': new_event.id,
                'type': new_event.type,
                'severity': new_event.severity,
                'lat': new_event.latitude,
                'lng': new_event.longitude
            }
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Error reporting event: {str(e)}'}), 500