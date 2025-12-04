import jwt
import os
from datetime import datetime, timedelta
from functools import wraps
from flask import request, jsonify
from .models import User
from . import db

def hash_password(password):
    from flask_bcrypt import Bcrypt
    bcrypt = Bcrypt()
    return bcrypt.generate_password_hash(password).decode('utf-8')

def check_password(password_hash, password):
    from flask_bcrypt import Bcrypt
    bcrypt = Bcrypt()
    return bcrypt.check_password_hash(password_hash, password)

def generate_token(user_id):
    expiration = datetime.utcnow() + timedelta(hours=int(os.getenv('JWT_EXPIRATION_HOURS', 24)))
    
    payload = {
        'user_id': user_id,
        'exp': expiration,
        'iat': datetime.utcnow()
    }
    
    token = jwt.encode(
        payload,
        os.getenv('JWT_SECRET_KEY'),
        algorithm='HS256'
    )
    
    return token

def verify_token(token):
    try:
        payload = jwt.decode(
            token,
            os.getenv('JWT_SECRET_KEY'),
            algorithms=['HS256']
        )
        return payload['user_id']
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'message': 'Invalid token format'}), 401
        
        if not token:
            return jsonify({'message': 'Token is missing'}), 401
        
        user_id = verify_token(token)
        
        if user_id is None:
            return jsonify({'message': 'Token is invalid or expired'}), 401
        
        current_user = User.query.get(user_id)
        
        if not current_user:
            return jsonify({'message': 'User not found'}), 401
        
        return f(current_user, *args, **kwargs)
    
    return decorated