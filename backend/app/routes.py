from flask import Blueprint, jsonify

bp = Blueprint('main', __name__)

@bp.route('/', methods=['GET'])
def index():
    return jsonify({"message": "Welcome to the TravelSafe API!"})

@bp.route('/api/test', methods=['GET'])
def test_connection():
    return jsonify({"status": "connected", "message": "API is working properly."})