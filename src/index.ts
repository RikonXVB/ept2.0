/// <reference types="bun-types" />

import { Elysia } from "elysia";
import { cors } from '@elysiajs/cors';
import { staticPlugin } from '@elysiajs/static';
import { html } from '@elysiajs/html';
import { join } from "path";
import { SocksProxyAgent } from 'socks-proxy-agent';

const ANILIST_API = 'https://graphql.anilist.co';
const ANIWATCH_API = 'https://aniwatch-api-v1-0.onrender.com/api';

// GraphQL запросы
const POPULAR_QUERY = `
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(sort: POPULARITY_DESC, type: ANIME) {
      id
      title {
        romaji
        english
        native
      }
      coverImage {
        large
      }
      format
      episodes
      status
      averageScore
      description
    }
  }
}`;

const SEARCH_QUERY = `
query ($search: String, $page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    media(search: $search, type: ANIME) {
      id
      title {
        romaji
        english
        native
      }
      coverImage {
        large
      }
      format
      episodes
      status
      averageScore
      description
    }
  }
}`;

const ANIME_QUERY = `
query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title {
      romaji
      english
      native
    }
    coverImage {
      large
    }
    bannerImage
    format
    episodes
    status
    averageScore
    description
    genres
    studios {
      nodes {
        name
      }
    }
    startDate {
      year
    }
    duration
    source
    trailer {
      id
      site
    }
    streamingEpisodes {
      title
      thumbnail
      url
    }
  }
}`;

interface Track {
  file: string;
  label: string;
  kind: string;
}

interface Source {
  url: string;
  type: string;
}

interface RestRes {
  tracks: Track[];
  sources: Source[];
}

interface ServerResponse {
  restres: RestRes;
}

// Обновляем интерфейс для эпизода
interface AnilibriaEpisode {
  episode: number;
  name: string | null;
  uuid: string;
  created_timestamp: number;
  preview: string | null;
  skips: {
    opening: number[];
    ending: number[];
  };
  hls: {
    fhd: string | null;
    hd: string | null;
    sd: string | null;
  };
}

// Обновляем функцию получения видео
async function getVideoLinks(id: string, episode: number): Promise<VideoSource> {
  try {
    console.log('Получение данных аниме:', id, 'Эпизод:', episode);
    
    const response = await fetch(`${ANILIBRIA_API}/title?id=${id}`);
    if (!response.ok) {
      throw new Error(`API ответил с ошибкой: ${response.status}`);
    }

    const animeData = await response.json();
    console.log('Данные аниме получены:', animeData.names.ru);

    if (!animeData.player?.list) {
      throw new Error('Плеер недоступен');
    }

    const episodeData = animeData.player.list[episode];
    if (!episodeData) {
      throw new Error(`Эпизод ${episode} не найден`);
    }

    const host = animeData.player.host || 'cache.libria.fun';
    const sources = [];

    // Всегда используем прокси для видео
    if (episodeData.hls.fhd) {
      sources.push({
        url: `/proxy/video/${encodeURIComponent(`https://${host}${episodeData.hls.fhd}`)}`,
        quality: '1080p',
        isM3U8: true
      });
    }
    if (episodeData.hls.hd) {
      sources.push({
        url: `/proxy/video/${encodeURIComponent(`https://${host}${episodeData.hls.hd}`)}`,
        quality: '720p',
        isM3U8: true
      });
    }
    if (episodeData.hls.sd) {
      sources.push({
        url: `/proxy/video/${encodeURIComponent(`https://${host}${episodeData.hls.sd}`)}`,
        quality: '480p',
        isM3U8: true
      });
    }

    return {
      sources,
      name: episodeData.name,
      skips: episodeData.skips,
      preview: episodeData.preview ? `/proxy/video/${encodeURIComponent(`https://${host}${episodeData.preview}`)}` : null
    };

  } catch (error) {
    console.error('Ошибка при получении эпизода:', error);
    throw error;
  }
}

async function fetchAnilist(query: string, variables: any) {
  const response = await fetch(ANILIST_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables
    })
  });

  if (!response.ok) {
    throw new Error('Network response was not ok');
  }

  return response.json();
}

interface AnilibriaListRequest {
  limit?: number;
  page?: number;
  search?: string;
  sort?: string[];
  filter?: string[];
  include?: string[];
}

