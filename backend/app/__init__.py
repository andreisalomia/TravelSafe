from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_migrate import Migrate
import os
from dotenv import load_dotenv

load_dotenv()

db = SQLAlchemy()
migrate = Migrate()

def create_app():
    app = Flask(__name__)
    
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)
    CORS(app)
    migrate.init_app(app, db)

    from . import models
    
    from .routes import api, main_bp
    
    app.register_blueprint(main_bp)
    app.register_blueprint(api)

    _ensure_default_admin(app)

    return app


def _ensure_default_admin(app: Flask) -> None:
    """
    Create a default admin user if configured via env vars and not already present.
    Controlled by:
      DEFAULT_ADMIN_EMAIL
      DEFAULT_ADMIN_PASSWORD
      DEFAULT_ADMIN_USERNAME (optional, defaults to 'admin')
    """
    admin_email = os.getenv('DEFAULT_ADMIN_EMAIL')
    admin_password = os.getenv('DEFAULT_ADMIN_PASSWORD')

    if not admin_email or not admin_password:
        return

    admin_username = os.getenv('DEFAULT_ADMIN_USERNAME', 'admin')

    from .models import User
    from .auth import hash_password

    with app.app_context():
        existing = User.query.filter_by(email=admin_email).first()
        if existing:
            return

        try:
            admin_user = User(
                username=admin_username,
                email=admin_email,
                password_hash=hash_password(admin_password),
                role='admin'
            )
            db.session.add(admin_user)
            db.session.commit()
            app.logger.info("Default admin created: %s", admin_email)
        except Exception as exc:
            db.session.rollback()
            app.logger.error("Failed to create default admin: %s", exc)
