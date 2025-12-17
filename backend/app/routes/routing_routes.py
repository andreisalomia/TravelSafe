import json
import math
from typing import Iterable, List, Optional, Tuple
from flask import Blueprint, jsonify, request
from ..auth import token_required
from ..models import Event, Route, RouteEventLink, RouteRequest
from ..validators import validate_coordinates
from .. import db

routing_bp = Blueprint('routing', __name__)

TRAVEL_MODES = {'car', 'bicycle', 'pedestrian'}

# Viteze medii (km/h)
AVERAGE_SPEEDS_KMH = {
    'car': 30.0,
    'bicycle': 15.0,
    'pedestrian': 5.0
}

# Configurare distante
CRITICAL_DISTANCE_KM = 0.05
DANGER_DISTANCE_KM = 0.2
WARNING_DISTANCE_KM = 0.5
MAX_REPORT_DISTANCE_KM = 1.0

def _haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) * math.sin(dlat / 2) + \
        math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
        math.sin(dlon / 2) * math.sin(dlon / 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

def _project_to_planar(lat: float, lon: float, ref_lat: float) -> Tuple[float, float]:
    km_per_deg_lat = 111.0
    km_per_deg_lon = 111.0 * math.cos(math.radians(ref_lat))
    return lon * km_per_deg_lon, lat * km_per_deg_lat

def _point_to_segment_distance_km(point, segment_start, segment_end) -> float:
    ref_lat = (point[1] + segment_start[1] + segment_end[1]) / 3.0
    px, py = _project_to_planar(point[1], point[0], ref_lat)
    ax, ay = _project_to_planar(segment_start[1], segment_start[0], ref_lat)
    bx, by = _project_to_planar(segment_end[1], segment_end[0], ref_lat)

    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)

    t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)

def _min_distance_to_path_km(path: List[List[float]], lat: float, lon: float) -> Optional[float]:
    if len(path) < 2: return None
    min_dist = None
    for idx in range(len(path) - 1):
        start = path[idx]
        end = path[idx + 1]
        if len(start) < 2 or len(end) < 2: continue
        dist = _point_to_segment_distance_km((lon, lat), (start[0], start[1]), (end[0], end[1]))
        if min_dist is None or dist < min_dist:
            min_dist = dist
    return min_dist

def _calculate_impact_score(distance_km: float, severity: int, is_avoided_type: bool) -> int:
    severity_mult = 0.4 + (severity * 0.2)
    if distance_km <= CRITICAL_DISTANCE_KM: base_impact = 20
    elif distance_km <= DANGER_DISTANCE_KM:
        ratio = (distance_km - CRITICAL_DISTANCE_KM) / (DANGER_DISTANCE_KM - CRITICAL_DISTANCE_KM)
        base_impact = 15 - (ratio * 10)
    elif distance_km <= WARNING_DISTANCE_KM:
        ratio = (distance_km - DANGER_DISTANCE_KM) / (WARNING_DISTANCE_KM - DANGER_DISTANCE_KM)
        base_impact = 5 - (ratio * 4)
    else:
        ratio = min(1.0, (distance_km - WARNING_DISTANCE_KM) / (MAX_REPORT_DISTANCE_KM - WARNING_DISTANCE_KM))
        base_impact = 1 - (ratio * 1)
    
    impact = base_impact * severity_mult
    if is_avoided_type: impact *= 1.5
    return max(0, int(round(impact)))

def _score_route(paths: Iterable[List[List[float]]], avoid_types: List[str]) -> Tuple[int, list]:
    avoid_types_lower = {t.lower() for t in avoid_types}
    active_events = Event.query.filter_by(status='active').all()
    impacts = []
    total_impact = 0.0

    for event in active_events:
        min_distance = None
        for path in paths:
            distance_km = _min_distance_to_path_km(path, event.latitude, event.longitude)
            if distance_km is not None:
                if min_distance is None or distance_km < min_distance:
                    min_distance = distance_km
        
        if min_distance is None or min_distance > MAX_REPORT_DISTANCE_KM: continue
        
        is_avoided_type = event.type.lower() in avoid_types_lower
        impact_score = _calculate_impact_score(min_distance, event.severity, is_avoided_type)
        if impact_score > 0:
            impacts.append((event, impact_score, min_distance))
            total_impact += impact_score

    score = max(0, min(100, int(round(100.0 - total_impact))))
    impacts.sort(key=lambda x: x[2])
    return score, impacts

