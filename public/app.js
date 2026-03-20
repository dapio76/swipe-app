// ===== SESSION =====
// Generate or restore a UUID from localStorage
function getOrCreateSessionId() {
  let id = localStorage.getItem('swipe_session_id');
  if (!id) {
    id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
    localStorage.setItem('swipe_session_id', id);
  }
  return id;
}

const SESSION_ID = getOrCreateSessionId();

// ===== STATE =====
let deck = [];
let stats = { like: 0, dislike: 0, fav: 0 };
let favorites = [];

// Drag state
let isDragging = false;
let startX = 0, startY = 0, curX = 0, curY = 0;
let activeCard = null;

// DOM refs
const cardStack   = document.getElementById('cardStack');
const favGrid     = document.getElementById('favGrid');
const hintLeft    = document.getElementById('hintLeft');
const hintRight   = document.getElementById('hintRight');
const hintDown    = document.getElementById('hintDown');
const toast       = document.getElementById('toast');
const lightbox    = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxCaption = document.getElementById('lightboxCaption');
const sessionBadge    = document.getElementById('sessionBadge');

// ===== INIT =====
async function init() {
  // 1. Restore previous session data from DB
  await restoreSession();

  // 2. Load only unseen images for this session
  try {
    const res = await fetch(`/api/images?session=${SESSION_ID}`);
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();
    deck = data.images;

    if (deck.length === 0 && stats.like + stats.dislike + stats.fav === 0) {
      showEmptyState('Keine Bilder gefunden', 'Lege Bilder im Ordner <code>public/images/</code> ab und lade die Seite neu.');
      return;
    }

    if (deck.length === 0) {
      showEmptyState('Alle Bilder bewertet! 🎉', `${stats.like} gemocht · ${stats.dislike} abgelehnt · ${stats.fav} Favoriten`);
      return;
    }

    renderStack();
    preloadNext();
  } catch (err) {
    showEmptyState('Verbindungsfehler', 'Server nicht erreichbar. Stelle sicher, dass der Server läuft.');
    console.error(err);
  }
}

// ===== RESTORE SESSION =====
async function restoreSession() {
  try {
    const res = await fetch(`/api/session/${SESSION_ID}`);
    if (!res.ok) return;
    const data = await res.json();

    if (data.isReturning) {
      // Restore counters
      stats.like    = data.stats.likes;
      stats.dislike = data.stats.dislikes;
      stats.fav     = data.stats.favs;
      updateStats();

      // Restore favorites gallery
      favorites = data.favorites;
      renderFavorites();

      showToast(`Willkommen zurück! ${data.stats.total} Bewertungen wiederhergestellt.`, '#888');
    }

    // Show short session ID in header
    if (sessionBadge) {
      sessionBadge.textContent = SESSION_ID.slice(0, 8);
      sessionBadge.title = `Session ID: ${SESSION_ID}`;
    }
  } catch (err) {
    console.warn('Could not restore session:', err);
  }
}

// ===== RENDER STACK =====
function renderStack() {
  cardStack.innerHTML = '';

  if (deck.length === 0) {
    showEmptyState('Alle Bilder bewertet! 🎉', `${stats.like} gemocht · ${stats.dislike} abgelehnt · ${stats.fav} Favoriten`);
    return;
  }

  const visible = deck.slice(0, 3);
  visible.slice().reverse().forEach((img, revIdx) => {
    const idx = visible.length - 1 - revIdx;
    const card = createCard(img, idx);
    cardStack.appendChild(card);
  });

  activeCard = cardStack.querySelector('.card-front');
  if (activeCard) bindDrag(activeCard);
}

function createCard(img, stackIdx) {
  const card = document.createElement('div');
  card.className = 'card';
  if (stackIdx === 0) card.classList.add('card-front');
  if (stackIdx === 1) card.classList.add('card-back-1');
  if (stackIdx === 2) card.classList.add('card-back-2');

  const image = document.createElement('img');
  image.src = img.url;
  image.alt = img.title;
  image.loading = 'lazy';
  image.draggable = false;

  const label = document.createElement('div');
  label.className = 'card-label';
  label.innerHTML = `<h3>${img.title}</h3>`;

  card.appendChild(image);
  card.appendChild(label);
  return card;
}

// ===== DRAG / SWIPE =====
function bindDrag(card) {
  card.addEventListener('mousedown', onDragStart);
  card.addEventListener('touchstart', onDragStart, { passive: true });
}

