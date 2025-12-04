from flask import Blueprint, jsonify, request
from ..models import User
from ..auth import hash_password, check_password, generate_token, token_required
from .. import db

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/register', methods=['POST'])
def register():
    try:
        data = request.get_json()
        
        if not data or not data.get('username') or not data.get('email') or not data.get('password'):
            return jsonify({'message': 'Missing required fields: username, email, password'}), 400
        
        username = data.get('username').strip()
        email = data.get('email').strip().lower()
        password = data.get('password')

        if len(username) < 3:
            return jsonify({'message': 'Username must be at least 3 characters'}), 400
        
        if len(password) < 6:
            return jsonify({'message': 'Password must be at least 6 characters'}), 400
        
        if User.query.filter_by(username=username).first():
            return jsonify({'message': 'Username already exists'}), 409
        
        if User.query.filter_by(email=email).first():
            return jsonify({'message': 'Email already exists'}), 409
        
        hashed_password = hash_password(password)
        new_user = User(
            username=username,
            email=email,
            password_hash=hashed_password,
            role='user'
        )
        
        db.session.add(new_user)
        db.session.commit()
        
        token = generate_token(new_user.id)
        
        return jsonify({
            'message': 'User registered successfully',
            'token': token,
            'user': {
                'id': new_user.id,
                'username': new_user.username,
                'email': new_user.email,
                'role': new_user.role
            }
        }), 201
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'message': f'Error registering user: {str(e)}'}), 500

@auth_bp.route('/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        
        if not data or not data.get('email') or not data.get('password'):
            return jsonify({'message': 'Missing required fields: email, password'}), 400
        
        email = data.get('email').strip().lower()
        password = data.get('password')
        
        user = User.query.filter_by(email=email).first()
        
        if not user:
            return jsonify({'message': 'Invalid email or password'}), 401
        
        if not check_password(user.password_hash, password):
            return jsonify({'message': 'Invalid email or password'}), 401
        
        token = generate_token(user.id)
        
        return jsonify({
            'message': 'Login successful',
            'token': token,
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'role': user.role
            }
        }), 200
        
    except Exception as e:
        return jsonify({'message': f'Error logging in: {str(e)}'}), 500

@auth_bp.route('/me', methods=['GET'])
@token_required
def get_current_user(current_user):
    return jsonify({
        'user': {
            'id': current_user.id,
            'username': current_user.username,
            'email': current_user.email,
            'role': current_user.role,
            'created_at': current_user.created_at.isoformat()
        }
    }), 200

@auth_bp.route('/logout', methods=['POST'])
@token_required
def logout(current_user):
    return jsonify({'message': 'Logout successful'}), 200

@auth_bp.route('/verify', methods=['GET'])
@token_required
def verify_token_route(current_user):
    return jsonify({
        'valid': True,
        'user': {
            'id': current_user.id,
            'username': current_user.username,
            'email': current_user.email,
            'role': current_user.role
        }
    }), 200