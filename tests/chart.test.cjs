const test = require('node:test');
const assert = require('node:assert/strict');
const chart = require('../assets/js/chart.js');

test('CSV aligns different x grids without rounding or inventing missing values', () => {
  const series = chart.prepareSeries([
    { id: 'a', name: 'Метод А', values: [[20, 2.123456789012345], [5, 0.00002]] },
    { id: 'b', name: 'Замер "Б";2', values: [[10, -4], [20, 7]] }
  ]);
  assert.equal(chart.makeCSV(series, 'Параметр, км'),
    'Параметр, км;Метод А;"Замер ""Б"";2"\r\n' +
    '5;0.00002;\r\n10;;-4\r\n20;2.123456789012345;7\r\n');
});

test('inspection chooses the nearest actual x even on an uneven grid', () => {
  const xs = [0, 1, 100];
  assert.equal(chart.nearestIndex(xs, -100), 0);
  assert.equal(chart.nearestIndex(xs, 0.5), 0);
  assert.equal(chart.nearestIndex(xs, 2), 1);
  assert.equal(chart.nearestIndex(xs, 60), 2);
  assert.equal(chart.nearestIndex(xs, 200), 2);
  assert.equal(chart.nearestIndex([], 1), -1);
});

test('zero, negative, constant and very small data retain finite plotting domains', () => {
  const cases = [[0], [42], [-0.5], [-120, -20], [-3, 7], [1e-9, 2e-9]];
  for (const values of cases) {
    const [low, high] = chart.dataDomain(values, 0.08);
    assert.ok(Number.isFinite(low) && Number.isFinite(high) && high > low);
    assert.ok(values.every(value => value > low && value < high));
  }
  assert.deepEqual(chart.dataDomain([], 0.08), [0, 1]);
});

test('axis ticks use readable increments while preserving data bounds', () => {
  assert.deepEqual(chart.niceAxis([0, 20], 6, false), { domain: [0, 20], ticks: [0, 5, 10, 15, 20] });
  assert.deepEqual(chart.niceAxis([110, 255], 4, true), { domain: [100, 300], ticks: [100, 150, 200, 250, 300] });
  const tiny = chart.niceAxis([1e-9, 5e-9], 4, true);
  assert.ok(tiny.domain[0] <= 1e-9 && tiny.domain[1] >= 5e-9);
  assert.equal(new Set(tiny.ticks).size, tiny.ticks.length);
});

test('preparation leaves source data intact and excludes non-numeric coordinates', () => {
  const input = [{ name: 'Архив', values: [[9, 2], [0, 1], [9, 3], [2, NaN], ['4', 5], [4, Infinity]] }];
  const before = structuredClone(input);
  const series = chart.prepareSeries(input);
  assert.deepEqual(input, before);
  assert.deepEqual(series[0].values, [[0, 1], [9, 3]]);
  assert.equal(series[0].points.get(9), 3);
});

test('an empty dataset remains a readable empty CSV, not fictitious measurements', () => {
  assert.equal(chart.makeCSV(chart.prepareSeries([]), 'Время, с'), 'Время, с\r\n');
  assert.equal(chart.makeCSV(chart.prepareSeries([{ name: 'Нет данных', values: [] }]), 'x'), 'x;Нет данных\r\n');
});
