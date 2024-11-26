import { Elysia } from "elysia";

const ANILIBRIA_API = 'https://api.anilibria.tv/v3';
const ANILIBRIA_CDN = 'https://static-libria.weekstorm.one';

// Создаем базовый набор параметров для API
const BASE_FILTER_PARAMS = [
  'id',
  'names',
  'posters',
  'description',
  'type',
  'status',
  'season',
  'player'
].join(',');

export const animeRoutes = new Elysia({ prefix: '/api' })
  .get('/anime/:id', async ({ params }) => {
    try {
      // Используем только базовые параметры
      const response = await fetch(`${ANILIBRIA_API}/title?id=${params.id}&filter=${BASE_FILTER_PARAMS}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Origin': 'https://www.anilibria.tv',
          'Referer': 'https://www.anilibria.tv/',
          'Api-Version': '3.0'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`API ответ: ${response.status}`, errorText);
        return { 
          error: true, 
          message: `Ошибка API: ${response.status}` 
        };
      }

      const anime = await response.json();
      
      if (!anime || !anime.names) {
        return { 
          error: true, 
          message: 'Некорректный формат данных от API' 
        };
      }

      // Формируем ответ без использования genres
      return {
        info: {
          title: anime.names.ru,
          title_en: anime.names.en,
          title_japanese: anime.names.alternative,
          synopsis: anime.description,
          image: anime.posters?.original?.url ? `${ANILIBRIA_CDN}${anime.posters.original.url}` : null,
          type: anime.type?.full_string || '',
          episodes: anime.type?.episodes || '?',
          status: anime.status?.string || 'Неизвестно',
          year: anime.season?.year,
          genres: [], // Всегда возвращаем пустой массив
          season: {
            year: anime.season?.year,
            string: anime.season?.string
          }
        },
        episodes: Object.entries(anime.player?.list || {}).map(([episodeNum, episodeData]: [string, any]) => ({
          id: episodeNum,
          title: episodeData.name,
          episode: parseInt(episodeNum),
          preview: episodeData.preview ? `${anime.player.host || 'cache.libria.fun'}${episodeData.preview}` : null
        })).sort((a, b) => a.episode - b.episode)
      };
    } catch (error) {
      console.error("Anime info error:", error);
      return { 
        error: true, 
        message: error instanceof Error ? error.message : 'Ошибка при загрузке информации об аниме'
      };
    }
  })
  .get('/anime/:id/episodes/:episode', async ({ params }) => {
    try {
      const response = await fetch(`${ANILIBRIA_API}/title?id=${params.id}&filter=player`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Origin': 'https://www.anilibria.tv',
          'Referer': 'https://www.anilibria.tv/',
          'Api-Version': '3.0'
        }
      });

      if (!response.ok) {
        throw new Error(`API ответил с ошибкой: ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      return { error: 'Failed to fetch episode data' };
    }
  });