const API_BASE_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3000/api'
    : 'https://ept20-production.up.railway.app/api';

let player = null;
let currentAnime = null;
let currentAnimeList = []; // Сохраняем полный список аниме
let currentPage = 1;
let isLoading = false;
let hasMore = true;

let filterPage = 1;
let isFilterLoading = false;
let hasMoreFilterResults = true;

async function loadPopularAnime(page = 1) {
    if (isLoading || !hasMore) return;
    
    isLoading = true;
    const container = document.querySelector('.anime-grid');
    
    try {
        const response = await fetchWithErrorHandling(`${API_BASE_URL}/anime/popular?page=${page}`);
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.message);
        }

        // Добавляем новые карточки к существующим
        data.results.forEach(anime => {
            const card = createAnimeCard(anime);
            container.appendChild(card);
        });

        hasMore = data.hasNextPage;
        currentPage = page;
        
    } catch (error) {
        console.error('Error:', error);
        if (page === 1) {
            container.innerHTML = `
                <div class="error">
                    <i class="fas fa-exclamation-circle"></i>
                    ${error.message || 'Произошла ошибка при загрузке'}
                </div>
            `;
        }
    } finally {
        isLoading = false;
    }
}

let searchTimeout;

async function searchAnime() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) {
        loadPopularAnime();
        return;
    }

    const container = document.querySelector('.anime-grid');
    container.innerHTML = `
        <div class="loading">
            <div class="loading-spinner"></div>
            <div>Поиск аниме...</div>
        </div>
    `;

    try {
        const response = await fetchWithErrorHandling(`${API_BASE_URL}/anime/search/${encodeURIComponent(query)}`);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.message);
        }

        if (data.results && data.results.length > 0) {
            container.innerHTML = '';
            data.results.forEach(anime => {
                const card = createAnimeCard(anime);
                container.appendChild(card);
            });
        } else {
            container.innerHTML = `
                <div class="message-container">
                    <div class="error">
                        <i class="fas fa-search"></i>
                        Ничего не найдено
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error:', error);
        container.innerHTML = `
            <div class="message-container">
                <div class="error">
                    <i class="fas fa-exclamation-circle"></i>
                    Ошибка при поиске: ${error.message}
                </div>
            </div>
        `;
    }
}

// Добавляем обработчики событий для поиска
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Инициализируем поиск
        const searchInput = document.getElementById('searchInput');
        const searchButton = document.querySelector('.search-button');

        searchInput?.addEventListener('input', searchAnime);
        searchButton?.addEventListener('click', searchAnime);
        searchInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                searchAnime();
            }
        });

        // Загружаем начальные данные
        await loadPopularAnime(1);
        
        // Инициализируем фильтры
        await initializeFilters();
    } catch (error) {
        console.error('Initialization error:', error);
    }
});

function displayResults(results) {
    const container = document.getElementById('animeList');
    container.innerHTML = results.map(anime => `
        <div class="anime-card" onclick="location.href='/anime/${anime.id}'">
            <div class="anime-card-image">
                <img 
                    src="${anime.image || './placeholder.jpg'}" 
                    alt="${anime.title}"
                    onerror="this.onerror=null; this.src='./placeholder.jpg';"
                    loading="lazy"
                >
                <div class="anime-status">${anime.status}</div>
                ${anime.episodes ? `<div class="anime-episodes-count">${anime.episodes}</div>` : ''}
            </div>
            <div class="anime-info">
                <div class="anime-title">${anime.title}</div>
                ${anime.title_en ? `<div class="anime-title-en">${anime.title_en}</div>` : ''}
                <div class="anime-season">
                    ${anime.season?.year ? `${anime.season.year} ` : ''}${anime.season?.string || ''}
                </div>
                ${anime.genres?.length ? `
                    <div class="anime-genres">
                        ${anime.genres.slice(0, 3).join(' • ')}
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// Загружаем популярные аниме при загрузке страницы
document.addEventListener('DOMContentLoaded', loadPopularAnime); 

async function applyFilters(page = 1) {
    if (isFilterLoading || (page > 1 && !hasMoreFilterResults)) return;
    
    isFilterLoading = true;
    const container = document.querySelector('.anime-grid');
    
    if (page === 1) {
        container.innerHTML = `
            <div class="loading">
                <div class="loading-spinner"></div>
                <div>Применение фильтров...</div>
            </div>
        `;
    }

    try {
        const genreFilter = document.getElementById('genreFilter').value;
        const yearFilter = document.getElementById('yearFilter').value;
        const seasonFilter = document.getElementById('seasonFilter').value;

        const params = new URLSearchParams();
        if (yearFilter) params.append('year', yearFilter);
        if (seasonFilter) params.append('season_code', seasonFilter);
        if (genreFilter) params.append('genres', genreFilter);
        params.append('page', page.toString());

        const response = await fetchWithErrorHandling(`${API_BASE_URL}/anime/filter?${params}`);
        const data = await response.json();

        if (data.error) {
            throw new Error(data.message);
        }

        if (data.results && data.results.length > 0) {
            if (page === 1) {
                container.innerHTML = '';
            }
            
            data.results.forEach(anime => {
                const card = createAnimeCard(anime);
                container.appendChild(card);
            });

            filterPage = page;
            hasMoreFilterResults = data.hasNextPage;
        } else if (page === 1) {
            container.innerHTML = `
                <div class="message-container">
                    <div class="error">
                        <i class="fas fa-filter"></i>
                        Ничего не найдено с выбранными фильтрами
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error:', error);
        if (page === 1) {
            container.innerHTML = `
                <div class="message-container">
                    <div class="error">
                        <i class="fas fa-exclamation-circle"></i>
                        Ошибка при применении фильтров: ${error.message}
                    </div>
                </div>
            `;
        }
    } finally {
        isFilterLoading = false;
    }
}

