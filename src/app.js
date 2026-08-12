import { buildSession, calculateProgress, getDueCards, gradeCard, validateCurriculum, auditLearningSequence, auditRecallCoverage, auditDrumNotation } from './portal-core.mjs';

const [curriculum, cards, resources] = await Promise.all([
  fetch('./data/curriculum.json').then(assertResponse).then(r => r.json()),
  fetch('./data/cards.json').then(assertResponse).then(r => r.json()),
  fetch('./data/resources.json').then(assertResponse).then(r => r.json())
]);

const errors = [...validateCurriculum(curriculum), ...auditLearningSequence(curriculum), ...auditRecallCoverage(curriculum, cards), ...auditDrumNotation(curriculum)];
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
const drumPositions = { crash: 12, hihat: 22, ride: 32, highTom: 40, snare: 56, midTom: 64, floorTom: 72, bass: 82 };
function drumNoteMarkup(voice, x, { stem = true, dot = false, tie = false } = {}) {
  const y = drumPositions[voice] ?? drumPositions.snare;
  const cymbal = ['crash', 'hihat', 'ride'].includes(voice);
  const head = cymbal
    ? `<path class="notehead-x" d="M${x - 5} ${y - 5}L${x + 5} ${y + 5}M${x + 5} ${y - 5}L${x - 5} ${y + 5}"/>`
    : `<ellipse class="notehead" cx="${x}" cy="${y}" rx="6" ry="4.5"/>`;
  const stemMarkup = stem ? `<path class="stem" d="M${x + 5} ${y}V${y - 28}"/>` : '';
  const dotMarkup = dot ? `<circle class="augmentation-dot" cx="${x + 12}" cy="${y}" r="2.2"/>` : '';
  const tieMarkup = tie ? `<path class="tie" d="M${x + 7} ${y + 7}Q${x + 25} ${y + 17} ${x + 43} ${y + 7}"/>` : '';
  return `${head}${stemMarkup}${dotMarkup}${tieMarkup}`;
}
function staffMarkup(events = [], { label = 'Drum-set notation example', rest = '', tie = false, dot = false } = {}) {
  const lines = [36, 48, 60, 72, 84].map(y => `<line class="staff-line" x1="10" y1="${y}" x2="230" y2="${y}"/>`).join('');
  const noteEvents = events.length ? events : [{ voice: 'snare', x: 72 }];
  const notes = noteEvents.map(event => drumNoteMarkup(event.voice, event.x ?? 72, { dot: event.dot || dot, tie: event.tie || tie })).join('');
  const restMarkup = rest ? `<text class="rest-glyph" x="72" y="68">${esc(rest)}</text>` : '';
  return `<svg class="staff-notation" viewBox="0 -20 240 124" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${lines}${notes}${restMarkup}</svg>`;
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
  const pages = { dashboard: renderDashboard, start: renderStart, kit: renderKitGuide, legend: renderLegend, help: renderHelp, course: renderCourse, practice: renderPractice, cards: renderCards, resources: renderResources };
  const lessonRoute = route.match(/^lesson\/(.+)$/);
  if (lessonRoute) { openLesson(lessonRoute[1]); return; }
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
          <a class="button" href="#cards">Begin: Recall the symbols</a>
          <button class="button secondary" data-open-lesson="${esc(lesson.id)}">Then: ${esc(lesson.title)}</button>
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

function renderStart() {
  setTitle('Start here');
  view.innerHTML = `
    <div class="intro"><span class="kicker">First visit · 10 minutes</span><h1>Set up once. Then follow one next step at a time.</h1><p>You do not need to read music or know drum names. This course teaches each mark, its TD-07 target, and the movement before it asks you to play.</p></div>
    <section class="priority-panel panel"><span>START WITH THIS</span><h2>1. Learn your kit targets</h2><p>Find the snare, kick, hi-hat, crash, and ride from your seated position. You will use these names later.</p><a class="button" href="#kit">Open TD-07 kit guide</a></section>
    <div class="path-steps"><article><span>02</span><h3>Learn the notation</h3><p>Use the short legend whenever a mark is unfamiliar.</p><a href="#legend">Open notation legend</a></article><article><span>03</span><h3>Begin the routine</h3><p>Recall first, take one lesson, then make one slow attempt.</p><a href="#dashboard">Go to today’s plan</a></article><article><span>04</span><h3>Use a recovery rule</h3><p>If something breaks, slow down and isolate one layer.</p><a href="#help">See troubleshooting</a></article></div>
    <section class="section"><div class="section-head"><div><span>COMFORT & SAFETY</span><h2>Play without forcing it</h2></div></div><div class="supply-list"><div class="supply"><strong>Set your seat</strong><p>Sit high enough that thighs slope gently down. Keep the kick pedal close enough that you do not reach or lock your knee.</p></div><div class="supply"><strong>Use relaxed motion</strong><p>Keep shoulders loose. Let sticks rebound instead of pressing into the pad. Stop if you feel pain, numbness, or strain.</p></div><div class="supply"><strong>Protect your hearing</strong><p>Start headphone volume low. You should still be able to hear the click and play comfortably without ringing afterward.</p></div></div></section>`;
}

function renderKitGuide() {
  setTitle('TD-07 kit guide');
  view.innerHTML = `<div class="intro"><span class="kicker">Before your first groove</span><h1>Find each target from the player’s seat.</h1><p>“Left” and “right” below mean your left and right while seated at the TD-07. If your kit was customized, the sound assignment can differ—use the module’s kit settings or your TD-07 manual to confirm it.</p></div><section class="kit-map panel"><div class="kit-center"><b>YOU</b><small>seated player</small></div><div class="kit-target hat"><b>Left: HI-HAT</b><span>cymbal pad + pedal</span></div><div class="kit-target snare"><b>Center: SNARE</b><span>large middle pad</span></div><div class="kit-target kick"><b>Below: KICK</b><span>pedal + kick pad</span></div><div class="kit-target crash"><b>Right: CRASH</b><span>right cymbal pad</span></div><div class="kit-target ride"><b>Far right: RIDE</b><span>right ride pad</span></div></section><section class="section"><div class="section-head"><div><span>TOUCH CHECK</span><h2>Do this once, slowly</h2></div></div><ol class="plain-list"><li>Put on headphones and set a low, comfortable volume.</li><li>Tap the center snare pad once with a relaxed stick stroke.</li><li>Press the kick pedal once with a relaxed foot motion.</li><li>Hold the hi-hat pedal down, then tap the left cymbal pad for a closed hi-hat.</li><li>Tap the right crash and ride pads once each. Do not chase speed yet.</li></ol><div class="hero-actions"><a class="button" href="#legend">Next: learn the marks</a><a class="button secondary" href="#dashboard">I know my kit — begin today</a></div></section>`;
}

function renderLegend() {
  setTitle('Notation legend');
  const rows = [
    [staffMarkup([{ voice: 'snare', x: 76 }], { label: 'Regular oval notehead at the snare position' }), 'Snare', 'A regular oval notehead in this course’s middle snare position. Strike the center TD-07 snare pad.'],
    [staffMarkup([{ voice: 'bass', x: 76 }], { label: 'Regular oval notehead at the bass drum position' }), 'Bass drum / kick', 'The same regular oval notehead, written low in the staff. Press the TD-07 kick pedal.'],
    [staffMarkup([{ voice: 'hihat', x: 76 }], { label: 'X notehead at the closed hi-hat position' }), 'Closed hi-hat', 'An x-shaped cymbal notehead. Keep the hi-hat pedal down and strike the left cymbal pad.'],
    [staffMarkup([{ voice: 'ride', x: 76 }], { label: 'X notehead at the ride position' }), 'Ride cymbal', 'An x-shaped cymbal notehead in this course’s ride position. Strike the right ride pad.'],
    [staffMarkup([{ voice: 'crash', x: 76 }], { label: 'X notehead at the crash position' }), 'Crash cymbal', 'An x-shaped cymbal notehead high above the staff. Strike the right crash pad and let it ring.'],
    [staffMarkup([{ voice: 'hihat', x: 76 }, { voice: 'bass', x: 76 }], { label: 'Hi-hat and bass drum vertically stacked on the same beat' }), 'Together: vertical stack', 'Notes sharing one vertical beat position happen together. This is not a plus sign between symbols.'],
    [staffMarkup([], { label: 'Quarter rest on a five-line percussion staff', rest: '𝄽' }), 'Quarter rest', 'One beat of silence. Keep counting; do not strike a pad.'],
    [staffMarkup([{ voice: 'snare', x: 64 }, { voice: 'snare', x: 116 }], { label: 'Tie connecting two snare notes', tie: true }), 'Tie', 'The curved line joins same-position notes into one duration: attack only the first note.'],
    [staffMarkup([{ voice: 'snare', x: 76, dot: true }], { label: 'Dotted snare note' }), 'Dot', 'The dot immediately after a note adds half of that note’s value.'],
    ['♩ · ♫', 'Rhythm values', 'Quarter notes, paired eighths, beams, and rests tell you when to play. The staff position and notehead tell you what to play.']
  ];
  view.innerHTML = `<div class="intro"><span class="kicker">Course drum key · keep this nearby</span><h1>Read the marks used in this course.</h1><p>Each picture is a real five-line percussion-staff example: first identify the notehead and position, then name the TD-07 target and action. A measure is one group of beats between barlines; in 4/4 count 1 2 3 4.</p></div><section class="notation-principle panel"><strong>OUR BEGINNER HOUSE STYLE</strong><p>Regular oval noteheads are drums; x noteheads are cymbals. The vertical position identifies the kit voice, and vertically aligned notes happen together. This is a common drum-set layout, not a universal law: publisher keys and editable notation-software drum maps can differ. Always check a new chart’s key.</p></section><section class="legend-grid">${rows.map(([mark, name, meaning]) => `<article class="legend-item"><div class="notation-sample">${mark}</div><div><h3>${name}</h3><p>${meaning}</p></div></article>`).join('')}</section><div class="priority-panel panel"><span>WHEN YOU SEE A NEW MARK</span><h2>Say it before you play it.</h2><p>Name the mark, identify the TD-07 target, rehearse the motion once, then add it to the count.</p><a class="button" href="#cards">Practice recall now</a></div>`;
}

function renderHelp() {
  setTitle('Practice help');
  const fixes = [['I lost the count','Stop, clap the rhythm while saying the count, and restart at half the tempo.'],['My hands and feet fall apart','Practice one limb, then two layers, then the full stack.'],['I rushed or dragged','Lower the tempo 5–10 BPM and let the click lead; do not fix it by speeding up.'],['My hi-hat sounds open','Hold the hi-hat pedal down before you strike the left cymbal pad.'],['I do not recognize a mark','Open the notation legend, then use its matching recall card before trying again.'],['I made a mistake in sight reading','Keep the pulse going. Circle the problem afterward and retry slowly.']];
  view.innerHTML = `<div class="intro"><span class="kicker">Recovery, not failure</span><h1>When something goes wrong, make the task smaller.</h1><p>A slow, steady pass is more useful than a fast, tense one. Choose one fix below, then return to today’s next step.</p></div><section class="help-list">${fixes.map(([problem,fix]) => `<article><h2>${problem}</h2><p>${fix}</p></article>`).join('')}</section><section class="priority-panel panel"><span>READY TO MOVE ON?</span><h2>Use a simple mastery check.</h2><p>Move forward after you can name the marks without revealing them and make two steady, comfortable passes at the lesson tempo. If either part is shaky, repeat the short routine tomorrow.</p><a class="button" href="#dashboard">Return to today’s plan</a></section><section class="section"><div class="section-head"><div><span>FINISH LINE</span><h2>Foundation-course check</h2></div></div><div class="supply-list"><div class="supply"><strong>Recognize</strong><p>Identify rhythm values and the snare, kick, and cymbal marks without help.</p></div><div class="supply"><strong>Read</strong><p>Preview, count, and play two unfamiliar short lines without stopping.</p></div><div class="supply"><strong>Perform</strong><p>Keep a basic layered groove steady at a comfortable tempo. Then choose one focused next skill.</p></div></div></section>`;
}

function renderCourse() {
  setTitle('Course map');
  view.innerHTML = `
    <div class="intro"><span class="kicker">Eight weeks · Sixteen lessons</span><h1>Build fluency in layers.</h1><p>Move through the TD-07 path in order. Each lesson has one concrete objective, a short sequence, and a feedback method. <strong>The final Piano Bridge is optional support—not required for the TD-07 course.</strong></p></div>
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
  const rhythmGlyph = { q:'♩', qr:'𝄽', ee:'♫', 'er-e':'𝄾 ♪', 'e-er':'♪ 𝄾', xxxx:'♬♬', xx:'♬' };
  function exerciseNotation() {
    const width = 420;
    const lines = [36, 48, 60, 72, 84].map(y => `<line class="staff-line" x1="12" y1="${y}" x2="${width - 12}" y2="${y}"/>`).join('');
    const beatWidth = (width - 44) / current.pattern.length;
    const notes = current.pattern.map((token, index) => {
      const x = 34 + index * beatWidth;
      const voices = token === 'HH+BD' ? ['hihat', 'bass'] : token === 'HH' ? ['hihat'] : token === 'HH+SD' ? ['hihat', 'snare'] : [];
      return voices.map(voice => drumNoteMarkup(voice, x)).join('') || `<text class="rhythm-glyph" x="${x}" y="66">${esc(rhythmGlyph[token] || token)}</text>`;
    }).join('');
    return `<svg class="exercise-notation" viewBox="0 -20 ${width} 124" role="img" aria-label="${esc(current.id)} drum reading exercise"><title>${esc(current.id)} drum reading exercise</title>${lines}${notes}</svg>`;
  }
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
    const counts = current.count.split(' ').slice(0, current.pattern.length).map(value => `<span>${esc(value)}</span>`).join('');
    stage.innerHTML = `<div class="notation-meta"><span>${esc(current.meter)}</span><span>EXERCISE ${esc(current.id.toUpperCase())}</span></div>${exerciseNotation()}${reveal ? `<div class="count-line">${counts}</div>` : ''}`;
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
  const conceptMap = lesson.introduces?.length ? `<section class="concept-map"><h3>Know this before you play</h3><p class="recall-prompt"><strong>Recall first:</strong> ${esc(lesson.recallPrompt)}</p>${lesson.introduces.map(concept => `<article class="concept-card"><strong>${esc(concept.symbol)}</strong><div><b>${esc(concept.meaning)}</b><p><b>TD-07 target:</b> ${esc(concept.target)}</p><p><b>Action:</b> ${esc(concept.action)}</p></div></article>`).join('')}</section>` : '';
  lessonDetail.innerHTML = `<span class="kicker">${esc(lesson.kind)} · ${lesson.minutes} minutes</span><h1>${esc(lesson.title)}</h1><div class="objective"><strong>Objective</strong><p>${esc(lesson.objective)}</p></div>${conceptMap}<div class="execution"><strong>Then perform</strong><p>${esc(lesson.execution || '')}</p></div><h3>Studio sequence</h3><ol>${lesson.steps.map(step => `<li>${esc(step)}</li>`).join('')}</ol><div class="coach-box"><strong>FEEDBACK MODE</strong><p>${esc(lesson.coach)}</p></div><div class="hero-actions"><button class="button" id="finish-lesson">${complete ? 'Mark incomplete' : 'Complete lesson'}</button>${lesson.kind !== 'pitch' ? '<a class="button secondary" href="#practice" id="lesson-practice">Open rhythm lab</a>' : '<a class="button secondary" href="https://www.musicca.com/piano" target="_blank" rel="noreferrer">Open virtual piano</a>'}</div>`;
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
