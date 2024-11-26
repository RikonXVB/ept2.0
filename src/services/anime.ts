export interface VideoSource {
  sources: {
    url: string;
    quality: string;
    isM3U8: boolean;
  }[];
  subtitles?: {
    url: string;
    lang: string;
  }[];
}

export class AnimeService {
  private baseUrl = 'https://api.amvstr.me/api/v2';

  private getApiHeaders() {
    return {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'Origin': 'https://api.amvstr.me',
      'Referer': 'https://api.amvstr.me/',
      'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'DNT': '1'
    };
  }

  async getAnimeInfo(id: string) {
    try {
      const response = await fetch(`${this.baseUrl}/info/${id}`, {
        method: 'GET',
        headers: this.getApiHeaders(),
        credentials: 'omit',
        mode: 'cors',
        cache: 'no-cache'
      });

      if (!response.ok) {
        console.error(`Ошибка API: ${response.status} - ${response.statusText}`);
        const errorText = await response.text();
        console.error('Ответ сервера:', errorText);
        throw new Error(`API ответил с ошибкой: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Ошибка при получении информации об аниме:', error);
      throw error;
    }
  }

  async getVideoSource(animeId: string, episode: string): Promise<VideoSource> {
    const response = await fetch(`${this.baseUrl}/stream/${animeId}/${episode}`, {
      method: 'GET',
      headers: this.getApiHeaders(),
      credentials: 'omit',
      mode: 'cors',
      cache: 'no-cache'
    });
    
    if (!response.ok) {
      console.error(`Ошибка API: ${response.status} - ${response.statusText}`);
      throw new Error(`API ответил с ошибкой: ${response.status}`);
    }
    
    return await response.json();
  }
} 