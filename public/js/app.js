const contentArea = document.getElementById('contentArea');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const refreshBtn = document.getElementById('refreshBtn');
const filterBtn = document.getElementById('filterBtn');
const filterPanel = document.getElementById('filterPanel');
const daysFilter = document.getElementById('daysFilter');
const fuzzySearch = document.getElementById('fuzzySearch');

const routeCategoryMap = {
  '/advisories': 'advisories',
  '/indicators': 'iocs',
  '/research': 'research',
};

const state = {
  articles: [],
  loading: false,
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString();
}

function getCurrentCategory() {
  return routeCategoryMap[window.location.pathname] || null;
}

function showLoading() {
  state.loading = true;
  contentArea.innerHTML = `
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p>Loading threat intelligence...</p>
    </div>
  `;
}

function showError(message) {
  state.loading = false;
  contentArea.innerHTML = `
    <div class="error-state">
      <h3>Unable to load feed data</h3>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function applyRouteFilter(articles) {
  const category = getCurrentCategory();
  if (!category) return articles;
  return articles.filter((article) => article.category === category);
}

function renderArticles(articles) {
  state.loading = false;

  if (!articles.length) {
    contentArea.innerHTML = `
      <div class="empty-state">
        <h3>No articles found</h3>
        <p>Try refreshing feeds or adjusting your search and filters.</p>
      </div>
    `;
    return;
  }

  const cards = articles
    .map((article) => {
      const title = escapeHtml(article.title || 'Untitled');
      const summary = escapeHtml(article.summary || '').slice(0, 450);
      const source = escapeHtml(article.source || article.source_id || 'Unknown source');
      const category = escapeHtml(article.category || 'uncategorized');
      const link = escapeHtml(article.link || '#');
      const published = formatDate(article.published);

      return `
        <article class="threat-card">
          <div class="threat-card-header">
            <span class="source-badge">${source}</span>
            <span class="category-badge">${category}</span>
          </div>
          <h3 class="threat-title">${title}</h3>
          <p class="threat-summary">${summary}</p>
          <div class="threat-meta">
            <span class="published-date">${escapeHtml(published)}</span>
            <a href="${link}" class="threat-link" target="_blank" rel="noopener noreferrer">Open</a>
          </div>
        </article>
      `;
    })
    .join('');

  contentArea.innerHTML = `<section class="threat-grid">${cards}</section>`;
}

async function fetchArticles() {
  showLoading();
  try {
    const response = await fetch('/api/feeds');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    state.articles = Array.isArray(data) ? data : [];
    renderArticles(applyRouteFilter(state.articles));
  } catch (error) {
    showError(error instanceof Error ? error.message : 'Unknown error');
  }
}

async function performSearch() {
  const query = searchInput.value.trim();
  const days = Number(daysFilter.value || 30);
  const fuzzy = Boolean(fuzzySearch.checked);

  if (!query) {
    renderArticles(applyRouteFilter(state.articles));
    return;
  }

  showLoading();

  try {
    const params = new URLSearchParams({
      q: query,
      days: String(days),
      fuzzy: String(fuzzy),
    });

    const response = await fetch(`/api/search?${params.toString()}`);
    if (!response.ok) {
      const message = response.status === 400 ? 'Search must be at least 3 characters' : `HTTP ${response.status}`;
      throw new Error(message);
    }

    const data = await response.json();
    const results = Array.isArray(data) ? data : [];
    renderArticles(applyRouteFilter(results));
  } catch (error) {
    showError(error instanceof Error ? error.message : 'Search failed');
  }
}

function initializeInteractions() {
  searchBtn?.addEventListener('click', () => {
    void performSearch();
  });

  searchInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void performSearch();
    }
  });

  refreshBtn?.addEventListener('click', () => {
    void fetchArticles();
  });

  filterBtn?.addEventListener('click', () => {
    if (!filterPanel) return;
    filterPanel.style.display = filterPanel.style.display === 'none' ? 'flex' : 'none';
  });

  daysFilter?.addEventListener('change', () => {
    if (searchInput.value.trim()) {
      void performSearch();
    }
  });

  fuzzySearch?.addEventListener('change', () => {
    if (searchInput.value.trim()) {
      void performSearch();
    }
  });
}

function setActiveNav() {
  const pathname = window.location.pathname;
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('active', item.getAttribute('href') === pathname || (pathname === '/' && item.getAttribute('href') === '/'));
  });
}

function bootstrap() {
  setActiveNav();
  initializeInteractions();
  void fetchArticles();
}

bootstrap();
