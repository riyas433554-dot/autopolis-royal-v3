import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCompanyOutput, inferDeliverableType } from '../api/company-output.js';

test('company agent result is saved as an owner-reviewable deliverable draft', () => {
  const output = buildCompanyOutput({
    task: { id: 41, title: 'Build a mobile game prototype', description: 'Godot game for a client', building_slug: 'game-studio-b' },
    agent: { id: 8, name: 'Game Designer', building_slug: 'game-studio-b' },
    profile: { lifecycle_status: 'company', company_id: 3 },
    result: 'A complete game concept and prototype implementation plan.',
  });
  assert.equal(output.task_id, 41);
  assert.equal(output.company_id, 3);
  assert.equal(output.source_agent_id, 8);
  assert.equal(output.deliverable_type, 'game');
  assert.equal(output.status, 'draft');
  assert.equal(output.earning_coins, 0);
  assert.equal(output.content, 'A complete game concept and prototype implementation plan.');
});

test('city staff results do not create company deliverables', () => {
  assert.equal(buildCompanyOutput({
    task: { id: 2, title: 'City maintenance report' },
    agent: { id: 4, name: 'City Staff' },
    profile: { lifecycle_status: 'city_staff', company_id: null },
    result: 'Report',
  }), null);
});

test('explicit supported deliverable type takes precedence over title inference', () => {
  assert.equal(inferDeliverableType({ deliverable_type: 'website', title: 'Make an app' }), 'website');
});

test('empty company result is rejected instead of saving a blank artifact', () => {
  assert.throws(() => buildCompanyOutput({
    task: { id: 9, title: 'Create proposal' },
    agent: { id: 1, name: 'Proposal Writer' },
    profile: { lifecycle_status: 'company', company_id: 2 },
    result: '   ',
  }), /non-empty/i);
});
