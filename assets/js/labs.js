/* Almanac's standalone teaching examples. No original archive is used here. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AlmanacLabs = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function numberInRange(value, name, min, max, integer) {
    if (typeof value !== 'number') {
      throw new TypeError(name + ' must be a number');
    }
    if (!Number.isFinite(value) || value < min || value > max ||
        (integer && !Number.isInteger(value))) {
      throw new RangeError(name + ' must be ' + (integer ? 'an integer ' : '') +
        'between ' + min + ' and ' + max);
    }
    return value;
  }

  function optionsOrEmpty(options) {
    if (options === undefined) return {};
    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('Options must be an object');
    }
    return options;
  }

  function option(options, defaults, name, min, max, integer) {
    return numberInRange(options[name] === undefined ? defaults[name] : options[name],
      name, min, max, integer);
  }

  // GF(2^4), polynomial basis 1, alpha, alpha^2, alpha^3; alpha^4 = alpha + 1.
  var primitivePolynomial = 0x13;
  var generatorPolynomial = 0x1d1;
  var alphaPowers = [1, 2, 4, 8, 3, 6, 12, 11, 5, 10, 7, 14, 15, 13, 9];

  function multiplyUnchecked(left, right) {
    var result = 0;
    while (right !== 0) {
      if ((right & 1) !== 0) result ^= left;
      right >>>= 1;
      left <<= 1;
      if ((left & 0x10) !== 0) left ^= primitivePolynomial;
    }
    return result;
  }

  function multiply(left, right) {
    numberInRange(left, 'left', 0, 15, true);
    numberInRange(right, 'right', 0, 15, true);
    return multiplyUnchecked(left, right);
  }

  function encode(message) {
    numberInRange(message, 'message', 0, 127, true);
    var shifted = message << 8;
    var remainder = shifted;
    for (var degree = 14; degree >= 8; degree -= 1) {
      if ((remainder & (1 << degree)) !== 0) {
        remainder ^= generatorPolynomial << (degree - 8);
      }
    }
    return shifted | remainder;
  }

  // S_j = r(alpha^j), j = 1..4. Integer bit i is the coefficient of x^i.
  function syndromes(word) {
    numberInRange(word, 'word', 0, 32767, true);
    var result = [];
    for (var j = 1; j <= 4; j += 1) {
      var value = 0;
      for (var degree = 14; degree >= 0; degree -= 1) {
        value = multiplyUnchecked(value, alphaPowers[j]);
        value ^= (word >>> degree) & 1;
      }
      result.push(value);
    }
    return result;
  }

  function fieldLabel(value) {
    numberInRange(value, 'value', 0, 15, true);
    if (value === 0) return '0';
    if (value === 1) return '1';
    var exponent = alphaPowers.indexOf(value);
    return exponent === 1 ? 'α' : 'α^' + exponent;
  }

  function errors(original, received) {
    numberInRange(original, 'original', 0, 32767, true);
    numberInRange(received, 'received', 0, 32767, true);
    var difference = original ^ received;
    var count = 0;
    while (difference !== 0) {
      difference &= difference - 1;
      count += 1;
    }
    return count;
  }

  var bchParameters = Object.freeze({
    n: 15,
    k: 7,
    t: 2,
    designedDistance: 5,
    m: 4,
    fieldOrder: 16,
    primitivePolynomial: primitivePolynomial,
    generatorPolynomial: generatorPolynomial,
    syndromeCount: 4,
    bitOrder: 'msb-first',
    demo: true
  });

  var trainDefaults = Object.freeze({
    years: 20,
    annualKm: 250000,
    energyPrice: 8,
    discountRate: 0.05
  });

  var trainAssumptions = Object.freeze({
    a: Object.freeze({
      acquisitionMillion: 120,
      energyKWhPerKm: 4.7,
      maintenanceMillionPerYear: 4.2
    }),
    b: Object.freeze({
      acquisitionMillion: 145,
      energyKWhPerKm: 3.8,
      maintenanceMillionPerYear: 3.4
    }),
    currency: 'RUB',
    moneyUnit: 'million',
    cashFlowTiming: 'year-end',
    priceBasis: 'constant-demo-prices',
    inflationIncluded: false,
    residualValueIncluded: false,
    revenueIncluded: false,
    demo: true
  });

  function calculateTrains(options) {
    options = optionsOrEmpty(options);
    var inputs = {
      years: option(options, trainDefaults, 'years', 5, 40, true),
      annualKm: option(options, trainDefaults, 'annualKm', 50000, 400000),
      energyPrice: option(options, trainDefaults, 'energyPrice', 1, 20),
      discountRate: option(options, trainDefaults, 'discountRate', 0, 0.2)
    };

    function variant(id, name, assumptions) {
      var annualOperating = inputs.annualKm * assumptions.energyKWhPerKm *
        inputs.energyPrice / 1000000 + assumptions.maintenanceMillionPerYear;
      var cumulative = assumptions.acquisitionMillion;
      var values = [[0, cumulative]];
      for (var year = 1; year <= inputs.years; year += 1) {
        cumulative += annualOperating / Math.pow(1 + inputs.discountRate, year);
        values.push([year, cumulative]);
      }
      return {
        series: { id: id, name: name, values: values },
        annualOperating: annualOperating,
        total: cumulative
      };
    }

    var a = variant('train-a', 'Вариант А', trainAssumptions.a);
    var b = variant('train-b', 'Вариант Б', trainAssumptions.b);
    return {
      series: [a.series, b.series],
      totals: { a: a.total, b: b.total, saving: a.total - b.total },
      assumptions: {
        a: trainAssumptions.a,
        b: trainAssumptions.b,
        currency: trainAssumptions.currency,
        moneyUnit: trainAssumptions.moneyUnit,
        cashFlowTiming: trainAssumptions.cashFlowTiming,
        priceBasis: trainAssumptions.priceBasis,
        inflationIncluded: trainAssumptions.inflationIncluded,
        residualValueIncluded: trainAssumptions.residualValueIncluded,
        revenueIncluded: trainAssumptions.revenueIncluded,
        demo: true,
        inputs: inputs,
        annualOperatingMillion: { a: a.annualOperating, b: b.annualOperating }
      }
    };
  }

  var sensitivityDefaults = Object.freeze({ tau: 4, gain: 1 });

  function calculateSensitivity(options) {
    options = optionsOrEmpty(options);
    var tau = option(options, sensitivityDefaults, 'tau', 1, 10);
    var gain = option(options, sensitivityDefaults, 'gain', 0.5, 2);
    var values = [];
    for (var step = 0; step <= 40; step += 1) {
      var x = step / 2;
      values.push([x, gain * (1 - Math.exp(-x / tau))]);
    }
    return {
      series: [{ id: 'response', name: 'Учебная модель', values: values }],
      assumptions: { tau: tau, gain: gain, xUnit: 'arbitrary', yUnit: 'arbitrary', demo: true }
    };
  }

  return Object.freeze({
    bch: Object.freeze({
      encode: encode,
      syndromes: syndromes,
      fieldLabel: fieldLabel,
      errors: errors,
      multiply: multiply,
      parameters: bchParameters
    }),
    trains: Object.freeze({
      calculate: calculateTrains,
      defaults: trainDefaults,
      assumptions: trainAssumptions
    }),
    sensitivity: Object.freeze({
      calculate: calculateSensitivity,
      defaults: sensitivityDefaults
    })
  });
}));
