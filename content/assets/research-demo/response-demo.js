/* New teaching model for the Almanac mockup.
 * This is not a reconstruction of the author's dissertation.
 * All variables and results are dimensionless. */

function modelResponse(x, gain, tau) {
  if (![x, gain, tau].every(Number.isFinite)) {
    throw new TypeError('Model parameters must be finite numbers.');
  }
  if (x < 0 || gain <= 0 || tau <= 0) {
    throw new RangeError('Expected x >= 0, gain > 0 and tau > 0.');
  }
  return gain * (1 - Math.exp(-x / tau));
}

function responseSeries(gain, tau) {
  return Array.from({ length: 41 }, (_, index) => {
    const x = index * 0.5;
    return [x, modelResponse(x, gain, tau)];
  });
}

// Example: responseSeries(1, 4).
// At x = tau, y = gain * (1 - exp(-1)) ≈ 0.6321205588 * gain.
