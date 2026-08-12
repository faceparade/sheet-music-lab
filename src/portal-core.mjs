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
    { type: 'coach', title: 'TD-07 timing check', minutes: 6, route: 'practice', detail: 'TIME CHECK, then one QUIET COUNT round' },
    { type: 'pitch', title: 'Piano bridge', minutes: 5, lessonId: 'landmarks', detail: 'Landmark notes and keyboard mapping' }
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