// Обновим загрузку фильтров
document.addEventListener('DOMContentLoaded', async () => {
    const genreFilter = document.getElementById('genreFilter');
    const yearFilter = document.getElementById('yearFilter');
    const seasonFilter = document.getElementById('seasonFilter');

    try {
        // Загрузим начальные значения фильтров
        const response = await fetchWithErrorHandling(`${API_BASE_URL}/anime/genres`);
        const data = await response.json();
        if (data && Array.isArray(data.genres)) {
            genreFilter.innerHTML = '<option value="">Все жанры</option>' + 
                data.genres.sort().map(genre => 
                    `<option value="${genre}">${genre}</option>`
                ).join('');
        }
    } catch (error) {
        console.error('Ошибка загрузки жанров:', error);
    }

    // Создадим список годов от 1990 до текущего года
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: currentYear - 1990 + 1 }, (_, i) => currentYear - i);
    yearFilter.innerHTML = '<option value="">Все годы</option>' + 
        years.map(year => `<option value="${year}">${year}</option>`).join('');

    // Обновим список сезонов
    const seasons = [
        { code: 1, name: 'Зима' },
        { code: 2, name: 'Весна' },
        { code: 3, name: 'Лето' },
        { code: 4, name: 'Осень' }
    ];
    
    seasonFilter.innerHTML = '<option value="">Все сезоны</option>' + 
        seasons.map(season => 
            `<option value="${season.code}">${season.name}</option>`
        ).join('');

    // Добавим обработчики изменения фильтров
    genreFilter.addEventListener('change', () => applyFilters(1));
    yearFilter.addEventListener('change', () => applyFilters(1));
    seasonFilter.addEventListener('change', () => applyFilters(1));
});

