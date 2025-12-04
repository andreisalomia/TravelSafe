from flask import Blueprint, jsonify

test_bp = Blueprint('test', __name__)

@test_bp.route('/test', methods=['GET'])
def test_connection():
    return jsonify({"status": "connected", "message": "API is working properly."})

@test_bp.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy"}), 200