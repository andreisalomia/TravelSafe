import api from './api';

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string | null;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
}

export const notificationsService = {
  async list(): Promise<NotificationItem[]> {
    const { data } = await api.get<NotificationsResponse>('/api/notifications/');
    return data.notifications;
  },

  async markRead(id: number): Promise<NotificationItem> {
    const { data } = await api.patch<{ notification: NotificationItem }>(`/api/notifications/${id}/read`);
    return data.notification;
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/api/notifications/${id}`);
  }
};
