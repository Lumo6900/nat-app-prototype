const TOTAL_CARDS = 37;
const POSITIONS = 10;
const HIGH_POSITIONS = new Set([1, 2, 3, 4, 5]);
const LOW_POSITIONS = new Set([6, 7, 8, 9, 10]);
const SPECIAL_POSITIONS = new Set([4, 9]);

let deck = [];
let phase = 'intro';
let mode = 'fan';
let firstPlaced = [];
let markedCards = new Set();
let finalPlaced = [];
let revealedPositions = new Set();
let baptismIndex = 0;
let shuffledGestures = 0;

const $ = (id) => document.getElementById(id);

function showFatalError(message) {
  const errorBox = document.createElement('pre');
  errorBox.style.cssText = 'position:fixed;inset:16px;z-index:9999;margin:0;padding:16px;border-radius:16px;background:#210b12;color:#fff;white-space:pre-wrap;font:14px/1.4 ui-monospace,monospace;overflow:auto;';
  errorBox.textContent = `Errore prototipo:\n${message}`;
  document.body.appendChild(errorBox);
}

window.addEventListener('error', (event) => showFatalError(event.message || 'Errore JavaScript sconosciuto'));
window.addEventListener('unhandledrejection', (event) => showFatalError(event.reason?.message || String(event.reason)));

const instruction = $('instruction');
const deckEl = $('deck');
const deckHint = $('deckHint');
const layoutEl = $('layout');
const spreadEl = $('spread');
const baptismEl = $('baptism');
const primaryBtn = $('primaryBtn');
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
let motionShuffleReady = false;
let hapticsReady = false;
let hapticsUnsupported = false;
let lastShakeMagnitude = null;
let lastShakeAt = 0;
let shuffleAnimationTimer = null;
let shuffleIdleTimer = null;
let hapticPulseTimer = null;
let hapticStopTimer = null;
let continuousNativeHapticsRunning = false;

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

function nativeDeck() {
  return window.Capacitor?.Plugins?.NatDeckScene || null;
}

function setNativeDeckPhase(nextPhase) {
  nativeDeck()?.setPhase?.({ phase: nextPhase }).catch(() => {});
}

function setPhase(next) {
  const previousPhase = phase;
  phase = next;
  document.body.dataset.phase = phase;
  setNativeDeckPhase(phase);
  window.NatDeck3D?.setPhase?.(phase);
  document.body.classList.toggle('moving-to-cut', previousPhase === 'shuffle' && next === 'cut');
  if (previousPhase === 'shuffle' && next === 'cut') setTimeout(() => document.body.classList.remove('moving-to-cut'), 950);
  clearTimeout(shuffleIdleTimer);
  if (!['shuffle', 'finalShuffle'].includes(phase)) stopShuffleHaptics();
  deckEl.classList.remove('shuffling');
  primaryBtn.classList.toggle('hidden', ['intro', 'shuffle', 'finalShuffle', 'cut'].includes(phase));
  deckHint.classList.toggle('hidden', !['shuffle', 'finalShuffle'].includes(phase));
  layoutEl.classList.toggle('hidden', !['layout', 'baptism', 'secondDeal', 'reveal', 'done'].includes(phase));
  spreadEl.classList.add('hidden');
  baptismEl.classList.add('hidden');
  cardModal.classList.add('hidden');

  if (phase === 'intro') {
    enableMotionShuffle();
  }
  if (phase === 'shuffle') {
    shuffledGestures = 0;
    primaryBtn.textContent = '';
    instruction.textContent = 'Prima mischiata: passa il dito sul mazzo o scuoti il dispositivo. Quando ti fermi, passeremo al taglio.';
    deckHint.textContent = hapticsUnsupported
      ? 'Scuoti il dispositivo per mischiare il mazzo. Su questo browser la vibrazione non è disponibile.'
      : 'Scuoti il dispositivo per mischiare il mazzo. Fermati quando senti che è il momento.';
    enableMotionShuffle();
  }
  if (phase === 'cut') {
    primaryBtn.textContent = '';
    instruction.textContent = 'Tocca un punto del mazzo per tagliare.';
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
    shuffledGestures = 0;
    primaryBtn.textContent = '';
    instruction.textContent = 'Le 10 carte battezzate rientrano nel mazzo. Mischia ancora: quando ti fermi, passeremo alla seconda estrazione.';
    deckHint.textContent = hapticsUnsupported
      ? 'Scuoti ancora per rimischiare. Su questo browser la vibrazione non è disponibile.'
      : 'Scuoti ancora per rimischiare. Fermati quando senti che il mazzo è pronto.';
    enableMotionShuffle();
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

async function enableMotionShuffle() {
  if (motionShuffleReady || !('DeviceMotionEvent' in window)) return;
  try {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      const permission = await DeviceMotionEvent.requestPermission();
      if (permission !== 'granted') return;
    }
    window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });
    motionShuffleReady = true;
  } catch (error) {
    // Il gesto touch sul mazzo resta il fallback per browser senza permessi sensori.
  }
}

