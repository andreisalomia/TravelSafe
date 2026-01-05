import api from './api';

export interface FavoritePlace {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
}

export interface CreateFavoritePayload {
  name: string;
  latitude: number;
  longitude: number;
}

export const favoritesService = {
  async list(): Promise<FavoritePlace[]> {
    const { data } = await api.get<{ favorites: FavoritePlace[] }>('/api/favorites/');
    return data.favorites;
  },

  async create(payload: CreateFavoritePayload): Promise<FavoritePlace> {
    const { data } = await api.post<{ favorite: FavoritePlace }>('/api/favorites/', payload);
    return data.favorite;
  },

  async remove(id: number): Promise<void> {
    await api.delete(`/api/favorites/${id}`);
  }
};
