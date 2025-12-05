def validate_coordinates(latitude, longitude):
    try:
        lat = float(latitude)
        lon = float(longitude)
        
        if lat < -90 or lat > 90:
            return False, "Latitude must be between -90 and 90"
        
        if lon < -180 or lon > 180:
            return False, "Longitude must be between -180 and 180"
        
        return True, None
    except (ValueError, TypeError):
        return False, "Invalid coordinate format"

def validate_event_type(event_type):
    valid_types = [
        'accident',
        'construction',
        'traffic_jam',
        'road_closure',
        'hazard',
        'police',
        'other'
    ]
    
    if event_type not in valid_types:
        return False, f"Invalid event type. Must be one of: {', '.join(valid_types)}"
    
    return True, None

def validate_severity(severity):
    try:
        sev = int(severity)
        if sev < 1 or sev > 5:
            return False, "Severity must be between 1 and 5", None
        return True, None, sev
    except (ValueError, TypeError):
        return False, "Severity must be a number between 1 and 5", None

def validate_status(status):
    valid_statuses = ['active', 'resolved', 'expired']
    
    if status not in valid_statuses:
        return False, f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
    
    return True, None