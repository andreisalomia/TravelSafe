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

# Scoring configuration - more reasonable for urban environments
CRITICAL_DISTANCE_KM = 0.05   # 50 meters - very dangerous, on the route
DANGER_DISTANCE_KM = 0.2      # 200 meters - dangerous proximity
WARNING_DISTANCE_KM = 0.5     # 500 meters - worth noting but not critical
MAX_REPORT_DISTANCE_KM = 1.0  # 1 km - max distance to report in impacts


def _project_to_planar(lat: float, lon: float, ref_lat: float) -> Tuple[float, float]:
    """
    Convert geographic coords to a local planar approximation in kilometers.
    """
    km_per_deg_lat = 111.0
    km_per_deg_lon = 111.0 * math.cos(math.radians(ref_lat))
    return lon * km_per_deg_lon, lat * km_per_deg_lat


def _point_to_segment_distance_km(
    point: Tuple[float, float], segment_start: Tuple[float, float], segment_end: Tuple[float, float]
) -> float:
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
    """
    Return the minimum distance in km from a point to any segment of a path.
    Path format expected: [[lon, lat], [lon, lat], ...]
    """
    if len(path) < 2:
        return None
    min_dist = None
    for idx in range(len(path) - 1):
        start = path[idx]
        end = path[idx + 1]
        if len(start) < 2 or len(end) < 2:
            continue
        dist = _point_to_segment_distance_km((lon, lat), (start[0], start[1]), (end[0], end[1]))
        if min_dist is None or dist < min_dist:
            min_dist = dist
    return min_dist


def _calculate_impact_score(distance_km: float, severity: int, is_avoided_type: bool) -> int:
    """
    Calculate impact score based on distance, severity, and whether user wanted to avoid this type.
    
    Scoring logic:
    - Critical zone (<50m): High impact (15-30 points depending on severity)
    - Danger zone (50-200m): Medium impact (5-15 points)
    - Warning zone (200-500m): Low impact (1-5 points)
    - Beyond 500m: Minimal impact (0-2 points)
    
    Multiplied by 1.5x if user specifically chose to avoid this incident type.
    """
    # Base severity multiplier (severity 1-5 maps to 0.6-1.4)
    severity_mult = 0.4 + (severity * 0.2)
    
    # Distance-based impact
    if distance_km <= CRITICAL_DISTANCE_KM:
        # Very close - this is essentially on the route
        base_impact = 20
    elif distance_km <= DANGER_DISTANCE_KM:
        # Danger zone - exponential decay from 15 to 5
        ratio = (distance_km - CRITICAL_DISTANCE_KM) / (DANGER_DISTANCE_KM - CRITICAL_DISTANCE_KM)
        base_impact = 15 - (ratio * 10)
    elif distance_km <= WARNING_DISTANCE_KM:
        # Warning zone - linear decay from 5 to 1
        ratio = (distance_km - DANGER_DISTANCE_KM) / (WARNING_DISTANCE_KM - DANGER_DISTANCE_KM)
        base_impact = 5 - (ratio * 4)
    else:
        # Far away - minimal impact
        ratio = min(1.0, (distance_km - WARNING_DISTANCE_KM) / (MAX_REPORT_DISTANCE_KM - WARNING_DISTANCE_KM))
        base_impact = 1 - (ratio * 1)
    
    # Apply severity multiplier
    impact = base_impact * severity_mult
    
    # If user specifically wanted to avoid this type, it's more impactful
    if is_avoided_type:
        impact *= 1.5
    
    return max(0, int(round(impact)))


def _score_route(paths: Iterable[List[List[float]]], avoid_types: List[str]) -> Tuple[int, list]:
    """
    Compute a safety score (0-100) based on active incidents near the provided paths.
    Returns (score, impacted_events) where impacted_events is a list of
    (Event, impact_score, distance_km).
    
    Scoring philosophy:
    - Start with 100 points
    - Deduct points based on nearby incidents
    - Incidents very close to the route (<50m) have high impact
    - Incidents further away have progressively less impact
    - A route passing through multiple incidents will score lower
    - A score of 100 means no incidents nearby
    - A score of 0-30 means very dangerous route
    - A score of 70+ is considered safe
    """
    avoid_types_lower = {t.lower() for t in avoid_types}
    active_events = Event.query.filter_by(status='active').all()
    impacts = []
    total_impact = 0.0

    for event in active_events:
        min_distance = None
        
        # Find minimum distance to any path segment
        for path in paths:
            distance_km = _min_distance_to_path_km(path, event.latitude, event.longitude)
            if distance_km is not None:
                if min_distance is None or distance_km < min_distance:
                    min_distance = distance_km
        
        # Skip if too far away
        if min_distance is None or min_distance > MAX_REPORT_DISTANCE_KM:
            continue
        
        is_avoided_type = event.type.lower() in avoid_types_lower
        impact_score = _calculate_impact_score(min_distance, event.severity, is_avoided_type)
        
        if impact_score > 0:
            impacts.append((event, impact_score, min_distance))
            total_impact += impact_score

    # Calculate final score (cap deductions at 100)
    score = max(0, min(100, int(round(100.0 - total_impact))))
    
    # Sort impacts by distance (closest first)
    impacts.sort(key=lambda x: x[2])
    
    return score, impacts


def _validate_coordinate_payload(prefix: str, payload: dict):
    lat = payload.get('latitude')
    lon = payload.get('longitude')
    valid, message = validate_coordinates(lat, lon)
    if not valid:
        return None, None, f"{prefix}: {message}"
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
    if error:
        return jsonify({'message': error}), 400
    end_lat, end_lon, error = _validate_coordinate_payload('end', end_data)
    if error:
        return jsonify({'message': error}), 400

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

        if polyline and isinstance(polyline, dict):
            paths = polyline.get('paths') or []
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

        return jsonify({
            'request_id': route_request.id,
            'route_id': route_record.id if route_record else None,
            'score': score if score is not None else 100,
            'impacts': impacts_payload
        }), 201

    except Exception as exc:
        db.session.rollback()
        return jsonify({'message': f'Unable to save route: {exc}'}), 500