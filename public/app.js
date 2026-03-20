// ===== STATE =====
let deck = [];
let stats = { like: 0, dislike: 0, fav: 0 };
let favorites = [];

// Drag state
let isDragging = false;
let startX = 0, startY = 0, curX = 0, curY = 0;
let activeCard = null;

// DOM refs
const cardStack = document.getElementById('cardStack');
const favGrid = document.getElementById('favGrid');
const hintLeft = document.getElementById('hintLeft');
const hintRight = document.getElementById('hintRight');
const hintDown = document.getElementById('hintDown');
const toast = document.getElementById('toast');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxCaption = document.getElementById('lightboxCaption');

// ===== INIT =====
async function init() {
  try {
    const res = await fetch('/api/images');
    if (!res.ok) throw new Error('Server error');
    const data = await res.json();
    deck = data.images;

    if (deck.length === 0) {
      showEmptyState('Keine Bilder gefunden', 'Lege Bilder im Ordner <code>public/images/</code> ab und lade die Seite neu.');
      return;
    }

    renderStack();
    preloadNext();
  } catch (err) {
    showEmptyState('Verbindungsfehler', 'Server nicht erreichbar. Stelle sicher, dass der Server läuft.');
    console.error(err);
  }
}

// ===== RENDER STACK =====
function renderStack() {
  cardStack.innerHTML = '';

  if (deck.length === 0) {
    showEmptyState('Alle Bilder bewertet! 🎉', `${stats.like} gemocht · ${stats.dislike} abgelehnt · ${stats.fav} Favoriten`);
    return;
  }

  // Draw up to 3 cards (back to front)
  const visible = deck.slice(0, 3);

  visible.slice().reverse().forEach((img, revIdx) => {
    const idx = visible.length - 1 - revIdx; // 0 = front
    const card = createCard(img, idx);
    cardStack.appendChild(card);
  });

  // Attach drag handlers to front card
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
  startX = pt.clientX;
  startY = pt.clientY;
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
    hintDown.style.opacity = Math.min(curY / 100, 1);
    hintLeft.style.opacity = 0;
    hintRight.style.opacity = 0;
  } else if (curX > threshold) {
    hintRight.style.opacity = Math.min(curX / 100, 1);
    hintLeft.style.opacity = 0;
    hintDown.style.opacity = 0;
  } else if (curX < -threshold) {
    hintLeft.style.opacity = Math.min(-curX / 100, 1);
    hintRight.style.opacity = 0;
    hintDown.style.opacity = 0;
  } else {
    hintLeft.style.opacity = 0;
    hintRight.style.opacity = 0;
    hintDown.style.opacity = 0;
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

  if (curY > 110 && curY > ax) {
    animateOut('down', () => applySwipe('fav'));
  } else if (curX > THRESHOLD) {
    animateOut('right', () => applySwipe('like'));
  } else if (curX < -THRESHOLD) {
    animateOut('left', () => applySwipe('dislike'));
  } else {
    // Snap back
    activeCard.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
    activeCard.style.transform = '';
  }
}

function animateOut(dir, callback) {
  if (!activeCard) return;
  const card = activeCard;
  activeCard = null;
  card.style.transition = 'transform 0.38s ease, opacity 0.38s ease';

  if (dir === 'right') card.style.transform = `translate(120vw, ${curY}px) rotate(25deg)`;
  else if (dir === 'left') card.style.transform = `translate(-120vw, ${curY}px) rotate(-25deg)`;
  else card.style.transform = `translate(${curX}px, 100vh) rotate(${curX * 0.05}deg)`;
  card.style.opacity = '0';

  setTimeout(callback, 360);
}

// ===== SWIPE ACTIONS =====
function applySwipe(action) {
  if (deck.length === 0) return;
  const img = deck.shift();

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

// ===== PRELOAD =====
function preloadNext() {
  deck.slice(0, 3).forEach(img => {
    const i = new Image();
    i.src = img.url;
  });
}

// ===== UI HELPERS =====
function updateStats() {
  document.getElementById('count-like').textContent = stats.like;
  document.getElementById('count-dislike').textContent = stats.dislike;
  document.getElementById('count-fav').textContent = stats.fav;
}

function resetHints() {
  hintLeft.style.opacity = 0;
  hintRight.style.opacity = 0;
  hintDown.style.opacity = 0;
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

lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) lightbox.classList.remove('open');
});

// ===== START =====
init();
