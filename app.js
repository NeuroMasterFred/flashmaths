'use strict';

/* ════════════ Données & sauvegarde ════════════ */

const DECK = window.DECK;
const STORE = 'flashmaths.v1';
const PHOTO = 'flashmaths.photo';
const DEFAULTS = {
  intervals: [1, 1, 3, 7, 15, 30, 90], // paliers en jours
  jump: 2,                             // paliers gagnés par une bonne réponse juste après une erreur
  bg: 'aurore', bgColor: '#3b82f6', accent: '#6a5cff', reminder: '18:00',
};

let S = load();

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORE)); } catch (e) { /* stockage indisponible */ }
  s = s || {};
  s.cards = s.cards || {};
  s.off = s.off || [];
  s.known = s.known || null;
  s.settings = Object.assign({}, DEFAULTS, s.settings || {});
  s.stats = Object.assign({ xp: 0, streak: 0, best: 0, lastDay: null, ok: 0, ko: 0, days: {}, badges: {}, bestCombo: 0 }, s.stats || {});
  return s;
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* stockage plein */ } }

const $ = (sel, el = document) => el.querySelector(sel);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* Texte + formules $...$ → HTML (KaTeX) */
function tex(str) {
  return String(str).split(/(\$[^$]+\$)/g).map(part => {
    if (part.length > 1 && part[0] === '$' && part.endsWith('$')) {
      const src = part.slice(1, -1);
      if (window.katex) {
        try { return katex.renderToString(src, { throwOnError: false }); } catch (e) { /* repli texte */ }
      }
      return '<code>' + esc(src) + '</code>';
    }
    return esc(part);
  }).join('');
}

/* ════════════ Dates ════════════ */

