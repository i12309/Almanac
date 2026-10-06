'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { bch, trains, sensitivity } = require('../assets/js/labs.js');

function close(actual, expected, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${actual} should be within ${tolerance} of ${expected}`);
}

// A coefficient-array polynomial division, independent of labs.js bit arithmetic.
function polynomialRemainder(word) {
  const coefficients = Array.from({ length: 15 }, (_, i) => Math.floor(word / 2 ** i) % 2);
  const generatorTerms = [0, 4, 6, 7, 8];
  for (let degree = 14; degree >= 8; degree -= 1) {
    if (coefficients[degree] === 1) {
      for (const term of generatorTerms) {
        const position = degree - 8 + term;
        coefficients[position] = (coefficients[position] + 1) % 2;
      }
    }
  }
  return coefficients.slice(0, 8).reduce((sum, value, i) => sum + value * 2 ** i, 0);
}

test('UMD works as an ordinary browser script without CommonJS or a module loader', () => {
  const context = vm.createContext({});
  const source = fs.readFileSync(path.join(__dirname, '../assets/js/labs.js'), 'utf8');
  vm.runInContext(source, context);
  assert.equal(context.AlmanacLabs.bch.encode(1), 0x1d1);
  assert.equal(context.AlmanacLabs.trains.calculate().series.length, 2);
  assert.equal(context.AlmanacLabs.sensitivity.calculate().series[0].values.length, 41);
});

test('GF16 multiplication follows the independently tabulated alpha cycle', () => {
  const powers = [1, 2, 4, 8, 3, 6, 12, 11, 5, 10, 7, 14, 15, 13, 9];
  for (let i = 0; i < 15; i += 1) {
    assert.equal(bch.multiply(0, powers[i]), 0);
    assert.equal(bch.multiply(powers[i], 0), 0);
    for (let j = 0; j < 15; j += 1) {
      assert.equal(bch.multiply(powers[i], powers[j]), powers[(i + j) % 15]);
    }
  }
  assert.equal(bch.multiply(8, 2), 3); // alpha^4 = alpha + 1
  assert.equal(bch.fieldLabel(0), '0');
  assert.equal(bch.fieldLabel(1), '1');
  assert.equal(bch.fieldLabel(2), 'α');
  assert.equal(bch.fieldLabel(9), 'α^14');
});

test('BCH known vectors define polynomial and MSB conventions', () => {
  assert.equal(bch.encode(0), 0);
  assert.equal(bch.encode(1), 0x1d1);
  assert.equal(bch.encode(2), 0x273);
  assert.equal(bch.encode(127), 32767);
  assert.deepEqual(bch.syndromes(0), [0, 0, 0, 0]);
  assert.deepEqual(bch.syndromes(1), [1, 1, 1, 1]);
  assert.deepEqual(bch.syndromes(2), [2, 4, 8, 3]);
  assert.deepEqual(bch.syndromes(0x4000), [9, 13, 15, 14]);
  assert.deepEqual(bch.syndromes(0x4001), [8, 12, 14, 15]);
});

test('Every 15-bit word has zero syndromes exactly when divisible by g(x)', () => {
  let zeroSyndromeWords = 0;
  for (let word = 0; word < 32768; word += 1) {
    const zeroSyndromes = bch.syndromes(word).every(value => value === 0);
    assert.equal(zeroSyndromes, polynomialRemainder(word) === 0, `word ${word}`);
    if (zeroSyndromes) zeroSyndromeWords += 1;
  }
  assert.equal(zeroSyndromeWords, 128);
});

test('All 128 encodings are systematic codewords with minimum distance five', () => {
  const words = [];
  for (let message = 0; message < 128; message += 1) {
    const word = bch.encode(message);
    assert.equal(word >>> 8, message);
    assert.equal(polynomialRemainder(word), 0);
    assert.deepEqual(bch.syndromes(word), [0, 0, 0, 0]);
    words.push(word);
  }
  assert.equal(new Set(words).size, 128);
  let minimumDistance = 15;
  for (let i = 0; i < words.length; i += 1) {
    for (let j = i + 1; j < words.length; j += 1) {
      // Count differing characters, independently of the exported Hamming function.
      const left = words[i].toString(2).padStart(15, '0');
      const right = words[j].toString(2).padStart(15, '0');
      const distance = Array.from(left).filter((bit, position) => bit !== right[position]).length;
      minimumDistance = Math.min(minimumDistance, distance);
      assert.equal(bch.errors(words[i], words[j]), distance);
    }
  }
  assert.equal(minimumDistance, 5);
});

test('Syndromes detect every one- and two-bit error; a zero syndrome is not proof of no changes', () => {
  const original = bch.encode(42);
  for (let i = 0; i < 15; i += 1) {
    const oneError = original ^ (1 << i);
    assert.equal(bch.errors(original, oneError), 1);
    assert.ok(bch.syndromes(oneError).some(value => value !== 0));
    for (let j = i + 1; j < 15; j += 1) {
      const twoErrors = oneError ^ (1 << j);
      assert.equal(bch.errors(original, twoErrors), 2);
      assert.ok(bch.syndromes(twoErrors).some(value => value !== 0));
    }
  }
  const anotherCodeword = original ^ bch.encode(1);
  assert.equal(bch.errors(original, anotherCodeword), 5);
  assert.deepEqual(bch.syndromes(anotherCodeword), [0, 0, 0, 0]);
});

test('BCH validates values before bit operations could truncate or wrap them', () => {
  for (const invalid of [-1, 128, 1.2, NaN, Infinity, -Infinity, 2 ** 32]) {
    assert.throws(() => bch.encode(invalid), RangeError);
  }
  for (const invalid of ['1', null, undefined, true, {}, 1n]) {
    assert.throws(() => bch.encode(invalid), TypeError);
  }
  for (const invalid of [-1, 32768, 0.2, NaN]) {
    assert.throws(() => bch.syndromes(invalid), RangeError);
    assert.throws(() => bch.errors(0, invalid), RangeError);
    assert.throws(() => bch.errors(invalid, 0), RangeError);
  }
  for (const invalid of [-1, 16, 0.5, Infinity]) {
    assert.throws(() => bch.fieldLabel(invalid), RangeError);
    assert.throws(() => bch.multiply(invalid, 1), RangeError);
    assert.throws(() => bch.multiply(1, invalid), RangeError);
  }
});

test('Train example at zero discount equals the independently calculated straight-line totals', () => {
  const result = trains.calculate({ years: 5, annualKm: 100000, energyPrice: 5, discountRate: 0 });
  assert.deepEqual(result.series.map(series => series.id), ['train-a', 'train-b']);
  assert.deepEqual(result.series.map(series => series.values[0]), [[0, 120], [0, 145]]);
  close(result.totals.a, 152.75); // 120 + 5 * (4.2 + 100000 * 4.7 * 5 / 1e6)
  close(result.totals.b, 171.5); // 145 + 5 * (3.4 + 100000 * 3.8 * 5 / 1e6)
  close(result.totals.saving, -18.75);
  assert.equal(result.series[0].values.length, 6);
});

test('Discounted costs use year-end cash flows and agree with an independent PV sum', () => {
  const result = trains.calculate();
  // Compute in RUB and use the annuity identity, not the implementation's year loop.
  const annuity = (1 - 1.05 ** -20) / 0.05;
  const totalA = (120000000 + 13600000 * annuity) / 1000000;
  const totalB = (145000000 + 11000000 * annuity) / 1000000;
  close(result.totals.a, totalA);
  close(result.totals.b, totalB);
  close(result.totals.saving, totalA - totalB);
  close(result.series[0].values[1][1], 120 + 13.6 / 1.05);
  assert.ok(result.totals.saving > 0);
  for (const series of result.series) {
    assert.equal(series.values.length, 21);
    for (let i = 1; i < series.values.length; i += 1) {
      assert.ok(series.values[i][1] > series.values[i - 1][1]);
    }
  }
  assert.equal(result.assumptions.moneyUnit, 'million');
  assert.equal(result.assumptions.demo, true);
  assert.equal(result.assumptions.residualValueIncluded, false);
});

test('Train calculations support partial input without mutating defaults or earlier results', () => {
  const originalDefaults = JSON.stringify(trains.defaults);
  const first = trains.calculate({ discountRate: 0 });
  const second = trains.calculate();
  assert.ok(first.totals.a > second.totals.a);
  first.series[0].values[0][1] = -10;
  first.assumptions.inputs.years = 99;
  assert.equal(trains.calculate().series[0].values[0][1], 120);
  assert.equal(trains.calculate().assumptions.inputs.years, 20);
  assert.equal(JSON.stringify(trains.defaults), originalDefaults);
});

test('Train parameter validation includes both boundaries and disallows bad values', () => {
  assert.doesNotThrow(() => trains.calculate({ years: 5, annualKm: 50000, energyPrice: 1, discountRate: 0 }));
  assert.doesNotThrow(() => trains.calculate({ years: 40, annualKm: 400000, energyPrice: 20, discountRate: 0.2 }));
  for (const options of [
    { years: 4 }, { years: 41 }, { years: 10.5 },
    { annualKm: 49999 }, { annualKm: 400001 },
    { energyPrice: 0.99 }, { energyPrice: 21 },
    { discountRate: -0.01 }, { discountRate: 0.21 }, { discountRate: Infinity }
  ]) {
    assert.throws(() => trains.calculate(options), RangeError);
  }
  assert.throws(() => trains.calculate({ years: '20' }), TypeError);
  assert.throws(() => trains.calculate(null), TypeError);
  assert.throws(() => trains.calculate([]), TypeError);
});

test('Educational response has correct endpoints, time constant and gain scaling', () => {
  const result = sensitivity.calculate({ tau: 4, gain: 1 });
  const values = result.series[0].values;
  assert.equal(values.length, 41);
  assert.deepEqual(values[0], [0, 0]);
  assert.equal(values[40][0], 20);
  close(values[8][1], 0.6321205588285577); // x = tau
  close(values[40][1], 0.9932620530009145);
  for (let i = 1; i < values.length; i += 1) {
    assert.equal(values[i][0] - values[i - 1][0], 0.5);
    assert.ok(values[i][1] > values[i - 1][1]);
    assert.ok(values[i][1] < 1);
  }
  const doubled = sensitivity.calculate({ tau: 4, gain: 2 }).series[0].values;
  doubled.forEach((point, i) => close(point[1], 2 * values[i][1]));
  const slower = sensitivity.calculate({ tau: 8, gain: 1 }).series[0].values;
  assert.ok(slower[8][1] < values[8][1]);
  assert.equal(result.assumptions.demo, true);
});

test('Educational response validates its bounds and object input', () => {
  assert.doesNotThrow(() => sensitivity.calculate({ tau: 1, gain: 0.5 }));
  assert.doesNotThrow(() => sensitivity.calculate({ tau: 10, gain: 2 }));
  for (const options of [{ tau: 0 }, { tau: 11 }, { gain: 0.49 }, { gain: 2.1 }, { tau: NaN }]) {
    assert.throws(() => sensitivity.calculate(options), RangeError);
  }
  assert.throws(() => sensitivity.calculate({ tau: '4' }), TypeError);
  assert.throws(() => sensitivity.calculate(false), TypeError);
});
