// Two-sided Student-t critical values for the OLS residual degrees of freedom.
// The R fit supplies the standard errors; only alpha-dependent bounds change here.
function logGamma(z) {
  const coefficients = [676.5203681218851, -1259.1392167224028,
    771.3234287776531, -176.6150291621406, 12.507343278686905,
    -0.13857109526572012, 9.984369578019572e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let sum = 0.9999999999998099;
  for (let i = 0; i < coefficients.length; i++) sum += coefficients[i] / (z + i + 1);
  const t = z + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum);
}

function betaContinuedFraction(x, a, b) {
  const floor = value => Math.abs(value) < 1e-300 ? 1e-300 : value;
  let c = 1, d = 1 / floor(1 - (a + b) * x / (a + 1)), result = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let term = m * (b - m) * x / ((a - 1 + m2) * (a + m2));
    d = 1 / floor(1 + term * d); c = floor(1 + term / c); result *= d * c;
    term = -(a + m) * (a + b + m) * x / ((a + m2) * (a + 1 + m2));
    d = 1 / floor(1 + term * d); c = floor(1 + term / c);
    const delta = d * c; result *= delta;
    if (Math.abs(delta - 1) < 2e-14) return result;
  }
  throw new Error('Student-t calculation did not converge.');
}

function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const factor = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  return x < (a + 1) / (a + b + 2)
    ? factor * betaContinuedFraction(x, a, b) / a
    : 1 - factor * betaContinuedFraction(1 - x, b, a) / b;
}

function studentTCritical(alphaPercent, degreesFreedom) {
  if (!(alphaPercent > 0 && alphaPercent < 100) || !(degreesFreedom >= 1)) {
    throw new RangeError('Alpha must be between 0 and 100%, with positive degrees of freedom.');
  }
  const targetTail = alphaPercent / 200;
  const tail = t => 0.5 * regularizedBeta(degreesFreedom / (degreesFreedom + t * t), degreesFreedom / 2, 0.5);
  let lower = 0, upper = 1;
  while (tail(upper) > targetTail) upper *= 2;
  for (let i = 0; i < 75; i++) {
    const middle = (lower + upper) / 2;
    if (tail(middle) > targetTail) lower = middle; else upper = middle;
  }
  return (lower + upper) / 2;
}