function getNativeHaptics() {
  return window.Capacitor?.Plugins?.Haptics || null;
}

function getNatHaptics() {
  return window.Capacitor?.Plugins?.NatHaptics || null;
}

function primeHaptics() {
  const nativeHaptics = getNativeHaptics();
  hapticsUnsupported = !nativeHaptics && !('vibrate' in navigator);
  if (hapticsUnsupported) return false;
  hapticsReady = true;
  // Alcuni browser attivano la vibrazione solo dopo un gesto esplicito dell’utente.
  if ('vibrate' in navigator) navigator.vibrate(1);
  if (nativeHaptics?.selectionStart) nativeHaptics.selectionStart().catch(() => {});
  return true;
}

function hapticPulse() {
  const nativeHaptics = getNativeHaptics();
  if (nativeHaptics?.vibrate) {
    nativeHaptics.vibrate({ duration: 900 }).catch(() => {
      nativeHaptics.impact?.({ style: 'HEAVY' }).catch(() => {});
    });
    return;
  }
  if (!hapticsReady && !primeHaptics()) return;
  navigator.vibrate(900);
}

function startContinuousNativeHaptics() {
  const natHaptics = getNatHaptics();
  if (!natHaptics?.start || continuousNativeHapticsRunning) return false;
  continuousNativeHapticsRunning = true;
  natHaptics.start().catch(() => {
    continuousNativeHapticsRunning = false;
    hapticPulse();
  });
  return true;
}

function stopShuffleHaptics() {
  clearInterval(hapticPulseTimer);
  clearTimeout(hapticStopTimer);
  hapticPulseTimer = null;
  hapticStopTimer = null;
  if (continuousNativeHapticsRunning) {
    continuousNativeHapticsRunning = false;
    getNatHaptics()?.stop?.().catch(() => {});
  }
  if ('vibrate' in navigator) navigator.vibrate(0);
}

function sustainShuffleHaptics() {
  if (!hapticsReady && !primeHaptics()) return;

  if (!startContinuousNativeHaptics() && !continuousNativeHapticsRunning) {
    hapticPulse();
    if (!hapticPulseTimer) hapticPulseTimer = setInterval(hapticPulse, 520);
  }

  clearTimeout(hapticStopTimer);
  hapticStopTimer = setTimeout(stopShuffleHaptics, 760);
}

function castShuffleSparks() {
  const area = $('deckArea');
  for (let i = 0; i < 7; i++) {
    const spark = document.createElement('i');
    spark.className = 'shuffle-spark';
    spark.style.setProperty('--angle', `${Math.round(Math.random() * 360)}deg`);
    spark.style.setProperty('--distance', `${70 + Math.round(Math.random() * 70)}px`);
    spark.style.animationDelay = `${i * 22}ms`;
    area.appendChild(spark);
    setTimeout(() => spark.remove(), 900);
  }
}

function finishShuffleAfterIdle() {
  if (phase === 'shuffle' && shuffledGestures > 0) {
    shuffle(deck);
    setPhase('cut');
  } else if (phase === 'finalShuffle' && shuffledGestures > 0) {
    shuffle(deck);
    finalPlaced = [];
    revealedPositions = new Set();
    setPhase('secondDeal');
  }
}