function onDragStart(e) {
  if (deck.length === 0) return;
  isDragging = true;
  const pt = e.touches ? e.touches[0] : e;
  startX = pt.clientX; startY = pt.clientY;
  curX = 0; curY = 0;

  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);
  document.addEventListener('touchmove', onDragMove, { passive: false });
  document.addEventListener('touchend', onDragEnd);
}

function onDragMove(e) {
  if (!isDragging || !activeCard) return;
  if (e.cancelable) e.preventDefault();
  const pt = e.touches ? e.touches[0] : e;
  curX = pt.clientX - startX;
  curY = pt.clientY - startY;
  const rot = curX * 0.07;
  activeCard.style.transform = `translate(${curX}px, ${curY}px) rotate(${rot}deg)`;
  activeCard.style.transition = 'none';
  updateHints();
}

function updateHints() {
  const ax = Math.abs(curX);
  const threshold = 30;
  if (curY > threshold && curY > ax) {
    hintDown.style.opacity  = Math.min(curY / 100, 1);
    hintLeft.style.opacity  = 0;
    hintRight.style.opacity = 0;
  } else if (curX > threshold) {
    hintRight.style.opacity = Math.min(curX / 100, 1);
    hintLeft.style.opacity  = 0;
    hintDown.style.opacity  = 0;
  } else if (curX < -threshold) {
    hintLeft.style.opacity  = Math.min(-curX / 100, 1);
    hintRight.style.opacity = 0;
    hintDown.style.opacity  = 0;
  } else {
    resetHints();
  }
}

function onDragEnd() {
  document.removeEventListener('mousemove', onDragMove);
  document.removeEventListener('mouseup', onDragEnd);
  document.removeEventListener('touchmove', onDragMove);
  document.removeEventListener('touchend', onDragEnd);
  isDragging = false;
  resetHints();
  if (!activeCard) return;

  const ax = Math.abs(curX);
  const THRESHOLD = 90;
  if (curY > 110 && curY > ax)     animateOut('down',  () => applySwipe('fav'));
  else if (curX > THRESHOLD)       animateOut('right', () => applySwipe('like'));
  else if (curX < -THRESHOLD)      animateOut('left',  () => applySwipe('dislike'));
  else {
    activeCard.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
    activeCard.style.transform = '';
  }
}

function animateOut(dir, callback) {
  if (!activeCard) return;
  const card = activeCard;
  activeCard = null;
  card.style.transition = 'transform 0.38s ease, opacity 0.38s ease';
  if (dir === 'right')      card.style.transform = `translate(120vw, ${curY}px) rotate(25deg)`;
  else if (dir === 'left')  card.style.transform = `translate(-120vw, ${curY}px) rotate(-25deg)`;
  else                      card.style.transform = `translate(${curX}px, 100vh) rotate(${curX * 0.05}deg)`;
  card.style.opacity = '0';
  setTimeout(callback, 360);
}

// ===== SWIPE ACTIONS =====
async function applySwipe(action) {
  if (deck.length === 0) return;
  const img = deck.shift();

  // Persist to DB with session ID
  saveRating(img.filename, action);

  if (action === 'like') {
    stats.like++;
    showToast('♥ Gemocht', '#2ecc71');
  } else if (action === 'dislike') {
    stats.dislike++;
    showToast('✕ Abgelehnt', '#e74c3c');
  } else if (action === 'fav') {
    stats.fav++;
    favorites.unshift(img);
    renderFavorites();
    showToast('★ Als Favorit gespeichert!', '#f39c12');
  }

  updateStats();
  renderStack();
  preloadNext();
}

async function saveRating(filename, action) {
  try {
    const res = await fetch('/api/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: SESSION_ID, filename, action }),
    });
    if (!res.ok) console.warn('Rating not saved:', await res.json());
  } catch (err) {
    console.warn('Network error while saving rating:', err);
  }
}

// Button actions
document.getElementById('btnLike').addEventListener('click', () => {
  if (deck.length === 0 || isDragging) return;
  animateOut('right', () => applySwipe('like'));
});
document.getElementById('btnDislike').addEventListener('click', () => {
  if (deck.length === 0 || isDragging) return;
  animateOut('left', () => applySwipe('dislike'));
});
document.getElementById('btnFav').addEventListener('click', () => {
  if (deck.length === 0 || isDragging) return;
  animateOut('down', () => applySwipe('fav'));
});