const pad = n => String(n).padStart(2, '0');
const dstr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dstr(new Date());
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return dstr(d); };
const diffDays = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
const frDate = s => new Date(s + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
function inDays(n) {
  if (n <= 0) return "aujourd'hui";
  if (n === 1) return 'demain';
  if (n === 7) return 'dans 1 semaine';
  if (n % 30 === 0) return n === 30 ? 'dans 1 mois' : `dans ${n / 30} mois`;
  return `dans ${n} jours`;
}
const dur = n => n === 1 ? '1 jour' : n === 7 ? '1 semaine' : n === 30 ? '1 mois' : n === 90 ? '3 mois' : `${n} jours`;

/* ════════════ Cartes & répétition espacée ════════════ */

const chapter = id => DECK.chapters.find(c => c.id === id);
const state = id => S.cards[id];
const isDue = c => { const s = state(c.id); return !s || s.due <= today(); };
const activeCards = ch => DECK.cards.filter(c => ch ? c.ch === ch : !S.off.includes(c.ch));
const dueCards = ch => activeCards(ch).filter(isDue);
const maxLvl = () => S.settings.intervals.length - 1;
const lvlOf = c => { const s = state(c.id); return s ? Math.min(s.lvl, maxLvl()) : -1; };

// Bonne réponse : +1 palier (ou +jump juste après une erreur). Erreur : retour au 1er palier.
function schedule(card, correct) {
  const P = S.settings.intervals;
  const s = S.cards[card.id] || (S.cards[card.id] = { lvl: -1, due: today(), ok: 0, ko: 0, lastWrong: false });
  if (correct) {
    const step = s.lastWrong ? S.settings.jump : 1;
    s.lvl = s.lvl < 0 && !s.lastWrong ? 0 : Math.min(Math.max(s.lvl, 0) + step, P.length - 1);
    s.lastWrong = false; s.ok++;
  } else {
    s.lvl = 0; s.lastWrong = true; s.ko++;
  }
  s.due = addDays(P[s.lvl]);
  return P[s.lvl];
}

function mastery(ch) {
  const cards = activeCards(ch);
  if (!cards.length) return 0;
  const m = maxLvl();
  return cards.reduce((t, c) => t + Math.max(0, lvlOf(c) + 1) / (m + 1), 0) / cards.length;
}

function nextDueIn() {
  const dues = activeCards().map(c => state(c.id)).filter(Boolean).map(s => s.due).sort();
  return dues.length ? diffDays(today(), dues[0]) : null;
}

/* ════════════ Niveaux, séries, badges ════════════ */

const TITLES = ['Débutant·e', 'Apprenti·e', 'Calculateur·rice', 'Logicien·ne', 'Démonstrateur·rice', 'Géomètre', 'Analyste', 'Théorème vivant', 'Prodige', 'Légende des maths'];
const levelOf = xp => Math.floor(1 + Math.sqrt(xp / 60));
const xpFor = l => 60 * (l - 1) * (l - 1);
const titleOf = l => TITLES[Math.min(l, TITLES.length) - 1];

const BADGES = [
  { id: 'first', e: '🌱', n: 'Premier pas', d: 'Réussir sa première carte' },
  { id: 's3', e: '🔥', n: '3 jours', d: '3 jours de suite' },
  { id: 's7', e: '⚡', n: '1 semaine', d: '7 jours de suite' },
  { id: 's30', e: '🌋', n: '1 mois', d: '30 jours de suite' },
  { id: 'c10', e: '🎯', n: 'Combo x10', d: '10 bonnes réponses d\'affilée' },
  { id: 'c25', e: '🚀', n: 'Combo x25', d: '25 bonnes réponses d\'affilée' },
  { id: 'perfect', e: '💯', n: 'Sans faute', d: 'Séance d\'au moins 10 cartes sans erreur' },
  { id: 'ok100', e: '🥉', n: '100 réussites', d: '100 bonnes réponses' },
  { id: 'ok500', e: '🥈', n: '500 réussites', d: '500 bonnes réponses' },
  { id: 'ok1000', e: '🥇', n: '1000 réussites', d: '1000 bonnes réponses' },
  { id: 'revenge', e: '🦸', n: 'Revanche', d: 'Réussir une carte ratée la fois précédente' },
  { id: 'day50', e: '🏃', n: 'Marathon', d: '50 cartes en une journée' },
  { id: 'master', e: '👑', n: 'Maître', d: 'Toutes les cartes d\'un chapitre au palier « 1 semaine » ou plus' },
  { id: 'lvl5', e: '🧠', n: 'Niveau 5', d: 'Atteindre le niveau 5' },
  { id: 'night', e: '🦉', n: 'Couche-tard', d: 'Réviser après 22 h' },
];

function award(id) {
  if (S.stats.badges[id]) return;
  S.stats.badges[id] = today();
  const b = BADGES.find(x => x.id === id);
  setTimeout(() => {
    toast(`${b.e} Nouveau badge : <b>${b.n}</b> !`);
    sfx.badge();
    burst(innerWidth / 2, 80, 70, ['🏅', '⭐', b.e]);
  }, 700);
}

function touchStreak() {
  const t = today(), st = S.stats;
  if (st.lastDay === t) return;
  st.streak = st.lastDay && diffDays(st.lastDay, t) === 1 ? st.streak + 1 : 1;
  st.best = Math.max(st.best, st.streak);
  st.lastDay = t;
}
const currentStreak = () => (S.stats.lastDay && diffDays(S.stats.lastDay, today()) <= 1 ? S.stats.streak : 0);

function checkBadges(ctx = {}) {
  const st = S.stats;
  if (st.ok >= 1) award('first');
  if (st.streak >= 3) award('s3');
  if (st.streak >= 7) award('s7');
  if (st.streak >= 30) award('s30');
  if (st.bestCombo >= 10) award('c10');
  if (st.bestCombo >= 25) award('c25');
  if (st.ok >= 100) award('ok100');
  if (st.ok >= 500) award('ok500');
  if (st.ok >= 1000) award('ok1000');
  if (ctx.revenge) award('revenge');
  const d = st.days[today()];
  if (d && d.ok + d.ko >= 50) award('day50');
  if (levelOf(st.xp) >= 5) award('lvl5');
  if (new Date().getHours() >= 22) award('night');
  if (ctx.perfect) award('perfect');
  const w = S.settings.intervals.findIndex(n => n >= 7);
  if (w >= 0 && DECK.chapters.some(ch => { const cs = activeCards(ch.id); return cs.length && cs.every(c => lvlOf(c) >= w); })) award('master');
}

/* ════════════ Effets : sons, confettis, toasts ════════════ */

let AC = null;
function tone(freqs, len = 0.15, type = 'sine', gap = 0.08, vol = 0.12) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const t0 = AC.currentTime + 0.01;
    freqs.forEach((f, i) => {
      const o = AC.createOscillator(), g = AC.createGain(), t = t0 + i * gap;
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      o.connect(g); g.connect(AC.destination);
      o.start(t); o.stop(t + len + 0.05);
    });
  } catch (e) { /* pas de son */ }
}
const sfx = {
  ok: () => tone([660, 880, 1320], 0.18, 'triangle', 0.07),
  combo: () => tone([523, 659, 784, 1047, 1319], 0.16, 'triangle', 0.05),
  ko: () => tone([300, 220], 0.25, 'sine', 0.13, 0.09),
  win: () => tone([523, 659, 784, 1047, 784, 1047, 1319], 0.28, 'triangle', 0.11),
  badge: () => tone([784, 988, 1175, 1568], 0.22, 'square', 0.08, 0.05),
};

const cv = $('#fx'), cx = cv.getContext('2d');
let parts = [], raf = 0;
function sizeFx() { const r = devicePixelRatio || 1; cv.width = innerWidth * r; cv.height = innerHeight * r; cx.setTransform(r, 0, 0, r, 0, 0); }
addEventListener('resize', sizeFx); sizeFx();

function confetti(x = innerWidth / 2, y = innerHeight / 3, n = 90, power = 1) {
  const cols = [S.settings.accent, '#ffd166', '#06d6a0', '#ef476f', '#118ab2', '#ffffff', '#ff9f1c'];
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = (4 + Math.random() * 9) * power;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6 * power, s: 5 + Math.random() * 6, c: pick(cols), r: Math.random() * 6, vr: (Math.random() - .5) * .4, life: 90 + Math.random() * 70, round: Math.random() < .35 });
  }
  if (!raf) raf = requestAnimationFrame(loop);
}
function burst(x, y, n, emojis) {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - .5) * 2.2, v = 5 + Math.random() * 9;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: 22 + Math.random() * 16, emoji: pick(emojis), r: 0, vr: (Math.random() - .5) * .2, life: 80 + Math.random() * 50 });
  }
  if (!raf) raf = requestAnimationFrame(loop);
}
function fireworks() {
  for (let k = 0; k < 6; k++) setTimeout(() => confetti(innerWidth * (.2 + Math.random() * .6), innerHeight * (.15 + Math.random() * .35), 70, 1.1), k * 280);
  setTimeout(() => burst(innerWidth / 2, innerHeight * .6, 30, ['🎉', '⭐', '🏆', '💯', '🔥', '✨']), 300);
}
function loop() {
  cx.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter(p => p.life-- > 0 && p.y < innerHeight + 60);
  for (const p of parts) {
    p.vy += 0.32; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
    cx.save(); cx.globalAlpha = Math.min(1, p.life / 30); cx.translate(p.x, p.y); cx.rotate(p.r);
    if (p.emoji) { cx.font = `${p.s}px serif`; cx.textAlign = 'center'; cx.fillText(p.emoji, 0, 0); }
    else if (p.round) { cx.fillStyle = p.c; cx.beginPath(); cx.arc(0, 0, p.s / 2, 0, 7); cx.fill(); }
    else { cx.fillStyle = p.c; cx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); }
    cx.restore();
  }
  raf = parts.length ? requestAnimationFrame(loop) : 0;
}

