from flask import Blueprint

api = Blueprint('api', __name__, url_prefix='/api')

from .auth_routes import auth_bp
from .test_routes import test_bp
from .events_routes import events_bp

api.register_blueprint(auth_bp, url_prefix='/auth')
api.register_blueprint(test_bp)
api.register_blueprint(events_bp, url_prefix='/events')

from .main_routes import main_bp