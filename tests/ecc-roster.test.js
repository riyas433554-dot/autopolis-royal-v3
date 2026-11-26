import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialEccRoster } from '../api/ecc-roster.js';

const entries = Array.from({ length: 72 }, (_, index) => ({ key: `ecc-${index + 1}` }));
const buildings = [
  'royal-palace-hq','operations-tower','security-command','ai-research-lab','data-vault',
  'agent-academy','innovation-garage','grand-library','archive-spire','observatory',
  'eco-tower','social-nexus','media-studio','creator-hub','culture-theatre','commerce-exchange',
  'health-clinic','transport-hub','horizon-port','game-studio-b','animation-anime',
  'animation-cartoon','animation-movie','vfx-editing-co','game-center','award-center',
  'review-company','royal-treasury-bank','vyom-construction','automation-company','ecc-team',
  'app-company','website-company','portfolio-company','security-lab','clone-lab','tech-research-co',
].map(slug => ({ slug }));

test('initial ECC split is exactly 35 Academy + 37 city staff', () => {
  const roster = buildInitialEccRoster(entries, buildings);
  assert.equal(roster.length, 72);
  assert.equal(roster.filter(agent => agent.lifecycle_status === 'academy').length, 35);
  assert.equal(roster.filter(agent => agent.lifecycle_status === 'city_staff').length, 37);
  assert.ok(roster.slice(0, 35).every(agent => agent.assigned_building_slug === 'agent-academy'));
});

test('37 city staff are assigned one-to-one across all 37 buildings, Academy included', () => {
  const roster = buildInitialEccRoster(entries, buildings);
  const staff = roster.slice(35);
  assert.equal(new Set(staff.map(agent => agent.assigned_building_slug)).size, 37);
  assert.deepEqual(
    staff.map(agent => agent.assigned_building_slug).sort(),
    buildings.map(building => building.slug).sort(),
  );
  assert.equal(staff.filter(agent => agent.assigned_building_slug === 'agent-academy').length, 1);
});

test('rejects a missing or extra building instead of silently misassigning staff', () => {
  assert.throws(() => buildInitialEccRoster(entries, buildings.slice(1)), /Expected exactly 37 city buildings/);
  assert.throws(() => buildInitialEccRoster(entries, [...buildings, { slug: 'extra' }]), /Expected exactly 37 city buildings/);
});

test('rejects duplicate building slugs', () => {
  const duplicate = [...buildings.slice(0, -1), { slug: buildings[0].slug }];
  assert.throws(() => buildInitialEccRoster(entries, duplicate), /unique values/);
});
