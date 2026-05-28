const TOTAL_CARDS = 37;
const POSITIONS = 10;
const HIGH_POSITIONS = new Set([1, 2, 3, 4, 5]);
const LOW_POSITIONS = new Set([6, 7, 8, 9, 10]);
const SPECIAL_POSITIONS = new Set([4, 9]);

let deck = [];
let phase = 'intro';
let mode = 'sequential';
let firstPlaced = [];
let markedCards = new Set();
let finalPlaced = [];
let revealedPositions = new Set();
let baptismIndex = 0;
let shuffledGestures = 0;

const $ = (id) => document.getElementById(id);

const LOGIN_USER = 'nat';
const LOGIN_PASSWORD_SHA256 = '4dd3718c42c131a291e60eedbe701b04c3501025e3158dfd4e4869f3484a47a4';

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function unlockDemo() {
  $('loginGate').classList.add('hidden');
  $('appRoot').classList.remove('locked');
  $('appRoot').removeAttribute('aria-hidden');
}

$('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const user = $('loginUser').value.trim();
  const pass = $('loginPass').value;
  const hash = await sha256(pass);
  if (user === LOGIN_USER && hash === LOGIN_PASSWORD_SHA256) {
    unlockDemo();
  } else {
    $('loginError').textContent = 'Credenziali non corrette';
  }
});

sessionStorage.removeItem('natDemoUnlocked');

const instruction = $('instruction');
const deckEl = $('deck');
const layoutEl = $('layout');
const spreadEl = $('spread');
const baptismEl = $('baptism');
const primaryBtn = $('primaryBtn');
const modeBtn = $('modeBtn');
const resetBtn = $('resetBtn');
const canvas = $('signature');
const ctx = canvas.getContext('2d');
const cardModal = $('cardModal');
const largeCard = $('largeCard');
const modalPosition = $('modalPosition');
const modalHint = $('modalHint');
const readingText = $('readingText');
const readBtn = $('readBtn');
const closeModalBtn = $('closeModalBtn');
let activeReading = null;

