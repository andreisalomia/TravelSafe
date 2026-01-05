from flask import Blueprint, jsonify, request
from ..auth import token_required
from ..models import Notification
from .. import db

notifications_bp = Blueprint('notifications', __name__)


def _serialize(notification: Notification) -> dict:
    return {
        'id': notification.id,
        'title': notification.title,
        'message': notification.message,
        'is_read': bool(notification.is_read),
        'created_at': notification.created_at.isoformat() if notification.created_at else None
    }


@notifications_bp.route('/', methods=['GET'])
@token_required
def list_notifications(current_user):
    items = (
        Notification.query.filter_by(user_id=current_user.id)
        .order_by(Notification.created_at.desc())
        .all()
    )
    return jsonify({'notifications': [_serialize(n) for n in items]}), 200


@notifications_bp.route('/<int:notification_id>/read', methods=['PATCH'])
@token_required
def mark_notification_read(current_user, notification_id: int):
    notif = Notification.query.filter_by(id=notification_id, user_id=current_user.id).first()
    if not notif:
        return jsonify({'message': 'Notification not found'}), 404
    notif.is_read = 1
    db.session.commit()
    return jsonify({'notification': _serialize(notif)}), 200


@notifications_bp.route('/<int:notification_id>', methods=['DELETE'])
@token_required
def delete_notification(current_user, notification_id: int):
    notif = Notification.query.filter_by(id=notification_id, user_id=current_user.id).first()
    if not notif:
        return jsonify({'message': 'Notification not found'}), 404
    db.session.delete(notif)
    db.session.commit()
    return jsonify({'message': 'Notification deleted'}), 200