// ===== STATS PANEL =====
const statsToggle = document.getElementById('statsToggle');
const statsPanel  = document.getElementById('statsPanel');
const topGrid     = document.getElementById('topGrid');
const recentList  = document.getElementById('recentList');

statsToggle.addEventListener('click', () => {
  const isOpen = statsPanel.classList.toggle('open');
  statsToggle.setAttribute('aria-expanded', isOpen);
  if (isOpen) loadStatsPanel();
});

async function loadStatsPanel() {
  try {
    const res = await fetch('/api/stats/top?limit=12');
    renderTopGrid((await res.json()).images);
  } catch { topGrid.innerHTML = '<p class="stats-error">Fehler beim Laden</p>'; }

  try {
    const res = await fetch('/api/stats/recent?limit=15');
    renderRecentList((await res.json()).ratings);
  } catch { recentList.innerHTML = '<p class="stats-error">Fehler beim Laden</p>'; }
}

function renderTopGrid(images) {
  if (!images || images.length === 0) {
    topGrid.innerHTML = '<p class="stats-empty">Noch keine Bewertungen</p>';
    return;
  }
  topGrid.innerHTML = '';
  images.forEach((img, i) => {
    const item = document.createElement('div');
    item.className = 'top-item';
    item.innerHTML = `
      <div class="top-rank">#${i + 1}</div>
      <img src="${img.url}" alt="${img.title}" loading="lazy" />
      <div class="top-info">
        <div class="top-title">${img.title}</div>
        <div class="top-badges">
          <span class="badge badge-like">♥ ${img.likes}</span>
          <span class="badge badge-fav">★ ${img.favs}</span>
          <span class="badge badge-dislike">✕ ${img.dislikes}</span>
        </div>
      </div>`;
    topGrid.appendChild(item);
  });
}

function renderRecentList(ratings) {
  if (!ratings || ratings.length === 0) {
    recentList.innerHTML = '<p class="stats-empty">Noch keine Bewertungen</p>';
    return;
  }
  recentList.innerHTML = '';
  const actionMap = { like: { icon: '♥', cls: 'like' }, dislike: { icon: '✕', cls: 'dislike' }, fav: { icon: '★', cls: 'fav' } };
  ratings.forEach(r => {
    const a     = actionMap[r.action] || { icon: '?', cls: '' };
    const title = r.filename.replace(/[-_]/g, ' ').replace(/\.[^.]+$/, '');
    const date  = new Date(r.rated_at + 'Z').toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
    const li    = document.createElement('div');
    li.className = 'recent-item';
    li.innerHTML = `
      <span class="recent-action badge badge-${a.cls}">${a.icon}</span>
      <span class="recent-title">${title}</span>
      <span class="recent-date">${date}</span>`;
    recentList.appendChild(li);
  });
}

// ===== PRELOAD =====
function preloadNext() {
  deck.slice(0, 3).forEach(img => { new Image().src = img.url; });
}

// ===== UI HELPERS =====
function updateStats() {
  document.getElementById('count-like').textContent    = stats.like;
  document.getElementById('count-dislike').textContent = stats.dislike;
  document.getElementById('count-fav').textContent     = stats.fav;
}

function resetHints() {
  hintLeft.style.opacity  = 0;
  hintRight.style.opacity = 0;
  hintDown.style.opacity  = 0;
}

function renderFavorites() {
  document.getElementById('favCount').textContent = favorites.length;
  if (favorites.length === 0) {
    favGrid.innerHTML = '<div class="fav-empty">Noch keine Favoriten</div>';
    return;
  }
  favGrid.innerHTML = '';
  favorites.forEach(img => {
    const item = document.createElement('div');
    item.className = 'fav-item';
    item.innerHTML = `<img src="${img.url}" alt="${img.title}" loading="lazy" />`;
    item.addEventListener('click', () => openLightbox(img));
    favGrid.appendChild(item);
  });
}

function showEmptyState(title, subtitle) {
  cardStack.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">✓</div>
      <h3>${title}</h3>
      <p>${subtitle}</p>
    </div>`;
}

function showToast(msg, color) {
  toast.textContent = msg;
  toast.style.color = color;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function openLightbox(img) {
  lightboxImg.src = img.url;
  lightboxCaption.textContent = img.title;
  lightbox.classList.add('open');
}

document.getElementById('lightboxClose').addEventListener('click', () => {
  lightbox.classList.remove('open');
});
lightbox.addEventListener('click', e => {
  if (e.target === lightbox) lightbox.classList.remove('open');
});

// ===== START =====
init();