// Обновим функцию updateFilterOptions для годов
function updateFilterOptions() {
    const years = new Set();
    const seasons = new Map([
        [1, 'Зима'],
        [2, 'Весна'],
        [3, 'Лето'],
        [4, 'Осень']
    ]);

    // Получаем список годов из API
    fetch(`${ANILIBRIA_API}/years`)
        .then(response => response.json())
        .then(data => {
            if (data && Array.isArray(data)) {
                const yearFilter = document.getElementById('yearFilter');
                yearFilter.innerHTML = '<option value="">Все годы</option>' + 
                    data.sort((a, b) => b - a).map(year => 
                        `<option value="${year}">${year}</option>`
                    ).join('');
            }
        })
        .catch(error => console.error('Ошибка загрузки годов:', error));

    // Обновляем список сезонов
    const seasonFilter = document.getElementById('seasonFilter');
    seasonFilter.innerHTML = '<option value="">Все сезоны</option>' + 
        Array.from(seasons.entries())
            .map(([code, name]) => `<option value="${code}">${name}</option>`)
            .join('');
}

// Обновим функцию createAnimeCard
function createAnimeCard(anime) {
    const card = document.createElement('div');
    card.className = 'anime-card';
    card.onclick = () => location.href = `/anime/${anime.id}`;
    
    card.innerHTML = `
        <div class="anime-card-inner">
            <div class="anime-card-image">
                <img 
                    src="${anime.image || './placeholder.jpg'}" 
                    alt="${anime.title}"
                    onerror="this.onerror=null; this.src='./placeholder.jpg';"
                    loading="lazy"
                >
                <div class="anime-status">${anime.status}</div>
                ${anime.episodes ? `<div class="anime-episodes-count">${anime.episodes}</div>` : ''}
            </div>
            <div class="anime-info">
                <div class="anime-title">${anime.title}</div>
                ${anime.title_en ? `<div class="anime-title-en">${anime.title_en}</div>` : ''}
                <div class="anime-season">
                    ${anime.season?.year ? `${anime.season.year} ` : ''}${anime.season?.string || ''}
                </div>
                ${anime.genres?.length ? `
                    <div class="anime-genres">
                        ${anime.genres.slice(0, 3).join(' • ')}
                    </div>
                ` : ''}
            </div>
        </div>
    `;
    
    return card;
}

// Обновим обработчик прокрутки
window.addEventListener('scroll', () => {
    if ((window.innerHeight + window.scrollY) >= document.documentElement.scrollHeight - 500) {
        // Если есть активные фильтры, загружаем следующую страницу фильтрованных результатов
        if (document.getElementById('genreFilter').value || 
            document.getElementById('yearFilter').value || 
            document.getElementById('seasonFilter').value) {
            applyFilters(filterPage + 1);
        } else {
            // Иначе загружаем следующую страницу обычных результатов
            loadPopularAnime(currentPage + 1);
        }
    }
});

// Инициализация первой загрузки
loadPopularAnime(1); 

// Функция для получения заголовков API
function getApiHeaders() {
    const headers = {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Origin': 'https://www.anilibria.tv',
        'Referer': 'https://www.anilibria.tv/',
        'Api-Version': '3.0',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7'
    };

    // Добавляем CORS заголовки если не локальный хост
    if (window.location.hostname !== 'localhost') {
        headers['Access-Control-Allow-Origin'] = '*';
        headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
        headers['Access-Control-Allow-Headers'] = 'Content-Type, Api-Version';
    }

    return headers;
}

// Добавим обработку ошибок для всех fetch запросов
async function fetchWithErrorHandling(url, options = {}) {
    try {
        console.log('Fetching URL:', url); // Для отладки
        
        const response = await fetch(url, {
            ...options,
            headers: {
                ...getApiHeaders(),
                ...(options.headers || {})
            },
            mode: 'cors',
            credentials: 'omit'
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error:', {
                status: response.status,
                statusText: response.statusText,
                errorText
            });
            throw new Error(`API ответил с ошибкой: ${response.status} ${errorText}`);
        }

        return response;
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
} 