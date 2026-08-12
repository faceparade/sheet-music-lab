import { buildSession, calculateProgress, getDueCards, gradeCard, validateCurriculum } from './portal-core.mjs';

const [curriculum, cards, resources] = await Promise.all([
  fetch('./data/curriculum.json').then(assertResponse).then(r => r.json()),
  fetch('./data/cards.json').then(assertResponse).then(r => r.json()),
  fetch('./data/resources.json').then(assertResponse).then(r => r.json())
]);

const errors = validateCurriculum(curriculum);
if (errors.length) throw new Error(errors.join('\n'));

const STORAGE_KEY = 'sheet-music-lab-state-v1';
const defaultState = { completedLessons: [], cardProgress: {}, practiceLog: [], streak: 0, lastPractice: null };
let state = loadState();
let metronome = { timer: null, audio: null, beat: 0 };
let activeCard = 0;
let cardRevealed = false;

const view = document.querySelector('#view');
const pageTitle = document.querySelector('#page-title');
const dialog = document.querySelector('#lesson-dialog');
const lessonDetail = document.querySelector('#lesson-detail');

function assertResponse(response) {
  if (!response.ok) throw new Error(`Could not load ${response.url}: ${response.status}`);
  return response;
}
function loadState() {
  try { return { ...defaultState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') }; }
  catch { return { ...defaultState }; }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  updateChrome();
}
function today() { return new Date().toISOString().slice(0, 10); }
function esc(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
}
function markPractice() {
  const current = today();
  if (state.lastPractice === current) return;
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  state.streak = state.lastPractice === yesterday.toISOString().slice(0, 10) ? state.streak + 1 : 1;
  state.lastPractice = current;
  saveState();
}
function updateChrome() {
  const progress = calculateProgress(curriculum, state.completedLessons);
  document.querySelector('#side-progress').style.width = `${progress}%`;
  document.querySelector('#side-progress-label').textContent = `${state.completedLessons.length} of ${curriculum.lessons.length} lessons`;
  document.querySelector('#streak-count').textContent = state.streak;
}
function notify(message) {
  document.querySelector('.toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'toast'; toast.textContent = message;
  document.body.append(toast); setTimeout(() => toast.remove(), 2200);
}
function currentRoute() { return location.hash.replace('#', '') || 'dashboard'; }
function dueCards() {
  return getDueCards(cards.map(card => ({ ...card, ...(state.cardProgress[card.id] || {}) })), today());
}
function nextLesson() {
  return curriculum.lessons.find(lesson => !state.completedLessons.includes(lesson.id)) || curriculum.lessons[0];
}
function setTitle(title) { pageTitle.textContent = title; document.title = `${title} · Sheet Music Lab`; }

function render() {
  stopMetronome();
  const route = currentRoute();
  document.querySelectorAll('[data-route]').forEach(link => link.classList.toggle('active', link.dataset.route === route));
  const pages = { dashboard: renderDashboard, course: renderCourse, practice: renderPractice, cards: renderCards, resources: renderResources };
  (pages[route] || renderDashboard)();
  document.querySelector('.sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function renderDashboard() {
  setTitle("Today's studio");
  const lesson = nextLesson();
  const session = buildSession(curriculum, { completedLessons: state.completedLessons, reviewDue: dueCards().length });
  const progress = calculateProgress(curriculum, state.completedLessons);
  view.innerHTML = `
    <div class="hero-grid">
      <article class="hero-card">
        <span class="kicker">Your next session · ${session.totalMinutes} minutes</span>
        <h1>Turn marks on a page into motion.</h1>
        <p class="lede">A practical reading course built around your TD-07: recall the symbol, hear the rhythm, play through it, then use Coach mode for honest timing feedback.</p>
        <div class="hero-actions">
          <button class="button" data-open-lesson="${esc(lesson.id)}">Begin: ${esc(lesson.title)}</button>
          <a class="button secondary" href="#practice">Open rhythm lab</a>
        </div>
      </article>
      <aside class="session-panel panel">
        <header><div><span>DAILY PLAN</span><h3>One focused pass</h3></div><strong>${session.totalMinutes}:00</strong></header>
        <div class="session-list">${session.blocks.map((block, i) => {
          const destination = block.lessonId
            ? `<button class="session-item" data-open-lesson="${esc(block.lessonId)}" aria-label="Open ${esc(block.title)} lesson">`
            : `<a class="session-item" href="#${esc(block.route || 'dashboard')}" aria-label="Open ${esc(block.title)}">`;
          return `${destination}<span class="num">0${i + 1}</span><span class="session-copy"><strong>${esc(block.title)}</strong><small>${esc(block.detail || 'New material')}</small></span><span>${block.minutes}m</span>${block.lessonId ? '</button>' : '</a>'}`;
        }).join('')}
        </div>
      </aside>
    </div>
    <div class="stats">
      <div class="stat-card"><strong>${progress}%</strong><span>course complete</span></div>
      <div class="stat-card"><strong>${state.completedLessons.length}</strong><span>lessons finished</span></div>
      <div class="stat-card"><strong>${dueCards().length}</strong><span>cards due</span></div>
      <div class="stat-card"><strong>${state.practiceLog.length}</strong><span>coach sessions logged</span></div>
    </div>
    <section class="section">
      <div class="section-head"><div><span>THE PATH</span><h2>Eight weeks from pulse to pitch</h2></div><a class="button secondary small" href="#course">View full course</a></div>
      <div class="module-strip">${curriculum.modules.map(module => {
        const complete = module.lessons.every(id => state.completedLessons.includes(id));
        const current = module.lessons.includes(lesson.id);
        return `<div class="module-mini ${current ? 'current' : ''}"><small>W${module.week} · ${complete ? 'COMPLETE' : current ? 'CURRENT' : 'UP NEXT'}</small><strong>${esc(module.title)}</strong></div>`;
      }).join('')}</div>
    </section>`;
  bindLessonButtons();
}

function renderCourse() {
  setTitle('Course map');
  view.innerHTML = `
    <div class="intro"><span class="kicker">Eight weeks · Sixteen lessons</span><h1>Build fluency in layers.</h1><p>Move through the path in order or open any lesson. Each lesson has one concrete objective, a short sequence, and a feedback method.</p></div>
    <div class="course-grid">${curriculum.modules.map(module => `
      <article class="module-card">
        <div class="module-head"><div class="week-badge">W${module.week}</div><div><h2>${esc(module.title)}</h2><p>${esc(module.summary)}</p></div></div>
        <div class="lesson-list">${module.lessons.map(id => {
          const lesson = curriculum.lessons.find(item => item.id === id);
          const complete = state.completedLessons.includes(id);
          return `<button class="lesson-row ${complete ? 'complete' : ''}" data-open-lesson="${id}"><span class="check">${complete ? '✓' : ''}</span><span><strong>${esc(lesson.title)}</strong><small>${esc(lesson.objective)}</small></span><small>${lesson.minutes} MIN</small></button>`;
        }).join('')}</div>
      </article>`).join('')}</div>`;
  bindLessonButtons();
}

function renderPractice() {
  setTitle('Rhythm lab');
  const exercises = curriculum.exercises;
  view.innerHTML = `
    <div class="intro"><span class="kicker">Sight-reading workbench</span><h1>Preview once. Play through.</h1><p>Generate a short, unfamiliar line. Count first, then perform without stopping. Use the TD-07 prompt beside it to choose your feedback mode.</p></div>
    <div class="lab-grid">
      <section class="panel">
        <div class="section-head"><div><span>UNSEEN EXERCISE</span><h2 id="exercise-title">Reading line</h2></div><button class="button small" id="new-exercise">New line</button></div>
        <div class="controls">
          <div class="control-field"><label>LEVEL</label><select id="difficulty"><option value="all">Mixed</option><option value="1">1 · Pulse</option><option value="2">2 · Eighths</option><option value="3">3 · Offbeats</option><option value="4">4 · Sixteenths / kit</option></select></div>
          <div class="control-field"><label>TEMPO</label><input id="tempo" type="number" min="35" max="180" value="60" size="4"> BPM</div>
          <button class="button secondary small" id="metronome">Start click</button>
        </div>
        <div class="notation-stage" id="notation-stage"></div>
        <div class="controls"><button class="button secondary small" id="reveal-count">Reveal count</button><button class="button secondary small" id="complete-attempt">Log one attempt</button></div>
        <div class="coach-box"><strong id="coach-mode">TD-07 · TIME CHECK</strong><p id="coach-prompt">Set a comfortable tempo. Aim for alignment, not speed. If the pulse breaks repeatedly, make the line easier.</p></div>
      </section>
      <aside class="panel">
        <div class="section-head"><div><span>FEEDBACK LOG</span><h2>Record the result</h2></div></div>
        <form class="log-form" id="log-form">
          <label>Coach mode<select name="mode"><option>TIME CHECK</option><option>QUIET COUNT</option><option>AUTO UP/DOWN</option><option>CHANGE UP</option></select></label>
          <label>Timing score / 100<input name="score" type="number" min="0" max="100" value="70" required></label>
          <label>Main issue<select name="issue"><option>None — clean pass</option><option>Lost the pulse</option><option>Rushed</option><option>Dragged</option><option>Missed a rest</option><option>Misread subdivision</option><option>Limb coordination</option></select></label>
          <button class="button" type="submit">Save coach result</button>
        </form>
        <div class="history" id="history"></div>
      </aside>
    </div>`;
  let current = exercises[0];
  const glyph = { q:'♩', qr:'𝄽', ee:'♫', 'er-e':'𝄾 ♪', 'e-er':'♪ 𝄾', xxxx:'♬♬', xx:'♬', 'HH+BD':'× + ●', HH:'×', 'HH+SD':'× + ◆' };
  function chooseExercise() {
    const level = document.querySelector('#difficulty').value;
    const pool = level === 'all' ? exercises : exercises.filter(item => String(item.difficulty) === level);
    const alternatives = pool.filter(item => item.id !== current?.id);
    current = (alternatives.length ? alternatives : pool)[Math.floor(Math.random() * (alternatives.length || pool.length))];
    document.querySelector('#tempo').value = current.tempo;
    drawExercise(false);
  }
  function drawExercise(reveal) {
    const stage = document.querySelector('#notation-stage');
    const beats = current.pattern.map(token => `<span class="beat">${esc(glyph[token] || token)}</span>`).join('');
    const counts = current.count.split(' ').slice(0, current.pattern.length).map(value => `<span>${esc(value)}</span>`).join('');
    stage.innerHTML = `<div class="notation-meta"><span>${esc(current.meter)}</span><span>EXERCISE ${esc(current.id.toUpperCase())}</span></div><div class="rhythm-line">${beats}</div>${reveal ? `<div class="count-line">${counts}</div>` : ''}`;
    const lesson = curriculum.lessons.find(item => item.id === current.lessonId);
    document.querySelector('#exercise-title').textContent = lesson?.title || 'Reading line';
    document.querySelector('#coach-mode').textContent = `TD-07 · ${lesson?.coach || 'TIME CHECK'}`;
  }
  function renderHistory() {
    const recent = state.practiceLog.slice(-5).reverse();
    document.querySelector('#history').innerHTML = recent.length ? `<h3>Recent sessions</h3>${recent.map(log => `<div class="history-row"><span>${esc(log.mode)}</span><strong>${log.score}</strong><small>${esc(log.date)}</small></div>`).join('')}` : '<p class="empty">No sessions logged yet.</p>';
  }
  drawExercise(false); renderHistory();
  document.querySelector('#new-exercise').onclick = chooseExercise;
  document.querySelector('#difficulty').onchange = chooseExercise;
  document.querySelector('#reveal-count').onclick = () => drawExercise(true);
  document.querySelector('#complete-attempt').onclick = () => { markPractice(); notify('Attempt counted. Draw a new line next.'); };
  document.querySelector('#metronome').onclick = toggleMetronome;
  document.querySelector('#log-form').onsubmit = event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    state.practiceLog.push({ date: today(), mode: data.get('mode'), score: Number(data.get('score')), issue: data.get('issue'), exerciseId: current.id });
    markPractice(); saveState(); renderHistory(); notify('Coach result saved locally.');
  };
}

function renderCards() {
  setTitle('Recall deck');
  const deck = dueCards();
  if (activeCard >= deck.length) activeCard = 0;
  const card = deck[activeCard];
  view.innerHTML = `
    <div class="intro"><span class="kicker">Spaced retrieval</span><h1>Answer before you reveal.</h1><p>Cards you recall return after a growing interval. Missed cards reset for tomorrow. Your schedule stays in this browser.</p></div>
    ${card ? `<div class="card-stage"><div class="flashcard" id="flashcard"><div><div class="${cardRevealed ? 'answer' : 'face'}">${esc(cardRevealed ? card.back : card.front)}</div><small>${esc(cardRevealed ? card.hint : 'Click to reveal the answer')}</small></div></div><div class="grade-row" ${cardRevealed ? '' : 'hidden'}><button class="button secondary" data-grade="miss">Missed it</button><button class="button" data-grade="know">Recalled it</button></div><p class="empty" style="text-align:center">${activeCard + 1} / ${deck.length} due now</p></div>` : `<div class="panel"><h2>Deck cleared for today.</h2><p class="lede">Return tomorrow, or continue with an unfamiliar rhythm line.</p><a class="button" href="#practice">Open rhythm lab</a></div>`}`;
  document.querySelector('#flashcard')?.addEventListener('click', () => { cardRevealed = true; renderCards(); });
  document.querySelectorAll('[data-grade]').forEach(button => button.onclick = () => {
    const updated = gradeCard(card, button.dataset.grade === 'know', today());
    state.cardProgress[card.id] = { streak: updated.streak, interval: updated.interval, due: updated.due };
    markPractice(); saveState(); cardRevealed = false; activeCard = 0; renderCards();
  });
}

function renderResources() {
  setTitle('Supplies & references');
  const supplies = [
    ['TD-07 or practice surface', 'Primary rhythm feedback and movement practice.'],
    ['Sticks + headphones', 'Use safe listening levels and relaxed technique.'],
    ['Pencil + staff paper', 'Circle attacks, write counts, and notate ideas.'],
    ['Metronome', 'The TD-07 click is enough; no extra purchase needed.'],
    ['Keyboard map or browser piano', 'Build landmark-pitch mapping without owning a piano.'],
    ['Music stand', 'Optional, but helps maintain a useful reading position.']
  ];
  view.innerHTML = `
    <div class="intro"><span class="kicker">The course cabinet</span><h1>Everything needed to study.</h1><p>The required setup stays deliberately small. External links extend the course with generated material, an online keyboard, equipment instructions, and research.</p></div>
    <section><div class="section-head"><div><span>SUPPLY LIST</span><h2>Start with what you have</h2></div></div><div class="supply-list">${supplies.map(([title, note]) => `<div class="supply"><strong>${esc(title)}</strong><p>${esc(note)}</p></div>`).join('')}</div></section>
    <section class="section"><div class="section-head"><div><span>LIBRARY</span><h2>Practice and evidence</h2></div></div><div class="resource-grid">${resources.map(resource => `<article class="resource-card"><span class="tag">${esc(resource.type.toUpperCase())}</span><h3>${esc(resource.title)}</h3><p>${esc(resource.note)}</p><a href="${esc(resource.url)}" target="_blank" rel="noreferrer">Open resource ↗</a></article>`).join('')}</div></section>`;
}

function bindLessonButtons() {
  document.querySelectorAll('[data-open-lesson]').forEach(button => button.onclick = () => openLesson(button.dataset.openLesson));
}
function openLesson(id) {
  const lesson = curriculum.lessons.find(item => item.id === id);
  if (!lesson) return;
  const complete = state.completedLessons.includes(id);
  lessonDetail.innerHTML = `<span class="kicker">${esc(lesson.kind)} · ${lesson.minutes} minutes</span><h1>${esc(lesson.title)}</h1><div class="objective"><strong>Objective</strong><p>${esc(lesson.objective)}</p></div><h3>Studio sequence</h3><ol>${lesson.steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol><div class="coach-box"><strong>FEEDBACK MODE</strong><p>${esc(lesson.coach)}</p></div><div class="hero-actions"><button class="button" id="finish-lesson">${complete ? 'Mark incomplete' : 'Complete lesson'}</button>${lesson.kind !== 'pitch' ? '<a class="button secondary" href="#practice" id="lesson-practice">Open rhythm lab</a>' : '<a class="button secondary" href="https://www.musicca.com/piano" target="_blank" rel="noreferrer">Open virtual piano</a>'}</div>`;
  document.querySelector('#finish-lesson').onclick = () => {
    state.completedLessons = complete ? state.completedLessons.filter(item => item !== id) : [...new Set([...state.completedLessons, id])];
    if (!complete) markPractice(); saveState(); dialog.close(); render(); notify(complete ? 'Lesson reopened.' : 'Lesson completed.');
  };
  document.querySelector('#lesson-practice')?.addEventListener('click', () => dialog.close());
  dialog.showModal();
}

function toggleMetronome() {
  if (metronome.timer) { stopMetronome(); return; }
  const bpm = Math.max(35, Math.min(180, Number(document.querySelector('#tempo').value) || 60));
  metronome.audio = new AudioContext();
  const tick = () => {
    const osc = metronome.audio.createOscillator(); const gain = metronome.audio.createGain();
    osc.frequency.value = metronome.beat % 4 === 0 ? 1100 : 760; gain.gain.value = .08;
    osc.connect(gain).connect(metronome.audio.destination); osc.start(); osc.stop(metronome.audio.currentTime + .045); metronome.beat++;
  };
  tick(); metronome.timer = setInterval(tick, 60_000 / bpm);
  document.querySelector('#metronome').textContent = 'Stop click';
}
function stopMetronome() {
  clearInterval(metronome.timer); metronome.timer = null; metronome.beat = 0;
  metronome.audio?.close(); metronome.audio = null;
  const button = document.querySelector('#metronome'); if (button) button.textContent = 'Start click';
}

document.querySelector('.dialog-close').onclick = () => dialog.close();
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
document.querySelector('#menu-button').onclick = () => document.querySelector('.sidebar').classList.toggle('open');
document.querySelector('#reset-button').onclick = () => {
  if (!confirm('Reset all lesson, card, streak, and practice-log data stored in this browser?')) return;
  state = { ...defaultState, completedLessons: [], cardProgress: {}, practiceLog: [] }; saveState(); render(); notify('Local progress reset.');
};
window.addEventListener('hashchange', render);
updateChrome(); render();
