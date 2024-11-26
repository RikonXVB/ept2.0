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

        if (searchInput && searchButton) {
            searchInput.addEventListener('input', searchAnime);
            searchButton.addEventListener('click', searchAnime);
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    searchAnime();
                }
            });
        }

        // Сначала загружаем фильтры
        await initializeFilters();
        
        // Затем загружаем данные
        await loadPopularAnime(1);
    } catch (error) {
        console.error('Initialization error:', error);
        const container = document.querySelector('.anime-grid');
        if (container) {
            container.innerHTML = `
                <div class="error">
                    <i class="fas fa-exclamation-circle"></i>
                    Ошибка при инициализации: ${error.message}
                </div>
            `;
        }
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
// document.addEventListener('DOMContentLoaded', loadPopularAnime); 

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

// Добавим функцию инициализации фильтров
async function initializeFilters() {
    const genreFilter = document.getElementById('genreFilter');
    const yearFilter = document.getElementById('yearFilter');
    const seasonFilter = document.getElementById('seasonFilter');

    try {
        // Загружаем жанры
        const response = await fetchWithErrorHandling(`${API_BASE_URL}/anime/genres`);
        const data = await response.json();
        if (data && Array.isArray(data.genres)) {
            genreFilter.innerHTML = '<option value="">Все жанры</option>' + 
                data.genres.sort().map(genre => 
                    `<option value="${genre}">${genre}</option>`
                ).join('');
        }

        // Создаем список годов
        const currentYear = new Date().getFullYear();
        const years = Array.from({ length: currentYear - 1990 + 1 }, (_, i) => currentYear - i);
        yearFilter.innerHTML = '<option value="">Все годы</option>' + 
            years.map(year => `<option value="${year}">${year}</option>`).join('');

        // Создаем список сезонов
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

        // Добавляем обработчики
        genreFilter?.addEventListener('change', () => applyFilters(1));
        yearFilter?.addEventListener('change', () => applyFilters(1));
        seasonFilter?.addEventListener('change', () => applyFilters(1));

    } catch (error) {
        console.error('Error initializing filters:', error);
    }
}

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
    return {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Origin': 'https://www.anilibria.tv',
        'Referer': 'https://www.anilibria.tv/',
        'Api-Version': '3.0'
    };
}

// Добавим обработку ошибок для всех fetch запросов
async function fetchWithErrorHandling(url, options = {}) {
    try {
        console.log('Fetching URL:', url);
        
        const response = await fetch(url, {
            ...options,
            headers: {
                ...getApiHeaders(),
                ...(options.headers || {})
            },
            mode: 'cors'
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error:', {
                status: response.status,
                statusText: response.statusText,
                errorText
            });
            throw new Error(`API ответил с ошибкой: ${response.status}`);
        }

        return response;
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
} 