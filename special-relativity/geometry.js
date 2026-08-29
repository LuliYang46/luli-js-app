(function initRelativityGeometry(root, factory) {
  const geometry = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = geometry;
  } else {
    root.RelativityGeometry = geometry;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createRelativityGeometry() {
  "use strict";

  const MAX_BETA = 1 - Number.EPSILON;
  const EPSILON = 1e-12;

  function assertFiniteNumber(value, name) {
    if (!Number.isFinite(value)) {
      throw new TypeError(`${name} must be a finite number.`);
    }
  }

  function assertEvent(event) {
    if (!event || typeof event !== "object") {
      throw new TypeError("An event with x and ct coordinates is required.");
    }
    assertFiniteNumber(event.x, "event.x");
    assertFiniteNumber(event.ct, "event.ct");
  }

  function assertBeta(beta) {
    assertFiniteNumber(beta, "beta");
    if (Math.abs(beta) >= 1) {
      throw new RangeError("beta must satisfy |beta| < 1.");
    }
  }

  function gamma(beta) {
    assertBeta(beta);
    return 1 / Math.sqrt(1 - beta * beta);
  }

  function rapidityFromBeta(beta) {
    assertBeta(beta);
    return Math.atanh(beta);
  }

  function betaFromRapidity(rapidity) {
    assertFiniteNumber(rapidity, "rapidity");
    const beta = Math.tanh(rapidity);
    return Math.max(-MAX_BETA, Math.min(MAX_BETA, beta));
  }

  function boost(event, rapidity) {
    assertEvent(event);
    assertFiniteNumber(rapidity, "rapidity");

    const cosine = Math.cosh(rapidity);
    const sine = Math.sinh(rapidity);

    return {
      x: cosine * event.x - sine * event.ct,
      ct: cosine * event.ct - sine * event.x
    };
  }

  function earthToRocket(event, beta) {
    return boost(event, rapidityFromBeta(beta));
  }

  function rocketToEarth(event, beta) {
    return boost(event, -rapidityFromBeta(beta));
  }

  function minkowskiInterval(event) {
    assertEvent(event);
    return event.ct * event.ct - event.x * event.x;
  }

  function timeDifferenceInFrame(eventA, eventB, beta) {
    assertEvent(eventA);
    assertEvent(eventB);
    assertBeta(beta);
    const first = earthToRocket(eventA, beta);
    const second = earthToRocket(eventB, beta);
    return second.ct - first.ct;
  }

  function areSimultaneousInFrame(eventA, eventB, beta, tolerance = 0) {
    assertFiniteNumber(tolerance, "tolerance");
    if (tolerance < 0) {
      throw new RangeError("tolerance must be greater than or equal to zero.");
    }
    return Math.abs(timeDifferenceInFrame(eventA, eventB, beta)) <= tolerance;
  }

  return Object.freeze({
    EPSILON,
    gamma,
    rapidityFromBeta,
    betaFromRapidity,
    boost,
    earthToRocket,
    rocketToEarth,
    minkowskiInterval,
    timeDifferenceInFrame,
    areSimultaneousInFrame
  });
});