function startShuffleIfNeeded() {
  if (phase === 'intro') setPhase('shuffle');
}

function registerShuffleGesture() {
  startShuffleIfNeeded();
  if (!['shuffle', 'finalShuffle'].includes(phase)) return;
  shuffledGestures++;
  nativeDeck()?.pulse?.().catch(() => {});
  window.NatDeck3D?.pulse?.();
  deckEl.classList.add('shuffling');
  if (shuffledGestures % 2 === 1) castShuffleSparks();
  if (shuffledGestures === 4) {
    deckHint.textContent = 'Il mazzo sta prendendo forma. Continua ancora un istante, poi fermati quando lo senti pronto.';
  }
  clearTimeout(shuffleAnimationTimer);
  shuffleAnimationTimer = setTimeout(() => deckEl.classList.remove('shuffling'), 620);
  clearTimeout(shuffleIdleTimer);
  shuffleIdleTimer = setTimeout(finishShuffleAfterIdle, 1150);
  shuffle(deck);
  sustainShuffleHaptics();
}

function handleDeviceMotion(event) {
  if (!['shuffle', 'finalShuffle'].includes(phase)) return;
  const acceleration = event.accelerationIncludingGravity || event.acceleration;
  if (!acceleration) return;
  const x = acceleration.x || 0;
  const y = acceleration.y || 0;
  const z = acceleration.z || 0;
  const magnitude = Math.sqrt((x * x) + (y * y) + (z * z));
  const delta = lastShakeMagnitude === null ? 0 : Math.abs(magnitude - lastShakeMagnitude);
  const now = Date.now();
  lastShakeMagnitude = magnitude;
  if (delta > 9 && now - lastShakeAt > 260) {
    lastShakeAt = now;
    registerShuffleGesture();
  }
}

function cutAt(x) {
  const rect = deckEl.getBoundingClientRect();
  const ratio = Math.max(.1, Math.min(.9, (x - rect.left) / rect.width));
  const idx = Math.round(deck.length * ratio);
  deck = deck.slice(idx).concat(deck.slice(0, idx));
  nativeDeck()?.cut?.({ ratio }).catch(() => {});
  window.NatDeck3D?.cut?.(ratio);
  const line = document.createElement('div');
  line.className = 'cut-line';
  line.style.left = `${ratio * 100}%`;
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
  primeHaptics();
  if (phase === 'layout') {
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
  } else if (phase === 'secondDeal') {
    drawNextMarkedCard();
  } else reset();
};
resetBtn.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  event.stopPropagation();
  reset();
});
resetBtn.onclick = (event) => {
  event.preventDefault();
  event.stopPropagation();
  reset();
};
function handleShufflePointer(event) {
  if (event.target?.closest?.('button')) return;
  if (phase === 'intro' || phase === 'shuffle' || phase === 'finalShuffle') registerShuffleGesture();
}

$('deckArea').addEventListener('pointerdown', handleShufflePointer);
$('deckArea').addEventListener('pointermove', handleShufflePointer);
$('deckArea').addEventListener('click', (e) => { if (phase === 'cut') cutAt(e.clientX); });
$('layout').parentElement.addEventListener('pointerdown', handleShufflePointer);
$('layout').parentElement.addEventListener('pointermove', handleShufflePointer);
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
  stopShuffleHaptics();
  layoutEl.innerHTML = '';
  spreadEl.innerHTML = '';
  setPhase('intro');
  primaryBtn.textContent = '';
  instruction.textContent = 'Mischia il mazzo trascinando il dito sulle carte.';
  layoutEl.classList.add('hidden');
  spreadEl.classList.add('hidden');
  baptismEl.classList.add('hidden');
  cardModal.classList.add('hidden');
  deckHint.classList.add('hidden');
}

nativeDeck()?.show?.().then(() => setNativeDeckPhase(phase)).catch(() => {});
reset();
