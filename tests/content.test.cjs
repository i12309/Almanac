'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { trains, sensitivity } = require('../assets/js/labs.js');

const root = path.resolve(__dirname, '..');
const demoIds = ['bch-demo', 'trains-demo', 'research-demo'];
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const work = id => JSON.parse(read(`content/works/${id}.json`));

function close(actual, expected, tolerance, context) {
  assert.ok(Number.isFinite(actual), `${context}: a finite value is required`);
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${context}: ${actual} differs from ${expected}`);
}

function comparePoints(actual, expected, tolerance, context) {
  assert.equal(actual.length, expected.length, `${context}: point count`);
  actual.forEach((point, index) => {
    assert.equal(point[0], expected[index][0], `${context}: x at point ${index}`);
    close(point[1], expected[index][1], tolerance, `${context}: y at x=${point[0]}`);
  });
}

test('Static train costs agree with the initial browser scenario in million RUB', () => {
  const chart = work('trains-demo').charts[0];
  const calculated = trains.calculate();
  const expectedById = {
    'alternative-a': calculated.series.find(series => series.id === 'train-a').values,
    'alternative-b': calculated.series.find(series => series.id === 'train-b').values
  };
  assert.equal(chart.series.length, 2);
  chart.series.forEach(series => {
    assert.ok(expectedById[series.id], `Unknown baseline alternative: ${series.id}`);
    // The published fixture is rounded to nine decimal places.
    comparePoints(series.values, expectedById[series.id], 1e-9, series.id);
  });
});

test('Static response curves agree with the declared tau scenarios at unit gain', () => {
  const chart = work('research-demo').charts[0];
  const tauById = { 'tau-2': 2, 'tau-4': 4, 'tau-8': 8 };
  assert.equal(chart.series.length, 3);
  chart.series.forEach(series => {
    assert.ok(tauById[series.id], `Unknown response scenario: ${series.id}`);
    const expected = sensitivity.calculate({ tau: tauById[series.id], gain: 1 });
    // The published fixture is rounded to twelve decimal places.
    comparePoints(series.values, expected.series[0].values, 1e-12, series.id);
  });
});

test('BCH probability data equals the independent binomial sum, expressed as percentages', () => {
  const chart = work('bch-demo').charts[0];
  const thresholdById = { 'at-most-one': 1, 'at-most-two': 2 };
  const choose = (n, k) => {
    let result = 1;
    for (let i = 1; i <= k; i += 1) result = result * (n - i + 1) / i;
    return result;
  };
  assert.equal(chart.series.length, 2);
  chart.series.forEach(series => {
    const threshold = thresholdById[series.id];
    assert.ok(threshold, `Unknown event: ${series.id}`);
    series.values.forEach(([p, percent]) => {
      assert.ok(Number.isFinite(p) && p >= 0 && p <= 1, `Invalid bit probability: ${p}`);
      let probability = 0;
      for (let errors = 0; errors <= threshold; errors += 1) {
        probability += choose(15, errors) * p ** errors * (1 - p) ** (15 - errors);
      }
      close(percent, 100 * probability, 1e-9, `${series.id}, p=${p}`);
    });
  });
});

test('Downloadable numeric CSV fixtures contain the same values as the chapter charts', () => {
  for (const id of demoIds) {
    const chapter = work(id);
    const source = chapter.sources.find(item => item.type === 'text/csv');
    assert.ok(source, `${id}: missing CSV source`);
    const chart = chapter.charts[0];
    // These fixtures intentionally use simple unquoted numeric fields and a comma delimiter.
    const lines = read(source.path).trim().split(/\r?\n/);
    const header = lines.shift().split(',');
    assert.equal(header.length, chart.series.length + 1, `${id}: CSV column count`);
    const rows = lines.map((line, rowIndex) => {
      const cells = line.split(',');
      assert.equal(cells.length, header.length, `${id}: CSV row ${rowIndex + 2}`);
      return cells.map((cell, columnIndex) => {
        assert.notEqual(cell.trim(), '', `${id}: empty CSV cell at ${rowIndex + 2}:${columnIndex + 1}`);
        const value = Number(cell);
        assert.ok(Number.isFinite(value), `${id}: nonnumeric CSV cell`);
        return value;
      });
    });
    chart.series.forEach((series, seriesIndex) => {
      const csvPoints = rows.map(row => [row[0], row[seriesIndex + 1]]);
      comparePoints(csvPoints, series.values, 1e-12, `${id}/${series.id}: CSV`);
    });
  }
});

test('Code highlights refer to real nonempty ranges in their downloadable source files', () => {
  let checked = 0;
  for (const id of demoIds) {
    for (const source of work(id).code) {
      const lines = read(source.path).replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
      for (const range of source.highlights || []) {
        const context = `${source.path}: ${range.label}`;
        assert.ok(Number.isInteger(range.start) && Number.isInteger(range.end), `${context}: integer line numbers`);
        assert.ok(range.start >= 1 && range.end >= range.start && range.end <= lines.length,
          `${context}: range ${range.start}–${range.end} is outside ${lines.length} lines`);
        assert.ok(lines.slice(range.start - 1, range.end).some(line => line.trim()), `${context}: empty range`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 0, 'The demo must exercise code range highlights');
});