function newDeck() {
  return Array.from({ length: TOTAL_CARDS }, (_, i) => ({ id: i + 1, mark: null }));
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

function positionKind(position) {
  if (SPECIAL_POSITIONS.has(position)) return position === 4 ? 'speciale alta' : 'speciale bassa';
  if (HIGH_POSITIONS.has(position)) return 'alta';
  if (LOW_POSITIONS.has(position)) return 'bassa';
  return '';
}

function currentPlaced() {
  return ['secondDeal', 'reveal', 'done'].includes(phase) ? finalPlaced : firstPlaced;
}

function setPhase(next) {
  phase = next;
  deckEl.classList.remove('shuffling');
  layoutEl.classList.toggle('hidden', !['layout', 'baptism', 'secondDeal', 'reveal', 'done'].includes(phase));
  spreadEl.classList.add('hidden');
  baptismEl.classList.add('hidden');
  cardModal.classList.add('hidden');

  if (phase === 'shuffle') {
    primaryBtn.textContent = 'Ho mischiato';
    instruction.textContent = 'Prima mischiata: trascina il dito sul mazzo alcune volte. Quando senti che basta, continua.';
  }
  if (phase === 'cut') {
    primaryBtn.textContent = 'Taglia qui';
    instruction.textContent = 'Tocca un punto del mazzo per dividerlo. Il mazzo verrà ricomposto invertendo le due parti.';
  }
  if (phase === 'layout') {
    primaryBtn.textContent = mode === 'sequential' ? 'Pesca prossima carta' : 'Apri ventaglio';
    instruction.textContent = mode === 'sequential'
      ? 'Prima disposizione: pesca dalla cima e riempi le posizioni 1→10.'
      : 'Prima disposizione: apri il mazzo a ventaglio e scegli una carta coperta per la prossima posizione.';
    renderLayout();
  }
  if (phase === 'baptism') {
    primaryBtn.textContent = 'Conferma segno';
    instruction.textContent = 'Battezza le 10 carte nell’ordine 1→10. Puoi disegnare col dito o usare il cerchio rapido.';
    baptismEl.classList.remove('hidden');
    updateBaptism();
    renderLayout();
  }
  if (phase === 'finalShuffle') {
    primaryBtn.textContent = 'Ho rimischiato bene';
    instruction.textContent = 'Le 10 carte battezzate rientrano nel mazzo. Mischia molto bene una seconda volta. Questa volta non si taglia.';
    layoutEl.classList.add('hidden');
  }
  if (phase === 'secondDeal') {
    primaryBtn.textContent = 'Guarda prossima carta';
    instruction.textContent = 'Seconda estrazione: guarda il retro delle carte dall’alto. Quando esce una carta battezzata, viene posta nella prossima posizione 1→10.';
    renderLayout();
  }
  if (phase === 'reveal') {
    primaryBtn.textContent = 'Ricomincia';
    instruction.textContent = 'Le 10 carte sono disposte. Ora l’utente può girarle nell’ordine che preferisce. 4 e 9 sono le posizioni più importanti.';
    renderLayout();
  }
  if (phase === 'done') {
    primaryBtn.textContent = 'Ricomincia';
    instruction.textContent = 'Prototipo completato.';
    renderLayout();
  }
}


function renderLayout() {
  layoutEl.innerHTML = '';
  const placed = currentPlaced();
  for (let i = 0; i < POSITIONS; i++) {
    const slot = document.createElement('div');
    const position = i + 1;
    const card = placed[i];
    const isSpecial = SPECIAL_POSITIONS.has(position);
    const kind = positionKind(position);
    const isRevealed = revealedPositions.has(position);
    slot.className = [
      'slot',
      card ? 'filled' : '',
      isSpecial ? 'special' : '',
      HIGH_POSITIONS.has(position) ? 'high' : 'low',
      isRevealed ? 'revealed' : ''
    ].filter(Boolean).join(' ');

    if (card && ['reveal', 'done'].includes(phase)) {
      slot.innerHTML = isRevealed
        ? `Carta ${card.id}<small>${kind}</small>`
        : `Retro ${position}<small>${card.mark || 'segno'}</small>`;
      slot.onclick = () => openCardView(position, card);
    } else if (card) {
      slot.innerHTML = `Pos. ${position}<small>${kind}</small>`;
    } else {
      slot.innerHTML = `${position}<small>${kind}</small>`;
    }
    layoutEl.appendChild(slot);
  }
}

function placeFirstCard(card) {
  if (firstPlaced.length >= POSITIONS) return;
  firstPlaced.push(card);
  renderLayout();
  if (firstPlaced.length === POSITIONS) setPhase('baptism');
}

function drawNextMarkedCard() {
  while (deck.length) {
    const card = deck.shift();
    if (markedCards.has(card.id)) {
      finalPlaced.push(card);
      renderLayout();
      if (finalPlaced.length === POSITIONS) setPhase('reveal');
      return;
    }
  }
}


function openCardView(position, card) {
  activeReading = { position, card };
  revealedPositions.add(position);
  renderLayout();
  modalPosition.textContent = `Posizione ${position} · ${positionKind(position)}`;
  largeCard.textContent = `Carta ${card.id}`;
  modalHint.textContent = 'Osserva bene la carta. Quando sei pronto, conferma per mostrare e ascoltare il testo.';
  readingText.classList.add('hidden');
  readingText.textContent = '';
  readBtn.textContent = 'Mostra e leggi testo';
  cardModal.classList.remove('hidden');
}

function showReadingText() {
  if (!activeReading) return;
  const { position, card } = activeReading;
  const text = `Testo interpretativo placeholder per la carta ${card.id} in posizione ${position}. Qui inseriremo il contenuto definitivo e la lettura con voce narrante.`;
  readingText.textContent = text;
  readingText.classList.remove('hidden');
  modalHint.textContent = 'Lettura vocale simulata nel prototipo. In app useremo una voce calda e chiara.';
  readBtn.textContent = 'Rileggi';
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'it-IT';
    utterance.rate = 0.92;
    window.speechSynthesis.speak(utterance);
  }
}

function renderSpread() {
  spreadEl.innerHTML = '';
  spreadEl.classList.remove('hidden');
  const count = Math.min(deck.length, 15);
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.className = 'card fan-card';
    const angle = -44 + i * (88 / (count - 1));
    card.style.transform = `rotate(${angle}deg) translateY(${Math.abs(angle) * .6}px)`;
    card.onclick = () => {
      const picked = deck.splice(i, 1)[0];
      spreadEl.classList.add('hidden');
      placeFirstCard(picked);
    };
    spreadEl.appendChild(card);
  }
}

