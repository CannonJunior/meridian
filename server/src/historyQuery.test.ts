// Unit tests for the CQL-assembly whitelist logic — the piece the
// timelapse plan's review flagged as the one place a mistake becomes a
// real injection surface, and specifically called out as untested. Pure
// (no network, no GeoServer/Postgres needed) so these run in CI or offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCqlFilter, clampPage, HistoryQueryError, MAX_FEATURES, validateFilter } from './historyQuery.js';

const BASE = { layerId: 'history-vessel-tracks', timeStart: '2026-08-20T00:00:00Z', timeEnd: '2026-08-21T00:00:00Z' };

test('validateFilter accepts a minimal valid filter', () => {
  const f = validateFilter(BASE);
  assert.equal(f.layerId, 'history-vessel-tracks');
  assert.equal(f.timeStart, BASE.timeStart);
  assert.equal(f.timeEnd, BASE.timeEnd);
});

test('validateFilter rejects an unknown layerId', () => {
  assert.throws(() => validateFilter({ ...BASE, layerId: 'not-a-real-layer' }), HistoryQueryError);
});

test('validateFilter rejects non-ISO timestamps', () => {
  assert.throws(() => validateFilter({ ...BASE, timeStart: 'yesterday' }), HistoryQueryError);
  assert.throws(() => validateFilter({ ...BASE, timeEnd: '08/21/2026' }), HistoryQueryError);
});

test('validateFilter rejects timeStart after timeEnd', () => {
  assert.throws(() => validateFilter({ ...BASE, timeStart: '2026-08-22T00:00:00Z' }), HistoryQueryError);
});

test('validateFilter rejects an out-of-range or degenerate bbox', () => {
  assert.throws(() => validateFilter({ ...BASE, bbox: { west: -200, south: 35.75, east: -5.6, north: 36.25 } }), HistoryQueryError);
  assert.throws(() => validateFilter({ ...BASE, bbox: { west: -5.6, south: 35.75, east: -6.05, north: 36.25 } }), HistoryQueryError, 'west >= east should be rejected as degenerate');
});

test('validateFilter accepts a valid bbox', () => {
  const f = validateFilter({ ...BASE, bbox: { west: -6.05, south: 35.75, east: -5.6, north: 36.25 } });
  assert.deepEqual(f.bbox, { west: -6.05, south: 35.75, east: -5.6, north: 36.25 });
});

test('validateFilter rejects speedMin greater than speedMax', () => {
  assert.throws(() => validateFilter({ ...BASE, speedMin: 20, speedMax: 5 }), HistoryQueryError);
});

test('validateFilter rejects non-numeric speed values', () => {
  assert.throws(() => validateFilter({ ...BASE, speedMin: 'fast' }), HistoryQueryError);
});

// The whole point of the structured-filter design: a value shaped like a
// CQL/SQL injection attempt must be rejected by validation, never reach
// string interpolation in buildCqlFilter at all.
test('validateFilter rejects injection-shaped affiliation and entityKind values', () => {
  const payloads = [
    "HOS' OR '1'='1",
    "HOS'; DROP TABLE entity_track_history; --",
    'HOS OR 1=1',
    "HOS' AND BBOX(geom,-90,-180,90,180) OR '1'='1",
  ];
  for (const p of payloads) {
    assert.throws(() => validateFilter({ ...BASE, affiliation: p }), HistoryQueryError, `affiliation payload should be rejected: ${p}`);
    assert.throws(() => validateFilter({ ...BASE, entityKind: p }), HistoryQueryError, `entityKind payload should be rejected: ${p}`);
  }
});

test('validateFilter accepts a legitimate affiliation/entityKind token', () => {
  const f = validateFilter({ ...BASE, affiliation: 'HOS', entityKind: 'vessel' });
  assert.equal(f.affiliation, 'HOS');
  assert.equal(f.entityKind, 'vessel');
});

test('buildCqlFilter includes layer and time bounds', () => {
  const cql = buildCqlFilter(validateFilter(BASE));
  assert.equal(
    cql,
    "layer_id = 'history-vessel-tracks' AND event_time >= '2026-08-20T00:00:00Z' AND event_time <= '2026-08-21T00:00:00Z'",
  );
});

// The specific bug caught live in Phase 0: this GeoServer instance requires
// lat,lon (south,west,north,east) order for BBOX(), not the lon,lat order
// the filter's own bbox object uses — see geoserver/README.md's "Axis
// order" section. Getting this backwards doesn't error, it silently
// matches nothing, so it needs a test that pins the exact argument order,
// not just "a BBOX clause exists somewhere."
test('buildCqlFilter emits BBOX in lat,lon order (south,west,north,east), not the filter field order', () => {
  const cql = buildCqlFilter(validateFilter({ ...BASE, bbox: { west: -6.05, south: 35.75, east: -5.6, north: 36.25 } }));
  assert.match(cql, /BBOX\(geom, 35\.75, -6\.05, 36\.25, -5\.6\)/);
});

test('buildCqlFilter adds entity_kind/affiliation/speed clauses only when present', () => {
  const withoutExtras = buildCqlFilter(validateFilter(BASE));
  assert.ok(!withoutExtras.includes('entity_kind'));
  assert.ok(!withoutExtras.includes('affiliation'));
  assert.ok(!withoutExtras.includes('speed_kn'));

  const withExtras = buildCqlFilter(validateFilter({ ...BASE, entityKind: 'vessel', affiliation: 'HOS', speedMin: 5, speedMax: 25 }));
  assert.match(withExtras, /entity_kind = 'vessel'/);
  assert.match(withExtras, /affiliation = 'HOS'/);
  assert.match(withExtras, /speed_kn >= 5/);
  assert.match(withExtras, /speed_kn <= 25/);
});

test('buildCqlFilter quote-escapes string values (defense in depth beyond the whitelist)', () => {
  // SAFE_TOKEN would reject this at validateFilter — this test exercises
  // buildCqlFilter directly with a hand-built HistoryFilter to prove the
  // escaping layer itself is correct in isolation, not relying solely on
  // the whitelist ever being present/correct upstream.
  const cql = buildCqlFilter({ ...BASE, layerId: "history-vessel-tracks' OR '1'='1" } as any);
  assert.match(cql, /layer_id = 'history-vessel-tracks'' OR ''1''=''1'/);
});

test('clampPage defaults and clamps startIndex/count to safe bounds', () => {
  assert.deepEqual(clampPage(undefined, undefined), { startIndex: 0, count: 1000 });
  assert.deepEqual(clampPage(-5, -5), { startIndex: 0, count: 1 });
  assert.deepEqual(clampPage(10, MAX_FEATURES + 50_000), { startIndex: 10, count: MAX_FEATURES });
  assert.deepEqual(clampPage('20', '500'), { startIndex: 20, count: 500 });
  assert.deepEqual(clampPage('not-a-number', 'also-not'), { startIndex: 0, count: 1000 });
});