let toastTimer;
function toast(html, ms = 2600) {
  const t = $('#toast');
  t.innerHTML = html; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/* ════════════ Thème ════════════ */

const BGS = {
  aurore: ['Aurore', 'linear-gradient(160deg,#6a5cff,#b06ab3 55%,#ff9a8b)'],
  ocean: ['Océan', 'linear-gradient(160deg,#00c6fb,#005bea)'],
  foret: ['Forêt', 'linear-gradient(160deg,#11998e,#38ef7d)'],
  soleil: ['Soleil', 'linear-gradient(160deg,#ff512f,#f09819)'],
  nuit: ['Nuit', 'linear-gradient(160deg,#0f2027,#203a43,#2c5364)'],
  bonbon: ['Bonbon', 'linear-gradient(160deg,#ff9a9e,#fad0c4 60%,#fbc2eb)'],
  galaxie: ['Galaxie', 'radial-gradient(circle at 30% 20%,#7b2ff7,#2a0f5f 55%,#090418)'],
  lagon: ['Lagon', 'linear-gradient(160deg,#43e97b,#38f9d7 50%,#4facfe)'],
  framboise: ['Framboise', 'linear-gradient(160deg,#e94057,#8a2387)'],
  sable: ['Sable', 'linear-gradient(160deg,#f6d365,#fda085)'],
};
const ACCENTS = ['#6a5cff', '#ff4f8b', '#ff7a00', '#12b76a', '#0b84f3', '#9b51e0', '#e5484d', '#1d1b2c'];

function applyTheme() {
  const st = S.settings, bg = $('#bg');
  document.documentElement.style.setProperty('--accent', st.accent);
  bg.style.backgroundImage = ''; bg.style.background = '';
  if (st.bg === 'photo') {
    let img = null;
    try { img = localStorage.getItem(PHOTO); } catch (e) { /* rien */ }
    if (img) { bg.style.background = `#000 url(${img}) center/cover`; return; }
    st.bg = 'aurore';
  }
  bg.style.background = st.bg === 'color' ? st.bgColor : BGS[st.bg][1];
}

/* ════════════ Navigation ════════════ */

let current = 'home';
function show(v) {
  current = v;
  document.querySelectorAll('.view').forEach(el => { el.hidden = el.id !== 'v-' + v; });
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  document.body.classList.toggle('in-session', v === 'session');
  ({ home: renderHome, chapters: renderChapters, stats: renderStats, settings: renderSettings }[v] || (() => {}))();
  scrollTo(0, 0);
  updateBadge();
}
document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => show(b.dataset.v)));

