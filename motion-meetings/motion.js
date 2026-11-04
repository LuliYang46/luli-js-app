(function exposeMotion(root, factory) {
  const motion = factory();
  if (typeof module === "object" && module.exports) module.exports = motion;
  else root.MotionMath = motion;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMotionMath() {
  "use strict";

  const PERIOD = 2;

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b) [a, b] = [b, a % b];
    return a;
  }

  function fraction(n, d = 1) {
    if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d === 0) {
      throw new RangeError("A fraction needs safe integers and a nonzero denominator.");
    }
    if (d < 0) { n = -n; d = -d; }
    const divisor = gcd(n, d);
    return { n: n === 0 ? 0 : n / divisor, d: d / divisor };
  }

  function value(rational) { return rational.n / rational.d; }

  function formatFraction(rational) {
    const reduced = fraction(rational.n, rational.d);
    if (reduced.d === 1) return String(reduced.n);
    let denominator = reduced.d;
    while (denominator % 2 === 0) denominator /= 2;
    while (denominator % 5 === 0) denominator /= 5;
    return denominator === 1 ? String(value(reduced)) : `${reduced.n}/${reduced.d}`;
  }

  function assertStart(start) {
    if (start !== "A" && start !== "B") throw new RangeError("Choose starting endpoint A or B.");
  }

  function assertSpeed(speed) {
    if (!Number.isInteger(speed) || speed < 1 || speed > 12) {
      throw new RangeError("Use whole numbers from 1 to 12 for each speed.");
    }
  }

  function positionAt(speed, start, time) {
    assertSpeed(speed);
    assertStart(start);
    if (!Number.isFinite(time) || time < 0) throw new RangeError("Time must be finite and nonnegative.");
    const phase = start === "A" ? speed * time : 1 - speed * time;
    const wrapped = ((phase % 2) + 2) % 2;
    return Math.min(wrapped, 2 - wrapped);
  }

  function exactPosition(speed, start, time) {
    const phase = start === "A" ? speed * time.n : time.d - speed * time.n;
    const modulus = 2 * time.d;
    const wrapped = ((phase % modulus) + modulus) % modulus;
    return fraction(Math.min(wrapped, modulus - wrapped), time.d);
  }

  // Each complete leg is S. A new row starts only after turning at an end.
  function routeAt(speed, start, time) {
    positionAt(speed, start, time); // Validate the public inputs.
    if (time > PERIOD) throw new RangeError("Routes must be within one shared period.");
    let distance = speed * time;
    if (Math.abs(distance - Math.round(distance)) < 1e-10) distance = Math.round(distance);
    const segments = [];
    for (let leg = 0; leg < Math.ceil(distance); leg++) {
      const from = (start === "A" ? leg : leg + 1) % 2;
      const length = Math.min(1, distance - leg);
      segments.push({ leg, from, to: from + (from === 0 ? length : -length), length });
    }
    return segments;
  }

  function analyzeMotion({ ratio, starts }) {
    if (!Array.isArray(ratio) || ratio.length !== 2 || !Array.isArray(starts) || starts.length !== 2) {
      throw new TypeError("Provide two speeds and two starting endpoints.");
    }
    ratio.forEach(assertSpeed);
    starts.forEach(assertStart);
    const divisor = gcd(...ratio);
    const speeds = ratio.map(speed => speed / divisor);
    const continuous = speeds[0] === speeds[1] && starts[0] === starts[1];
    const result = { ratio: speeds, starts: [...starts], period: PERIOD, continuous, events: [] };
    if (continuous) return result;

    const offsets = starts.map(start => start === "A" ? 0 : 1);
    const slopes = speeds.map((speed, i) => offsets[i] === 0 ? speed : -speed);
    const candidates = new Map();

    // Reflected positions agree iff their unfolded coordinates are equal
    // or opposite modulo 2S. Solve both integer families exactly.
    const families = [
      [slopes[0] - slopes[1], offsets[0] - offsets[1]],
      [slopes[0] + slopes[1], offsets[0] + offsets[1]]
    ];
    for (const [slope, offset] of families) {
      if (slope === 0) continue;
      const low = Math.ceil(Math.min(offset, offset + PERIOD * slope) / 2);
      const high = Math.floor(Math.max(offset, offset + PERIOD * slope) / 2);
      for (let k = low; k <= high; k++) {
        const time = fraction(2 * k - offset, slope);
        if (time.n <= 0 || time.n > PERIOD * time.d) continue;
        candidates.set(`${time.n}/${time.d}`, time);
      }
    }

    const times = [...candidates.values()].sort((a, b) => a.n * b.d - b.n * a.d);
    result.events = times.map((time, i) => {
      const distances = speeds.map(speed => fraction(speed * time.n, time.d));
      const parity = starts[0] === starts[1] ? 0 : 1;
      const relations = [];
      for (const [kind, multiplier] of [
        ["difference", Math.abs(speeds[0] - speeds[1])],
        ["sum", speeds[0] + speeds[1]]
      ]) {
        const numerator = multiplier * time.n;
        if (numerator % time.d === 0) {
          const multiple = numerator / time.d;
          if (multiple % 2 === parity) relations.push({ kind, multiple });
        }
      }
      const position = exactPosition(speeds[0], starts[0], time);
      return {
        index: i + 1,
        time,
        t: value(time),
        position,
        x: value(position),
        distances,
        relations,
        endpoint: position.n === 0 ? "A" : position.n === position.d ? "B" : null
      };
    });
    return result;
  }

  return Object.freeze({ PERIOD, gcd, fraction, value, formatFraction, positionAt, routeAt, analyzeMotion });
});