def _validate_coordinate_payload(prefix: str, payload: dict):
    lat = payload.get('latitude')
    lon = payload.get('longitude')
    valid, message = validate_coordinates(lat, lon)
    if not valid: return None, None, f"{prefix}: {message}"
    return float(lat), float(lon), None

@routing_bp.route('/options', methods=['GET'])
def routing_options():
    event_types = [row[0] for row in db.session.query(Event.type).distinct().all()]
    return jsonify({
        'travel_modes': sorted(list(TRAVEL_MODES)),
        'available_event_types': sorted(event_types),
        'default_avoid_types': [etype for etype in event_types if etype in ('accident', 'road_closure', 'construction')]
    }), 200

@routing_bp.route('/', methods=['POST'])
@token_required
def plan_route(current_user):
    payload = request.get_json() or {}
    start_data = payload.get('start') or {}
    end_data = payload.get('end') or {}
    mode = (payload.get('mode') or 'car').lower()
    avoid_types = payload.get('avoid_types') or []
    polyline = payload.get('polyline')

    start_lat, start_lon, error = _validate_coordinate_payload('start', start_data)
    if error: return jsonify({'message': error}), 400
    end_lat, end_lon, error = _validate_coordinate_payload('end', end_data)
    if error: return jsonify({'message': error}), 400

    if mode not in TRAVEL_MODES:
        return jsonify({'message': f"Invalid mode '{mode}'. Must be one of {', '.join(sorted(TRAVEL_MODES))}"}), 400

    if not isinstance(avoid_types, list) or not all(isinstance(t, str) for t in avoid_types):
        return jsonify({'message': 'avoid_types must be a list of strings'}), 400

    try:
        route_request = RouteRequest(
            user_id=current_user.id,
            start_lat=start_lat,
            start_long=start_lon,
            end_lat=end_lat,
            end_long=end_lon,
            mode=mode,
            avoid_types=",".join(sorted({t.strip() for t in avoid_types if t.strip()}))
        )
        db.session.add(route_request)
        db.session.flush()

        score = None
        impacts_payload = []
        route_record = None
        
        # Variabile noi
        total_dist_km = 0.0
        efficiency = 0.0
        
        if polyline and isinstance(polyline, dict):
            paths = polyline.get('paths') or []
            
            # Calcul distanță reală
            path_points = []
            for path in paths:
                for pt in path:
                    path_points.append(pt)
            
            for i in range(len(path_points) - 1):
                p1 = path_points[i]
                p2 = path_points[i+1]
                total_dist_km += _haversine_distance(p1[1], p1[0], p2[1], p2[0])

            # Calcul eficiență
            if total_dist_km > 0:
                straight_dist = _haversine_distance(start_lat, start_lon, end_lat, end_lon)
                efficiency = straight_dist / total_dist_km

            score, impacted = _score_route(paths, avoid_types)
            route_record = Route(
                request_id=route_request.id,
                polyline=json.dumps(polyline),
                score=score if score is not None else 100
            )
            db.session.add(route_record)
            db.session.flush()

            for event, impact_score, distance_km in impacted:
                link = RouteEventLink(
                    event_id=event.id,
                    route_id=route_record.id,
                    impact_score=impact_score
                )
                db.session.add(link)
                impacts_payload.append({
                    'event_id': event.id,
                    'type': event.type,
                    'severity': event.severity,
                    'distance_km': round(distance_km, 3),
                    'impact_score': impact_score
                })

        db.session.commit()
        
        # Calcul durată
        speed = AVERAGE_SPEEDS_KMH.get(mode, 30.0)
        duration_min = (total_dist_km / speed) * 60

        # Descriere Tip Rută
        route_type_desc = "Standard"
        if efficiency > 0.9:
            route_type_desc = "Direct / Dreaptă"
        elif efficiency < 0.6:
            route_type_desc = "Sinuoasă / Ocolire"

        return jsonify({
            'request_id': route_request.id,
            'route_id': route_record.id if route_record else None,
            'score': score if score is not None else 100,
            'metrics': {
                'distance_km': round(total_dist_km, 2),
                'duration_minutes': round(duration_min, 1),
                'efficiency': round(efficiency, 2),
                'mode': mode,
                'description': route_type_desc  # <--- AICI AM ADĂUGAT LIPSĂ
            },
            'impacts': impacts_payload
        }), 201

    except Exception as exc:
        db.session.rollback()
        return jsonify({'message': f'Unable to save route: {exc}'}), 500