function updateBadge() {
  const n = dueCards().length;
  try { if (navigator.setAppBadge) n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch (e) { /* non supporté */ }
}

/* ════════════ Accueil ════════════ */

const QUOTES = [
  'Les maths, c\'est comme le sport : un peu chaque jour 💪',
  'Chaque carte révisée est une note gagnée au contrôle 📈',
  'La répétition est la mère de l\'apprentissage 🧠',
  '5 minutes par jour valent mieux que 2 heures la veille du contrôle ⏱️',
  'Se tromper, c\'est apprendre. Ne pas essayer, c\'est rater 🎯',
  'Tu es plus fort·e que tu ne le penses 🚀',
];

function renderHome() {
  const el = $('#v-home'), due = dueCards().length, st = S.stats;
  const lvl = levelOf(st.xp), lo = xpFor(lvl), hi = xpFor(lvl + 1);
  const h = new Date().getHours();
  const hello = h < 6 ? 'Encore debout ? 🦉' : h < 12 ? 'Bonjour ☀️' : h < 18 ? 'Salut 👋' : 'Bonsoir 🌙';
  const streak = currentStreak();
  const doneToday = st.lastDay === today();
  const next = nextDueIn();
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

  el.innerHTML = `
    <div class="title">${hello}</div>
    ${isIOS && !standalone ? `<div class="tip">📲 <b>Installe l'appli :</b> touche <b>Partager</b> <span style="font-size:18px">⎋</span> puis <b>« Sur l'écran d'accueil »</b>.</div>` : ''}
    <div class="panel hero">
      ${due ? `
        <div class="big">${due}</div>
        <div class="lbl">carte${due > 1 ? 's' : ''} à réviser aujourd'hui</div>
        <button class="btn" id="go">C'est parti ! 🚀</button>` : `
        <div style="font-size:60px">🎉</div>
        <div class="lbl">Tout est révisé pour aujourd'hui !<br><span class="muted">${next !== null ? 'Prochaines cartes ' + inDays(next) + '.' : ''}</span></div>
        <button class="btn ghost" id="practice">S'entraîner quand même</button>`}
    </div>
    <div class="panel">
      <div class="streak">
        <div class="tile"><div class="v"><span class="flame">${streak ? '🔥' : '🪵'}</span> ${streak}</div><div class="k">jour${streak > 1 ? 's' : ''} de suite${doneToday ? ' ✅' : ''}</div></div>
        <div class="tile"><div class="v">⭐ ${lvl}</div><div class="k">${titleOf(lvl)}</div></div>
        <div class="tile"><div class="v">🏅 ${Object.keys(st.badges).length}</div><div class="k">badges</div></div>
      </div>
      <div class="xpbar"><i style="width:${Math.round(100 * (st.xp - lo) / (hi - lo))}%"></i></div>
      <div class="muted" style="margin-top:6px;text-align:right">${st.xp - lo} / ${hi - lo} XP vers le niveau ${lvl + 1}</div>
      ${!doneToday && streak ? `<div class="muted" style="margin-top:6px">⚠️ Révise aujourd'hui pour garder ta série !</div>` : ''}
    </div>
    <div class="panel">
      <button class="btn ghost" id="global">🌍 Révision globale : toutes les cartes</button>
      <button class="btn ghost" id="bychap">📚 Réviser un chapitre</button>
    </div>
    <p class="quote" style="color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.4)">${pick(QUOTES)}</p>`;

  $('#go', el)?.addEventListener('click', () => startSession(dueCards(), 'due', 'Révision du jour'));
  $('#practice', el)?.addEventListener('click', () => startSession(activeCards(), 'practice', 'Entraînement libre'));
  $('#global', el).addEventListener('click', () => startSession(activeCards(), 'practice', 'Révision globale'));
  $('#bychap', el).addEventListener('click', () => show('chapters'));
}

/* ════════════ Chapitres ════════════ */

function renderChapters() {
  const el = $('#v-chapters');
  const levels = [...new Set(DECK.chapters.map(c => c.level))];
  el.innerHTML = `<div class="title">Chapitres</div>` + levels.map(level => `
    <div class="panel">
      <h3>${level === 'Seconde' ? 'Révisions de Seconde' : level}</h3>
      ${DECK.chapters.filter(c => c.level === level).map(ch => {
        const all = DECK.cards.filter(c => c.ch === ch.id), due = all.filter(isDue).length, on = !S.off.includes(ch.id);
        return `<div class="chap ${on ? '' : 'off'}">
          <div class="row">
            <div class="grow"><div class="name">${ch.emoji} ${esc(ch.name)}</div>
              <div class="muted">${all.length} cartes · ${due} à réviser</div></div>
            <label class="switch" title="Inclure dans la révision du jour"><input type="checkbox" data-tog="${ch.id}" ${on ? 'checked' : ''}><span></span></label>
          </div>
          <div class="mastery"><i style="width:${Math.round(mastery(ch.id) * 100)}%"></i></div>
          <div class="actions">
            <button class="btn small" data-due="${ch.id}" ${due ? '' : 'disabled'}>Réviser (${due})</button>
            <button class="btn small ghost" data-all="${ch.id}">S'entraîner</button>
            <button class="btn small ghost" data-list="${ch.id}">Voir les cartes</button>
          </div>
        </div>`;
      }).join('')}
    </div>`).join('') +
    `<p class="muted" style="color:#fff;text-shadow:0 1px 4px rgba(0,0,0,.4);padding:0 6px">L'interrupteur choisit les chapitres inclus dans la révision du jour. « S'entraîner » revoit tout le chapitre sans changer le calendrier.</p>`;

  el.querySelectorAll('[data-tog]').forEach(i => i.addEventListener('change', () => {
    const id = i.dataset.tog;
    S.off = i.checked ? S.off.filter(x => x !== id) : [...S.off, id];
    save(); renderChapters(); updateBadge();
  }));
  el.querySelectorAll('[data-due]').forEach(b => b.addEventListener('click', () => startSession(dueCards(b.dataset.due), 'due', chapter(b.dataset.due).name)));
  el.querySelectorAll('[data-all]').forEach(b => b.addEventListener('click', () => startSession(activeCards(b.dataset.all), 'practice', chapter(b.dataset.all).name + ' · entraînement')));
  el.querySelectorAll('[data-list]').forEach(b => b.addEventListener('click', () => showCardList(b.dataset.list)));
}

function showCardList(chId) {
  const ch = chapter(chId), m = $('#modal'), P = S.settings.intervals;
  m.innerHTML = `<div class="panel">
    <div class="row"><h2 class="grow">${ch.emoji} ${esc(ch.name)}</h2><button class="x" id="mclose">✕</button></div>
    <div class="cardlist">${DECK.cards.filter(c => c.ch === chId).map(c => {
      const s = state(c.id), l = lvlOf(c);
      const status = !s ? '🆕 Nouvelle' : `Palier ${l + 1} (${dur(P[l])}) · prochaine révision : ${s.due <= today() ? "aujourd'hui" : frDate(s.due)}`;
      return `<div class="item"><div class="q">${tex(c.q)}</div>
        ${c.c.map((x, i) => `<div class="c ${c.a.includes(i) ? 'ok' : ''}">${c.a.includes(i) ? '✓' : '·'} ${tex(x)}</div>`).join('')}
        <div class="muted" style="margin-top:6px">💡 ${tex(c.n)} · ${status}</div></div>`;
    }).join('')}</div></div>`;
  m.hidden = false;
  $('#mclose').addEventListener('click', () => { m.hidden = true; });
}

/* ════════════ Séance de révision ════════════ */

let SESS = null;
const OK_MSG = ['Bravo ! 🎉', 'Excellent ! 💯', 'Trop fort ! 🔥', 'Parfait ! ⭐', 'Génial ! 🚀', 'Yes ! 💪', 'Impeccable ! ✨', 'Tu gères ! 😎', 'Bien joué ! 👏', 'Euler serait fier ! 🧠', 'Pythagore approuve ! 📐', 'Masterclass ! 🏆'];
const KO_MSG = ['Pas grave ! 💪', 'Presque ! 🤏', 'On apprend en se trompant 🌱', 'La prochaine sera la bonne 🍀'];

function startSession(cards, mode, title) {
  if (!cards.length) { toast('Aucune carte à réviser ici 🎉'); return; }
  SESS = { queue: shuffle(cards).map(c => ({ id: c.id, retry: false })), i: 0, mode, title, ok: 0, ko: 0, combo: 0, maxCombo: 0, xp: 0, total: cards.length, answered: false };
  tone([0.001], 0.01); // débloque le son sur iOS au premier geste
  show('session');
  renderCard();
}

function renderCard() {
  const el = $('#v-session'), item = SESS.queue[SESS.i];
  if (!item) return renderEnd();
  const card = DECK.cards.find(c => c.id === item.id), ch = chapter(card.ch), l = lvlOf(card), m = maxLvl();
  item.order = item.order || shuffle([0, 1, 2, 3]);
  SESS.sel = new Set(); SESS.answered = false;
  const multi = card.a.length > 1;
  const pct = Math.round(100 * SESS.i / SESS.queue.length);

  el.innerHTML = `
    <div class="sess-top">
      <button class="close" id="quit">✕</button>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="combo">${SESS.combo >= 2 ? '🔥' + SESS.combo : ''}</div>
    </div>
    <div class="panel qcard" id="qcard">
      <div><span class="chip">${ch.emoji} ${esc(ch.name)}</span>
        ${item.retry ? '<span class="chip">🔁 2ᵉ essai</span>' : l < 0 ? '<span class="chip">🆕 Nouvelle</span>' : `<span class="dots">${Array.from({ length: m + 1 }, (_, i) => `<i class="${i <= l ? 'on' : ''}"></i>`).join('')}</span>`}
      </div>
      <div class="question">${tex(card.q)}</div>
      <div class="hint ${multi ? 'multi' : ''}">${multi ? '☑️ Plusieurs bonnes réponses : coche-les toutes' : '👆 Une seule bonne réponse'}</div>
      <div class="choices" id="choices">
        ${item.order.map((k, i) => `<button class="choice" data-k="${k}"><span class="box">${'ABCD'[i]}</span><span>${tex(card.c[k])}</span></button>`).join('')}
      </div>
      ${multi ? '<button class="btn" id="validate" disabled>Valider</button>' : ''}
      <div id="fb"></div>
    </div>`;

  $('#quit').addEventListener('click', () => {
    if (SESS.i === 0 || confirm('Arrêter la séance ? Les cartes déjà répondues sont enregistrées.')) { SESS = null; show('home'); }
  });
  el.querySelectorAll('.choice').forEach(b => b.addEventListener('click', () => {
    if (SESS.answered) return;
    const k = +b.dataset.k;
    if (!multi) { SESS.sel = new Set([k]); return answer(card, item); }
    SESS.sel.has(k) ? SESS.sel.delete(k) : SESS.sel.add(k);
    b.classList.toggle('sel', SESS.sel.has(k));
    $('#validate').disabled = SESS.sel.size === 0;
  }));
  $('#validate')?.addEventListener('click', () => answer(card, item));
}

function answer(card, item) {
  SESS.answered = true;
  const good = new Set(card.a), sel = SESS.sel;
  const correct = sel.size === good.size && [...sel].every(k => good.has(k));
  const wasWrong = state(card.id)?.lastWrong;
  const st = S.stats, t = today();

  // Correction visuelle
  const list = $('#choices'); list.classList.add('done');
  list.querySelectorAll('.choice').forEach(b => {
    const k = +b.dataset.k, box = $('.box', b);
    b.classList.remove('sel');
    if (good.has(k) && sel.has(k)) { b.classList.add('right'); box.textContent = '✓'; }
    else if (good.has(k)) { b.classList.add('right', 'missed'); box.textContent = '✓'; }
    else if (sel.has(k)) { b.classList.add('wrong'); box.textContent = '✕'; }
  });
  $('#validate')?.remove();

  // Calendrier (seulement en révision du jour, pas pour un 2ᵉ essai)
  let nextTxt = '';
  if (SESS.mode === 'due' && !item.retry) {
    const days = schedule(card, correct);
    nextTxt = correct ? `📅 Prochaine révision ${inDays(days)}` : `📅 On la revoit ${inDays(days)}`;
  } else if (SESS.mode === 'practice') nextTxt = '🏋️ Entraînement : le calendrier ne change pas';

  // Stats
  touchStreak();
  st.days[t] = st.days[t] || { ok: 0, ko: 0 };
  let gain = 0;
  if (correct) {
    SESS.ok += item.retry ? 0 : 1; SESS.combo++; SESS.maxCombo = Math.max(SESS.maxCombo, SESS.combo);
    st.ok++; st.days[t].ok++; st.bestCombo = Math.max(st.bestCombo, SESS.combo);
    gain = (item.retry ? 4 : 10) + (SESS.combo % 5 === 0 ? 10 : 0);
  } else {
    SESS.ko += item.retry ? 0 : 1; SESS.combo = 0;
    st.ko++; st.days[t].ko++;
    gain = 2;
    if (!item.retry) SESS.queue.push({ id: card.id, retry: true }); // on la revoit à la fin de la séance
  }
  const lvlBefore = levelOf(st.xp);
  st.xp += gain; SESS.xp += gain;
  save();

  // Feedback
  const fb = $('#fb'), cardEl = $('#qcard');
  if (correct) {
    const r = cardEl.getBoundingClientRect();
    confetti(innerWidth / 2, r.top + r.height * .45, SESS.combo >= 5 ? 120 : 60, SESS.combo >= 5 ? 1.2 : .8);
    if (SESS.combo > 0 && SESS.combo % 5 === 0) { sfx.combo(); burst(innerWidth / 2, r.top + 60, 16, ['🔥', '⚡', '💥']); toast(`🔥 Combo x${SESS.combo} ! +10 XP bonus`); }
    else sfx.ok();
    fb.innerHTML = `<div class="feedback ok"><div class="head">${pick(OK_MSG)}<span class="xp-pop">+${gain} XP</span></div>
      ${card.a.length > 1 ? `<div class="expl">${tex(card.e)}</div>` : ''}
      ${nextTxt ? `<div class="next">${nextTxt}</div>` : ''}</div>`;
  } else {
    sfx.ko();
    cardEl.classList.remove('qcard'); void cardEl.offsetWidth; cardEl.classList.add('shake');
    fb.innerHTML = `<div class="feedback ko"><div class="head">${pick(KO_MSG)}</div>
      <div class="notion">📌 Notion à revoir : ${tex(card.n)}</div>
      <div class="expl">${tex(card.e)}</div>
      ${nextTxt ? `<div class="next">${nextTxt}</div>` : ''}</div>`;
  }
  fb.insertAdjacentHTML('beforeend', `<button class="btn" id="next" style="margin-top:12px">Continuer →</button>`);
  $('#next').addEventListener('click', () => { SESS.i++; renderCard(); });
  setTimeout(() => $('#next')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 150);

  if (levelOf(st.xp) > lvlBefore) {
    const l = levelOf(st.xp);
    setTimeout(() => { toast(`⭐ Niveau ${l} : <b>${titleOf(l)}</b> !`, 3200); sfx.win(); fireworks(); }, 400);
  }
  checkBadges({ revenge: correct && wasWrong && !item.retry && SESS.mode === 'due' });
  save();
  updateBadge();
}

function renderEnd() {
  const el = $('#v-session'), n = SESS.ok + SESS.ko, pct = n ? Math.round(100 * SESS.ok / n) : 0;
  const perfect = SESS.ko === 0 && n >= 10;
  checkBadges({ perfect }); save();
  const [emoji, msg] = pct === 100 ? ['🏆', 'Sans faute ! Tu es une machine !'] : pct >= 80 ? ['🥇', 'Superbe séance !'] : pct >= 60 ? ['🥈', 'Bien joué, continue comme ça !'] : pct >= 40 ? ['💪', 'Ça progresse, accroche-toi !'] : ['🌱', 'Chaque séance te rend plus fort·e !'];
  el.innerHTML = `
    <div class="panel end" style="margin-top:30px">
      <div class="trophy">${emoji}</div>
      <h2 style="font-size:24px">${msg}</h2>
      <div class="score">${SESS.ok} / ${n}</div>
      <div class="muted">${esc(SESS.title)}</div>
      <div class="tiles" style="margin:18px 0">
        <div class="tile"><div class="v">+${SESS.xp}</div><div class="k">XP gagnés</div></div>
        <div class="tile"><div class="v">🔥 ${SESS.maxCombo}</div><div class="k">meilleur combo</div></div>
        <div class="tile"><div class="v">${pct} %</div><div class="k">de réussite</div></div>
        <div class="tile"><div class="v">${currentStreak()} j</div><div class="k">de série</div></div>
      </div>
      <button class="btn" id="done">Terminer</button>
    </div>`;
  $('#done').addEventListener('click', () => { SESS = null; show('home'); });
  if (pct >= 60) { sfx.win(); fireworks(); } else { sfx.ok(); confetti(innerWidth / 2, innerHeight / 3, 50, .8); }
}

/* ════════════ Progrès ════════════ */

function renderStats() {
  const el = $('#v-stats'), st = S.stats, lvl = levelOf(st.xp), lo = xpFor(lvl), hi = xpFor(lvl + 1);
  const total = st.ok + st.ko, rate = total ? Math.round(100 * st.ok / total) : 0;
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); return dstr(d); });
  const maxDay = Math.max(1, ...days.map(d => (st.days[d]?.ok || 0) + (st.days[d]?.ko || 0)));
  el.innerHTML = `
    <div class="title">Progrès</div>
    <div class="panel">
      <div class="row"><div style="font-size:44px">🧠</div><div class="grow"><h2 style="margin:0">Niveau ${lvl} · ${titleOf(lvl)}</h2><div class="muted">${st.xp} XP au total</div></div></div>
      <div class="xpbar"><i style="width:${Math.round(100 * (st.xp - lo) / (hi - lo))}%"></i></div>
    </div>
    <div class="panel tiles">
      <div class="tile"><div class="v">🔥 ${currentStreak()}</div><div class="k">série actuelle</div></div>
      <div class="tile"><div class="v">🏔️ ${st.best}</div><div class="k">meilleure série</div></div>
      <div class="tile"><div class="v">✅ ${st.ok}</div><div class="k">bonnes réponses</div></div>
      <div class="tile"><div class="v">🎯 ${rate} %</div><div class="k">de réussite</div></div>
    </div>
    <div class="panel">
      <h3>14 derniers jours</h3>
      <div class="bars">${days.map(d => { const v = st.days[d] || { ok: 0, ko: 0 }; return `<div><i class="b" style="height:${100 * v.ko / maxDay}%"></i><i class="g" style="height:${100 * v.ok / maxDay}%"></i></div>`; }).join('')}</div>
      <div class="bars-x">${days.map(d => `<span>${new Date(d + 'T12:00').getDate()}</span>`).join('')}</div>
      <div class="muted" style="margin-top:6px">🟩 réussies · 🟧 ratées</div>
    </div>
    <div class="panel">
      <h3>Maîtrise par chapitre</h3>
      ${DECK.chapters.map(ch => `<div style="margin-bottom:10px"><div class="row"><span class="grow">${ch.emoji} ${esc(ch.name)}</span><b>${Math.round(mastery(ch.id) * 100)} %</b></div><div class="mastery"><i style="width:${Math.round(mastery(ch.id) * 100)}%"></i></div></div>`).join('')}
    </div>
    <div class="panel">
      <h3>Badges · ${Object.keys(st.badges).length} / ${BADGES.length}</h3>
      <div class="badges">${BADGES.map(b => `<div class="badge ${st.badges[b.id] ? '' : 'locked'}" data-b="${b.id}"><div class="e">${b.e}</div><div class="n">${b.n}</div></div>`).join('')}</div>
    </div>`;
  el.querySelectorAll('[data-b]').forEach(x => x.addEventListener('click', () => {
    const b = BADGES.find(y => y.id === x.dataset.b), got = st.badges[b.id];
    toast(`${b.e} <b>${b.n}</b><br><span class="muted">${b.d}${got ? ' · obtenu le ' + frDate(got) : ''}</span>`);
  }));
}

/* ════════════ Paramètres ════════════ */

function renderSettings() {
  const el = $('#v-settings'), st = S.settings;
  let photo = null;
  try { photo = localStorage.getItem(PHOTO); } catch (e) { /* rien */ }
  el.innerHTML = `
    <div class="title">Paramètres</div>

    <div class="panel">
      <h2>📅 Rythme de révision</h2>
      <div id="paliers">${st.intervals.map((n, i) => `
        <div class="palier"><span class="n">${i + 1}</span><span class="grow">Palier ${i + 1}</span>
          <input class="num" type="number" inputmode="numeric" min="1" max="999" value="${n}" data-i="${i}"> <span class="muted">j</span>
          <button class="x" data-rm="${i}" ${st.intervals.length <= 2 ? 'disabled' : ''}>✕</button></div>`).join('')}
      </div>
      <button class="btn small ghost" id="addp" style="margin-top:8px">+ Ajouter un palier</button>
      <div class="palier" style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px">
        <span class="grow">Après une erreur, la bonne réponse suivante fait monter de</span>
        <input class="num" type="number" inputmode="numeric" min="1" max="9" value="${st.jump}" id="jump"> <span class="muted">paliers</span>
      </div>
      <div class="timeline" id="timeline"></div>
      <button class="btn small ghost" id="resetp" style="margin-top:10px">Rétablir le rythme par défaut</button>
    </div>

    <div class="panel">
      <h2>🖼️ Fond d'écran</h2>
      <div class="swatches">
        ${Object.entries(BGS).map(([k, [name, css]]) => `<button class="sw ${st.bg === k ? 'on' : ''}" data-bg="${k}" style="background:${css}">${name}</button>`).join('')}
        <label class="sw ${st.bg === 'color' ? 'on' : ''}" style="background:${st.bgColor}">Couleur<input type="color" id="bgcolor" value="${st.bgColor}"></label>
        <label class="sw ${st.bg === 'photo' ? 'on' : ''}" style="background:${photo ? `url(${photo}) center/cover` : '#888'}">📷 Photo<input type="file" accept="image/*" id="bgphoto"></label>
      </div>
    </div>

    <div class="panel">
      <h2>🎨 Couleur principale</h2>
      <div class="accents">
        ${ACCENTS.map(c => `<button class="dot-sw ${st.accent === c ? 'on' : ''}" data-ac="${c}" style="background:${c}"></button>`).join('')}
        <label class="dot-sw ${ACCENTS.includes(st.accent) ? '' : 'on'}" style="background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)"><input type="color" id="accent" value="${st.accent}"></label>
      </div>
    </div>

    <div class="panel">
      <h2>🔔 Rappel quotidien</h2>
      <div class="row"><span class="grow">Heure du rappel</span><input type="time" id="rtime" value="${st.reminder}"></div>
      <button class="btn" id="ics" style="margin-top:12px">Ajouter le rappel à mon calendrier</button>
      <p class="muted">L'iPhone t'enverra une alerte chaque jour à cette heure. Pour changer d'heure, supprime l'ancien événement « Flash Maths » dans Calendrier, puis ajoute le nouveau.</p>
    </div>

    <div class="panel">
      <h2>🧹 Progression</h2>
      <button class="btn danger" id="wipe">Remettre toute la progression à zéro</button>
      <p class="muted" style="margin-top:12px">Flash Maths · ${DECK.cards.length} cartes · ${DECK.chapters.length} chapitres</p>
    </div>`;

  const P = st.intervals;
  const timeline = () => {
    const tl = $('#timeline', el);
    let s = '✅ Bonne réponse : ' + P.map(dur).join(' → ') + '.';
    const back = P[Math.min(st.jump, P.length - 1)];
    s += `<br>❌ Erreur : retour à « ${dur(P[0])} ». La bonne réponse suivante remonte directement à « ${dur(back)} ».`;
    tl.innerHTML = s;
  };
  timeline();
  el.querySelectorAll('.num[data-i]').forEach(inp => inp.addEventListener('change', () => {
    const v = Math.max(1, Math.min(999, parseInt(inp.value, 10) || 1));
    P[+inp.dataset.i] = v; inp.value = v; save(); timeline();
  }));
  el.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { P.splice(+b.dataset.rm, 1); save(); renderSettings(); }));
  $('#addp', el).addEventListener('click', () => { P.push(Math.min(999, P[P.length - 1] * 2)); save(); renderSettings(); });
  $('#jump', el).addEventListener('change', e => { st.jump = Math.max(1, Math.min(9, parseInt(e.target.value, 10) || 1)); e.target.value = st.jump; save(); timeline(); });
  $('#resetp', el).addEventListener('click', () => { st.intervals = DEFAULTS.intervals.slice(); st.jump = DEFAULTS.jump; save(); renderSettings(); toast('Rythme par défaut rétabli'); });

  el.querySelectorAll('[data-bg]').forEach(b => b.addEventListener('click', () => { st.bg = b.dataset.bg; save(); applyTheme(); renderSettings(); }));
  $('#bgcolor', el).addEventListener('input', e => { st.bg = 'color'; st.bgColor = e.target.value; save(); applyTheme(); });
  $('#bgcolor', el).addEventListener('change', () => renderSettings());
  $('#bgphoto', el).addEventListener('change', e => { const f = e.target.files[0]; if (f) setPhoto(f); });

  el.querySelectorAll('[data-ac]').forEach(b => b.addEventListener('click', () => { st.accent = b.dataset.ac; save(); applyTheme(); renderSettings(); }));
  $('#accent', el).addEventListener('input', e => { st.accent = e.target.value; save(); applyTheme(); });
  $('#accent', el).addEventListener('change', () => renderSettings());

  $('#rtime', el).addEventListener('change', e => { st.reminder = e.target.value || '18:00'; save(); });
  $('#ics', el).addEventListener('click', downloadReminder);

  $('#wipe', el).addEventListener('click', () => {
    if (!confirm('Effacer toute la progression (cartes, séries, XP, badges) ? Les réglages sont conservés.')) return;
    S.cards = {}; S.stats = {};
    save(); S = load(); toast('Progression remise à zéro'); show('home');
  });
}

function setPhoto(file) {
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const max = 1400, k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    try {
      localStorage.setItem(PHOTO, c.toDataURL('image/jpeg', 0.82));
      S.settings.bg = 'photo'; save(); applyTheme(); renderSettings(); toast('📷 Fond d\'écran mis à jour');
    } catch (e) { toast('Image trop lourde, essaie une autre photo'); }
  };
  img.onerror = () => toast('Impossible de lire cette image');
  img.src = url;
}

function downloadReminder() {
  const [h, m] = (S.settings.reminder || '18:00').split(':');
  const d = new Date(); d.setDate(d.getDate() + 1);
  const start = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${h}${m}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const url = location.href.split('#')[0];
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Flash Maths//FR', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:flashmaths-${Date.now()}@flashmaths`, `DTSTAMP:${stamp}`,
    `DTSTART:${start}`, 'DURATION:PT10M', 'RRULE:FREQ=DAILY',
    'SUMMARY:🧠 Flash Maths : mes cartes du jour', `DESCRIPTION:Ouvre Flash Maths pour garder ta série ! ${url}`, `URL:${url}`,
    'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:C\'est l\'heure des Flash Maths ! 🔥', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
  a.download = 'rappel-flash-maths.ics';
  document.body.appendChild(a); a.click(); a.remove();
}

/* ════════════ Démarrage ════════════ */

function announceNewCards() {
  const ids = DECK.cards.map(c => c.id);
  if (S.known) {
    const fresh = ids.filter(id => !S.known.includes(id)).length;
    if (fresh) setTimeout(() => { toast(`🎁 ${fresh} nouvelle${fresh > 1 ? 's' : ''} carte${fresh > 1 ? 's' : ''} !`, 3500); burst(innerWidth / 2, 90, 25, ['🎁', '✨', '📚']); }, 600);
  }
  S.known = ids; save();
}

$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') e.currentTarget.hidden = true; });

function boot() {
  applyTheme();
  show('home');
  announceNewCards();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
// KaTeX est chargé en defer avant ce fichier : il est donc prêt ici (sauf hors-ligne au tout premier lancement).
boot();
document.addEventListener('visibilitychange', () => { if (!document.hidden && current === 'home') renderHome(); });
