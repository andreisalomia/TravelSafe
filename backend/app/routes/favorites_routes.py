from flask import Blueprint, jsonify, request
from ..auth import token_required
from ..models import UserFavorite
from ..validators import validate_coordinates
from .. import db

favorites_bp = Blueprint('favorites', __name__)


def _serialize_favorite(favorite: UserFavorite) -> dict:
    return {
        'id': favorite.id,
        'name': favorite.name,
        'latitude': favorite.latitude,
        'longitude': favorite.longitude
    }


@favorites_bp.route('/', methods=['GET'])
@token_required
def list_favorites(current_user):
    favorites = (
        UserFavorite.query.filter_by(user_id=current_user.id)
        .order_by(UserFavorite.id.desc())
        .all()
    )
    return jsonify({'favorites': [_serialize_favorite(fav) for fav in favorites]}), 200


@favorites_bp.route('/', methods=['POST'])
@token_required
def create_favorite(current_user):
    payload = request.get_json() or {}

    name = (payload.get('name') or '').strip()
    latitude = payload.get('latitude')
    longitude = payload.get('longitude')

    valid_coords, coord_msg = validate_coordinates(latitude, longitude)
    if not valid_coords:
        return jsonify({'message': coord_msg}), 400

    if not name:
        name = 'Favorite place'
    if len(name) > 100:
        return jsonify({'message': 'Name must be at most 100 characters'}), 400

    latitude = float(latitude)
    longitude = float(longitude)

    existing = UserFavorite.query.filter_by(
        user_id=current_user.id,
        latitude=latitude,
        longitude=longitude
    ).first()
    if existing:
        return jsonify({'message': 'Favorite already exists at these coordinates'}), 409

    try:
        favorite = UserFavorite(
            user_id=current_user.id,
            name=name,
            latitude=latitude,
            longitude=longitude
        )
        db.session.add(favorite)
        db.session.commit()
        return jsonify({'favorite': _serialize_favorite(favorite)}), 201
    except Exception as exc:
        db.session.rollback()
        return jsonify({'message': f'Unable to save favorite: {exc}'}), 500


@favorites_bp.route('/<int:favorite_id>', methods=['DELETE'])
@token_required
def delete_favorite(current_user, favorite_id: int):
    favorite = UserFavorite.query.filter_by(
        id=favorite_id,
        user_id=current_user.id
    ).first()

    if not favorite:
        return jsonify({'message': 'Favorite not found'}), 404

    try:
        db.session.delete(favorite)
        db.session.commit()
        return jsonify({'message': 'Favorite deleted'}), 200
    except Exception as exc:
        db.session.rollback()
        return jsonify({'message': f'Unable to delete favorite: {exc}'}), 500
