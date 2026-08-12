import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSession,
  calculateProgress,
  getDueCards,
  gradeCard,
  validateCurriculum
} from '../src/portal-core.mjs';

const curriculum = {
  modules: [
    { id: 'pulse', week: 1, lessons: ['pulse-1'] },
    { id: 'rests', week: 2, lessons: ['rests-1'] }
  ],
  lessons: [
    { id: 'pulse-1', moduleId: 'pulse', title: 'Find the pulse', minutes: 8, kind: 'rhythm' },
    { id: 'rests-1', moduleId: 'rests', title: 'Hear the silence', minutes: 10, kind: 'rhythm' }
  ],
  exercises: [
    { id: 'ex-1', lessonId: 'pulse-1', difficulty: 1, pattern: ['q','q','q','q'] }
  ]
};

test('curriculum references resolve', () => {
  assert.deepEqual(validateCurriculum(curriculum), []);
});

test('daily session mixes review, reading, coach work, and pitch', () => {
  const session = buildSession(curriculum, { completedLessons: [], reviewDue: 2 });
  assert.equal(session.totalMinutes, 22);
  assert.deepEqual(session.blocks.map(block => block.type), ['review', 'read', 'coach', 'pitch']);
});

test('progress is based on unique completed lesson ids', () => {
  assert.equal(calculateProgress(curriculum, ['pulse-1', 'pulse-1']), 50);
  assert.equal(calculateProgress(curriculum, ['pulse-1', 'rests-1']), 100);
});

test('due cards include new and scheduled cards but not future cards', () => {
  const cards = [
    { id: 'new' },
    { id: 'due', due: '2026-08-12' },
    { id: 'later', due: '2026-08-15' }
  ];
  assert.deepEqual(getDueCards(cards, '2026-08-12').map(card => card.id), ['new', 'due']);
});

test('grading a recalled card expands its interval', () => {
  const result = gradeCard({ id: 'q', interval: 1, streak: 1 }, true, '2026-08-12');
  assert.equal(result.interval, 3);
  assert.equal(result.streak, 2);
  assert.equal(result.due, '2026-08-15');
});

test('grading a missed card resets it for tomorrow', () => {
  const result = gradeCard({ id: 'q', interval: 6, streak: 4 }, false, '2026-08-12');
  assert.equal(result.interval, 1);
  assert.equal(result.streak, 0);
  assert.equal(result.due, '2026-08-13');
});
