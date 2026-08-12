const DAY_MS = 86_400_000;

export function validateCurriculum(curriculum) {
  const errors = [];
  const lessonIds = new Set(curriculum.lessons.map(lesson => lesson.id));
  const moduleIds = new Set(curriculum.modules.map(module => module.id));

  for (const lesson of curriculum.lessons) {
    if (!moduleIds.has(lesson.moduleId)) errors.push(`Lesson ${lesson.id} has unknown module ${lesson.moduleId}`);
  }
  for (const module of curriculum.modules) {
    for (const lessonId of module.lessons) {
      if (!lessonIds.has(lessonId)) errors.push(`Module ${module.id} has unknown lesson ${lessonId}`);
    }
  }
  for (const exercise of curriculum.exercises) {
    if (!lessonIds.has(exercise.lessonId)) errors.push(`Exercise ${exercise.id} has unknown lesson ${exercise.lessonId}`);
  }
  return errors;
}

export function auditLearningSequence(curriculum) {
  const errors = [];
  const known = new Set();
  const lessonById = new Map(curriculum.lessons.map(lesson => [lesson.id, lesson]));

  for (const lesson of curriculum.lessons) {
    for (const concept of lesson.requires || []) {
      if (!known.has(concept)) errors.push(`${lesson.id} requires ${concept} before it is introduced`);
    }
    for (const concept of lesson.introduces || []) {
      if (!concept.id || !concept.symbol || !concept.meaning || !concept.target || !concept.action) {
        errors.push(`${lesson.id} introduces an incomplete concept map`);
        continue;
      }
      known.add(concept.id);
    }
    if (!lesson.recallPrompt || !lesson.execution) errors.push(`${lesson.id} must include recall before execution`);
  }

  for (const exercise of curriculum.exercises) {
    const lesson = lessonById.get(exercise.lessonId);
    const available = new Set();
    for (const item of curriculum.lessons) {
      for (const concept of item.introduces || []) available.add(concept.id);
      if (item.id === lesson?.id) break;
    }
    for (const concept of exercise.requires || []) {
      if (!available.has(concept)) errors.push(`${exercise.id} uses ${concept} before its lesson teaches it`);
    }
  }
  return errors;
}

export function auditRecallCoverage(curriculum, cards) {
  const conceptIds = new Set(curriculum.lessons.flatMap(lesson => (lesson.introduces || []).map(concept => concept.id)));
  const cardIds = new Set(cards.map(card => card.id));
  return [...conceptIds].filter(id => !cardIds.has(id)).map(id => `Missing recall card for ${id}`);
}

export function calculateProgress(curriculum, completedLessons = []) {
  if (!curriculum.lessons.length) return 0;
  const validIds = new Set(curriculum.lessons.map(lesson => lesson.id));
  const completed = new Set(completedLessons.filter(id => validIds.has(id)));
  return Math.round((completed.size / curriculum.lessons.length) * 100);
}

export function buildSession(curriculum, state = {}) {
  const completed = new Set(state.completedLessons || []);
  const nextLesson = curriculum.lessons.find(lesson => !completed.has(lesson.id)) || curriculum.lessons[0];
  const blocks = [
    { type: 'review', title: 'Recall the symbols', minutes: 3, route: 'cards', detail: `${state.reviewDue || 0} cards due — learn these before reading` },
    { type: 'read', title: nextLesson?.title || 'Mixed sight-reading', minutes: 8, lessonId: nextLesson?.id, detail: nextLesson?.objective || 'New material' },
    { type: 'coach', title: 'TD-07 timing check', minutes: 6, route: 'practice', detail: 'TIME CHECK, then one QUIET COUNT round' }
  ];
  return { blocks, totalMinutes: blocks.reduce((sum, block) => sum + block.minutes, 0) };
}

export function getDueCards(cards, today) {
  return cards.filter(card => !card.due || card.due <= today);
}

export function gradeCard(card, recalled, today) {
  const streak = recalled ? (card.streak || 0) + 1 : 0;
  const interval = recalled ? [1, 3, 7, 14, 30][Math.min(streak - 1, 4)] : 1;
  const dueDate = new Date(`${today}T12:00:00`);
  dueDate.setTime(dueDate.getTime() + interval * DAY_MS);
  return { ...card, streak, interval, due: dueDate.toISOString().slice(0, 10) };
}
