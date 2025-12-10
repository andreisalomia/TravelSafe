from app import create_app, db
from app.models import Event, EventReport
from datetime import datetime

app = create_app()

def seed_bucharest_events():
    """
    Populeaza baza de date cu incidente in Bucuresti care nu expira.
    """
    # Coordonate aproximative din București
    incidents = [
        {
            "type": "accident",
            "severity": 5, # Severitate maxima, de evitat cu orice pret
            "latitude": 44.4268, # Piata Unirii
            "longitude": 26.1025,
            "description": "Accident grav in sensul giratoriu Unirii"
        },
        {
            "type": "construction",
            "severity": 3, # Trafic ingreunat
            "latitude": 44.4522, # Piata Victoriei
            "longitude": 26.0864,
            "description": "Lucrari la carosabil Piata Victoriei"
        },
        {
            "type": "pothole", # Periculos pentru biciclisti
            "severity": 2,
            "latitude": 44.4355, # Universitate
            "longitude": 26.1025,
            "description": "Gropa adanca pe banda 1"
        },
        {
            "type": "police", 
            "severity": 1,
            "latitude": 44.4635, # Arcul de Triumf
            "longitude": 26.0781,
            "description": "Radar politie"
        },
        {
            "type": "blocked_sidewalk", # Relevant pentru pietoni
            "severity": 4,
            "latitude": 44.4325, # Centrul Vechi / Lipscani
            "longitude": 26.0995,
            "description": "Trotuar blocat de terasa extinsa"
        },
        {
            "type": "heavy_traffic",
            "severity": 3,
            "latitude": 44.4410, # Calea Dorobanti
            "longitude": 26.0990,
            "description": "Ambuteiaj major"
        },
        {
            "type": "accident",
            "severity": 4,
            "latitude": 44.4390, # Pod Grozavesti / Politehnica
            "longitude": 26.0600,
            "description": "Tamponare usoara pe pod"
        },
        {
            "type": "ice", # Pericol iarna
            "severity": 4,
            "latitude": 44.4162, # Parcul Carol (zona cu panta)
            "longitude": 26.0945,
            "description": "Ghetus pe aleea principala"
        }
    ]

    print(f"Adding {len(incidents)} permanent events to Bucharest map...")

    with app.app_context():
        count = 0
        for item in incidents:
            # Verificam daca exista deja un eveniment exact la aceleasi coordonate pentru a nu duplica
            exists = Event.query.filter_by(
                latitude=item['latitude'], 
                longitude=item['longitude'], 
                type=item['type']
            ).first()

            if not exists:
                # 1. Cream Evenimentul
                event = Event(
                    type=item['type'],
                    severity=item['severity'],
                    latitude=item['latitude'],
                    longitude=item['longitude'],
                    status='active',
                    # expires_at=None inseamna ca nu expira niciodata
                    expires_at=None, 
                    # reported_by=None inseamna generat de sistem (sau poti pune un ID de admin daca ai)
                    reported_by=None 
                )
                db.session.add(event)
                db.session.flush() # Facem flush pentru a obtine ID-ul evenimentului inainte de commit

                # 2. Cream Meta-raportul (pentru consistenta datelor)
                report_meta = EventReport(
                    event_id=event.id,
                    reports_count=1 # Consideram ca e confirmat de sistem
                )
                db.session.add(report_meta)
                
                count += 1
        
        try:
            db.session.commit()
            print(f"Successfully added {count} new events.")
        except Exception as e:
            db.session.rollback()
            print(f"Error adding events: {e}")

if __name__ == "__main__":
    seed_bucharest_events()