// Добавим константу для базового URL картинок
const ANILIBRIA_BASE_URL = 'https://api.anilibria.tv';

// Добавим функцию для повторных попыток
async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 секунд таймаут

      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000)); // Ждем 1 секунду между попытками
    }
  }
}

// Обновим функцию getAnilibriaList
async function getAnilibriaList(params: AnilibriaListRequest = {}) {
  try {
    const page = params.page || 1;
    const limit = params.limit || 20;
    
    const response = await fetch(`${ANILIBRIA_API}/title/updates?limit=${limit}&page=${page}`, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`API ответил с ошибкой: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Ошибка получения списка:', error);
    throw error;
  }
}

// В начале файла добавим интерфейс для конфигурации сервера
interface ServerConfig {
  port: number;
  hostname?: string;
  development?: boolean;
}

// Добавим отсутствующие константы в начало файла (после существующих импотв)
const ANILIBRIA_API = 'https://api.anilibria.tv/v3';
const ANILIBRIA_CDN = 'https://static-libria.weekstorm.one';

// Добавим интерфейс VideoSource
interface VideoSource {
  sources: {
    url: string;
    quality: string;
    isM3U8: boolean;
  }[];
  name: string | null;
  skips: {
    opening: number[];
    ending: number[];
  };
  preview: string | null;
}

// Создаем SOCKS5 прокси агента
const proxyAgent = new SocksProxyAgent('socks5://bQnNCTyF:vLP8Kfyw@154.222.207.2:64111');

// Обновим функцию proxyVideo
async function proxyVideo(url: string) {
  try {
    const response = await fetch(url, {
      // @ts-ignore
      agent: proxyAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': '*/*',
        'Origin': 'https://cache.libria.fun',
        'Referer': 'https://cache.libria.fun/',
        'Api-Version': '3.0'
      },
      timeout: 30000 // Увеличиваем тай до 30 секунд
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
        'Content-Length': response.headers.get('Content-Length') || '',
        'Content-Range': response.headers.get('Content-Range') || '',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    console.error('Proxy error:', error);
    return new Response('Proxy error', { status: 500 });
  }
}

// Обновим функцию для получения заголовков API
function getApiHeaders() {
  return {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Origin': 'https://www.anilibria.tv',
    'Referer': 'https://www.anilibria.tv/',
    'Api-Version': '3.0',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
    'Host': 'api.anilibria.tv',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1'
  };
}

// Также обновим функцию makeRequest
async function makeRequest(url: string) {
  try {
    const response = await fetch(url, {
      // @ts-ignore
      agent: proxyAgent,
      headers: getApiHeaders()
    });

    if (!response.ok) {
      throw new Error(`API ответил с ошибкой: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('Ошибка запроса:', error);
    throw error;
  }
}

const allowedOrigins = [
  'http://localhost:3000',
  'https://ept2-0-production.up.railway.app', // Замените на ваш домен
  'https://your-domain.up.railway.app' // Добавьте все нужные домены
];

const app = new Elysia()
  .use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type', 
      'Authorization', 
      'Accept', 
      'Origin', 
      'X-Requested-With',
      'Api-Version',
      'Range'
    ],
    credentials: true
  }))
  .use(html())
  .use(staticPlugin({
    assets: 'src/public',
    prefix: '/'
  }))
  .get("/", () => {
    const filePath = join(import.meta.dir, "public", "index.html");
    const file = Bun.file(filePath);
    return new Response(file);
  })
  .get("/anime/:id", ({ params: { id } }) => {
    if (!/^\d+$/.test(id)) {
      return new Response('Not Found', { status: 404 });
    }
    const filePath = join(import.meta.dir, "public", "anime.html");
    const file = Bun.file(filePath);
    return new Response(file);
  })
  .group("/api", app => app
    .get("/anime/popular", async ({ query }) => {
      try {
        const page = parseInt(query.page as string) || 1;
        const response = await fetch(`${ANILIBRIA_API}/title/updates?limit=20&page=${page}`, {
          headers: getApiHeaders()
        });
        
        if (!response.ok) {
          throw new Error(`API ответил с ошибкой: ${response.status}`);
        }

        const data = await response.json();
        
        return {
          results: data.list.map((anime: any) => ({
            id: anime.id,
            title: anime.names.ru,
            title_en: anime.names.en,
            code: anime.code,
            status: anime.status?.string || 'Неизвестно',
            image: anime.posters?.original?.url ? `${ANILIBRIA_CDN}${anime.posters.original.url}` : null,
            description: anime.description,
            episodes: `${anime.type?.episodes || '?'} эп.`,
            genres: Array.isArray(anime.genres) ? anime.genres : [],
            season: {
              year: anime.season?.year ? parseInt(anime.season.year) : null,
              code: anime.season?.code ? parseInt(anime.season.code) : null,
              string: anime.season?.string || ''
            }
          })),
          hasNextPage: data.list.length === 20 // Если получили полную страницу, значит есть следующая
        };
      } catch (error) {
        console.error('Ошибка получения популярных:', error);
        return { 
          error: true, 
          message: 'Ошибка при загрузке популярных аниме',
          results: [] 
        };
      }
    })
    .get("/anime/search/:query", async ({ params: { query } }) => {
      try {
        const searchQuery = decodeURIComponent(query);
        console.log('Поисковый запрос:', searchQuery);

        const response = await fetch(`${ANILIBRIA_API}/title/search?search=${encodeURIComponent(searchQuery)}&limit=20`, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Origin': 'https://www.anilibria.tv',
            'Referer': 'https://www.anilibria.tv/',
            'Api-Version': '3.0'
          }
        });

        if (!response.ok) {
          throw new Error(`API ответил с ошибкой: ${response.status}`);
        }

        const data = await response.json();
        
        return {
          results: (data.list || []).map((anime: any) => ({
            id: anime.id,
            title: anime.names.ru,
            title_en: anime.names.en,
            code: anime.code,
            status: anime.status?.string || 'Неизвестно',
            image: anime.posters?.original?.url ? `${ANILIBRIA_CDN}${anime.posters.original.url}` : null,
            description: anime.description,
            episodes: `${anime.type?.episodes || '?'} эп.`,
            genres: Array.isArray(anime.genres) ? anime.genres : [],
            season: {
              year: anime.season?.year ? parseInt(anime.season.year) : null,
              code: anime.season?.code ? parseInt(anime.season.code) : null,
              string: anime.season?.string || ''
            }
          }))
        };
      } catch (error) {
        console.error('Ошибка поиска:', error);
        return { 
          error: true, 
          message: error instanceof Error ? error.message : 'Ошибка при поиске',
          results: [] 
        };
      }
    })
    .get("/anime/:id", async ({ params: { id } }) => {
      try {
        const response = await fetch(`${ANILIBRIA_API}/title?id=${id}`, {
          method: 'GET',
          mode: 'cors',
          headers: getApiHeaders(),
          credentials: 'omit'
        });

        if (!response.ok) {
          throw new Error(`API ответил с ошибкой: ${response.status}`);
        }

        const anime = await response.json();
        
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
            genres: anime.genres || [],
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
    .get("/anime/:id/episode/:episode", async ({ params: { id, episode } }) => {
      try {
        const response = await fetch(`${ANILIBRIA_API}/title?id=${id}`, {
          method: 'GET',
          mode: 'cors',
          headers: getApiHeaders(),
          credentials: 'omit'
        });

        if (!response.ok) {
          throw new Error(`API ответил с ошибкой: ${response.status}`);
        }

        const animeData = await response.json();
        
        if (!animeData.player?.list?.[episode]) {
          throw new Error('Эпизод не найден');
        }

        const episodeData = animeData.player.list[episode];
        const host = animeData.player.host || 'cache.libria.fun';

        const sources = [];
        if (episodeData.hls.fhd) {
          sources.push({
            url: `https://${host}${episodeData.hls.fhd}`,
            quality: '1080p',
            isM3U8: true
          });
        }
        if (episodeData.hls.hd) {
          sources.push({
            url: `https://${host}${episodeData.hls.hd}`,
            quality: '720p',
            isM3U8: true
          });
        }
        if (episodeData.hls.sd) {
          sources.push({
            url: `https://${host}${episodeData.hls.sd}`,
            quality: '480p',
            isM3U8: true
          });
        }

        return {
          sources,
          name: episodeData.name,
          skips: episodeData.skips,
          preview: episodeData.preview ? `https://${host}${episodeData.preview}` : null
        };

      } catch (error) {
        console.error('Ошибка при получении эпизода:', error);
        return {
          error: true,
          message: error instanceof Error ? error.message : 'Ошибка при загрузке эпизода'
        };
      }
    })
    .get("/proxy/video/*", async ({ request }) => {
      try {
        // Поучаем полный URL запроса
        const fullUrl = request.url;
        console.log('Full request URL:', fullUrl);

        // Получаем все после /proxy/video/
        const match = fullUrl.match(/\/proxy\/video\/(.*)/);
        if (!match) {
          console.error('No URL found after /proxy/video/');
          return new Response('URL not provided', { status: 400 });
        }

        // Декодируем URL и добавляем протокол, если его нет
        let targetUrl = decodeURIComponent(match[1]);
        if (!targetUrl.startsWith('http')) {
          targetUrl = 'https://' + targetUrl;
        }
        console.log('Target URL:', targetUrl);

        // Делаем запрос через прокси
        const response = await fetch(targetUrl, {
          // @ts-ignore
          agent: proxyAgent,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': '*/*',
            'Origin': 'https://cache.libria.fun',
            'Referer': 'https://cache.libria.fun/',
            'Range': request.headers.get('Range') || ''
          }
        });

        // Создаем заголовки для ответа
        const headers = new Headers({
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream'
        });

        // Копируем важные заголовки
        ['content-length', 'content-range', 'accept-ranges', 'cache-control'].forEach(header => {
          const value = response.headers.get(header);
          if (value) {
            headers.set(header, value);
          }
        });

        // Возвращаем ответ
        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers
        });

      } catch (error) {
        console.error('Proxy error:', error);
        return new Response('Proxy error: ' + (error instanceof Error ? error.message : 'Unknown error'), { 
          status: 500,
          headers: {
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    })
    .get("/anime/filter", async ({ query }) => {
      try {
        const year = query.year ? parseInt(query.year as string) : undefined;
        const season_code = query.season_code ? parseInt(query.season_code as string) : undefined;
        const genres = query.genres as string;
        const page = parseInt(query.page as string) || 1;

        const params = new URLSearchParams();
        params.append('limit', '20'); // Уменьшаем до 20 элементов
        params.append('page', page.toString());
        
        if (year) params.append('year', year.toString());
        if (season_code) params.append('season_code', season_code.toString());
        if (genres) params.append('genres', genres);

        const data = await makeRequest(`${ANILIBRIA_API}/title/search?${params.toString()}`);

        return {
          results: (data.list || []).map((anime: any) => ({
            id: anime.id,
            title: anime.names.ru,
            title_en: anime.names.en,
            code: anime.code,
            status: anime.status?.string || 'Неизвестно',
            image: anime.posters?.original?.url ? `${ANILIBRIA_CDN}${anime.posters.original.url}` : null,
            description: anime.description,
            episodes: `${anime.type?.episodes || '?'} эп.`,
            genres: Array.isArray(anime.genres) ? anime.genres : [],
            season: {
              year: anime.season?.year ? parseInt(anime.season.year) : null,
              code: anime.season?.code ? parseInt(anime.season.code) : null,
              string: anime.season?.string || ''
            }
          })),
          hasNextPage: data.list?.length === 20 // Если получили полную страницу, значит есть следующая
        };
      } catch (error) {
        console.error('Ошибка фильтрации:', error);
        return { 
          error: true, 
          message: error instanceof Error ? error.message : 'Ошибка при фильтрации',
          results: [] 
        };
      }
    })
    .get("/api/anime/genres", async () => {
      try {
        const response = await fetch(`${ANILIBRIA_API}/genres`);
        if (!response.ok) {
          throw new Error(`API ответил с ошибкой: ${response.status}`);
        }
        const data = await response.json();
        return { genres: data };
      } catch (error) {
        console.error('Ошибка получения жанров:', error);
        return { error: true, message: 'Ошибка при загрузке жанров' };
      }
    })
    .get("/api/anime/years", async () => {
      try {
        const response = await fetch(`${ANILIBRIA_API}/years`);
        if (!response.ok) {
          throw new Error(`API ответил с ошибкой: ${response.status}`);
        }
        const data = await response.json();
        return { years: data };
      } catch (error) {
        console.error('Оибка получения годов:', error);
        return { error: true, message: 'Ошибка при загрузке годов' };
      }
    })
  )
  .listen({
    port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    hostname: '0.0.0.0'
  });

console.log(`🦊 Сервер запущен на порту ${process.env.PORT || 3000}`); 