function cutAt(y) {
  const rect = deckEl.getBoundingClientRect();
  const ratio = Math.max(.1, Math.min(.9, (y - rect.top) / rect.height));
  const idx = Math.round(deck.length * ratio);
  deck = deck.slice(idx).concat(deck.slice(0, idx));
  const line = document.createElement('div');
  line.className = 'cut-line';
  line.style.top = `${ratio * 100}%`;
  $('deckArea').appendChild(line);
  setTimeout(() => line.remove(), 700);
  setTimeout(() => setPhase('layout'), 450);
}

function updateBaptism() {
  $('baptismLabel').textContent = `Battezza posizione ${baptismIndex + 1} di ${POSITIONS}`;
  clearCanvas();
}
function clearCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }
function drawCircle() {
  clearCanvas();
  ctx.strokeStyle = '#3b213f';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, 55, 0, Math.PI * 2);
  ctx.stroke();
}

let drawing = false;
function pointerPos(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (canvas.width / r.width), y: (e.clientY - r.top) * (canvas.height / r.height) };
}
canvas.addEventListener('pointerdown', (e) => { drawing = true; const p = pointerPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
canvas.addEventListener('pointermove', (e) => {
  if (!drawing) return;
  const p = pointerPos(e);
  ctx.strokeStyle = '#3b213f'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.lineTo(p.x, p.y); ctx.stroke();
});
canvas.addEventListener('pointerup', () => drawing = false);
canvas.addEventListener('pointerleave', () => drawing = false);

primaryBtn.onclick = () => {
  if ($('appRoot').classList.contains('locked')) return;
  if (phase === 'intro') setPhase('shuffle');
  else if (phase === 'shuffle') { shuffle(deck); setPhase('cut'); }
  else if (phase === 'cut') instruction.textContent = 'Tocca direttamente il mazzo per scegliere il punto di taglio.';
  else if (phase === 'layout') {
    if (mode === 'sequential') placeFirstCard(deck.shift()); else renderSpread();
  } else if (phase === 'baptism') {
    const card = firstPlaced[baptismIndex];
    card.mark = baptismIndex === 0 ? 'cerchio/nome' : 'segno/nome';
    markedCards.add(card.id);
    baptismIndex++;
    if (baptismIndex >= POSITIONS) {
      deck = deck.concat(firstPlaced);
      firstPlaced = [];
      shuffle(deck);
      setPhase('finalShuffle');
    } else updateBaptism();
  } else if (phase === 'finalShuffle') {
    shuffle(deck);
    finalPlaced = [];
    revealedPositions = new Set();
    setPhase('secondDeal');
  } else if (phase === 'secondDeal') {
    drawNextMarkedCard();
  } else reset();
};
modeBtn.onclick = () => {
  if ($('appRoot').classList.contains('locked')) return;
  if (phase !== 'layout' && phase !== 'intro') return;
  mode = mode === 'sequential' ? 'fan' : 'sequential';
  modeBtn.textContent = `Modalità: ${mode === 'sequential' ? 'sequenziale' : 'ventaglio'}`;
  if (phase === 'layout') setPhase('layout');
};
resetBtn.onclick = reset;
deckEl.addEventListener('pointermove', () => {
  if (phase === 'shuffle' || phase === 'finalShuffle') {
    shuffledGestures++;
    deckEl.classList.add('shuffling');
    if (shuffledGestures % 8 === 0) shuffle(deck);
  }
});
deckEl.addEventListener('click', (e) => { if (phase === 'cut') cutAt(e.clientY); });
$('circleBtn').onclick = drawCircle;
$('clearBtn').onclick = clearCanvas;
readBtn.onclick = showReadingText;
closeModalBtn.onclick = () => {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  cardModal.classList.add('hidden');
};

function reset() {
  deck = newDeck();
  firstPlaced = [];
  markedCards = new Set();
  finalPlaced = [];
  revealedPositions = new Set();
  baptismIndex = 0;
  shuffledGestures = 0;
  layoutEl.innerHTML = '';
  spreadEl.innerHTML = '';
  setPhase('intro');
  primaryBtn.textContent = 'Inizia';
  instruction.textContent = 'Mischia il mazzo trascinando il dito sulle carte.';
  layoutEl.classList.add('hidden');
  spreadEl.classList.add('hidden');
  baptismEl.classList.add('hidden');
  cardModal.classList.add('hidden');
}

reset();
