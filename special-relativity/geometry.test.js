"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("./geometry.js");

const TOLERANCE = 1e-10;

function approximatelyEqual(actual, expected, tolerance = TOLERANCE) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function assertEventClose(actual, expected, tolerance = TOLERANCE) {
  approximatelyEqual(actual.x, expected.x, tolerance);
  approximatelyEqual(actual.ct, expected.ct, tolerance);
}

test("zero velocity is the identity transformation", () => {
  const event = { x: 3.5, ct: -2.25 };

  approximatelyEqual(G.gamma(0), 1);
  approximatelyEqual(G.rapidityFromBeta(0), 0);
  assertEventClose(G.earthToRocket(event, 0), event);
  assertEventClose(G.rocketToEarth(event, 0), event);
});

test("the beta 0.6 example has the expected Lorentz coordinates", () => {
  const event = { x: 4, ct: 5 };

  approximatelyEqual(G.gamma(0.6), 1.25);
  assertEventClose(G.earthToRocket(event, 0.6), { x: 1.25, ct: 3.25 });
});

test("forward and inverse transformations round-trip for positive and negative speeds", () => {
  const events = [
    { x: 3, ct: 5 },
    { x: -6.25, ct: 1.75 },
    { x: 0.125, ct: -8 }
  ];

  [-0.95, -0.6, -0.01, 0, 0.01, 0.6, 0.95].forEach((beta) => {
    events.forEach((event) => {
      const rocket = G.earthToRocket(event, beta);
      assertEventClose(G.rocketToEarth(rocket, beta), event, 1e-9);
    });
  });
});

test("rapidity and beta conversions round-trip at the supported limits", () => {
  [-0.95, -0.4, 0, 0.4, 0.95].forEach((beta) => {
    approximatelyEqual(G.betaFromRapidity(G.rapidityFromBeta(beta)), beta);
  });
});

test("the Minkowski interval is invariant", () => {
  const event = { x: -3.75, ct: 7.5 };
  const interval = G.minkowskiInterval(event);

  [-0.95, -0.7, 0.2, 0.8, 0.95].forEach((beta) => {
    approximatelyEqual(
      G.minkowskiInterval(G.earthToRocket(event, beta)),
      interval,
      1e-9
    );
  });
});

test("the rocket worldline maps to x prime equals zero", () => {
  [-0.95, -0.5, 0.25, 0.95].forEach((beta) => {
    const event = { x: beta * 7, ct: 7 };
    approximatelyEqual(G.earthToRocket(event, beta).x, 0, 1e-9);
  });
});

test("the rocket position axis maps to ct prime equals zero", () => {
  [-0.95, -0.5, 0.25, 0.95].forEach((beta) => {
    const event = { x: 7, ct: beta * 7 };
    approximatelyEqual(G.earthToRocket(event, beta).ct, 0, 1e-9);
  });
});

test("both light rays remain light rays under every supported boost", () => {
  [-0.95, -0.6, 0, 0.6, 0.95].forEach((beta) => {
    [{ x: 5, ct: 5 }, { x: -5, ct: 5 }].forEach((event) => {
      const transformed = G.earthToRocket(event, beta);
      approximatelyEqual(Math.abs(transformed.x), Math.abs(transformed.ct), 1e-9);
      approximatelyEqual(G.minkowskiInterval(transformed), 0, 1e-9);
    });
  });
});

test("invalid light-speed and superluminal beta values are rejected", () => {
  [-1.1, -1, 1, 1.1].forEach((beta) => {
    assert.throws(() => G.gamma(beta), RangeError);
  });
});

test("Earth-simultaneous events are not simultaneous for the moving rocket", () => {
  const eventA = { x: 3, ct: 5 };
  const eventB = { x: -3, ct: 5 };

  approximatelyEqual(G.timeDifferenceInFrame(eventA, eventB, 0), 0);
  approximatelyEqual(G.timeDifferenceInFrame(eventA, eventB, 0.6), 4.5);
  assert.equal(G.areSimultaneousInFrame(eventA, eventB, 0, 0.01), true);
  assert.equal(G.areSimultaneousInFrame(eventA, eventB, 0.6, 0.01), false);
});

test("events satisfying delta ct equals beta delta x are rocket-simultaneous", () => {
  const eventA = { x: 0, ct: 0 };
  const positiveEventB = { x: 5, ct: 3 };
  const negativeEventB = { x: 4, ct: -2.4 };

  approximatelyEqual(G.timeDifferenceInFrame(eventA, positiveEventB, 0.6), 0);
  approximatelyEqual(G.timeDifferenceInFrame(eventA, negativeEventB, -0.6), 0);
  assert.equal(G.areSimultaneousInFrame(eventA, positiveEventB, 0.6, 0.01), true);
  assert.equal(G.areSimultaneousInFrame(eventA, negativeEventB, -0.6, 0.01), true);
});

test("simultaneity tolerance is inclusive and rejects invalid values", () => {
  const eventA = { x: 0, ct: 2 };

  assert.equal(
    G.areSimultaneousInFrame(eventA, { x: 0, ct: 2.01 }, 0, 0.01),
    true
  );
  assert.equal(
    G.areSimultaneousInFrame(eventA, { x: 0, ct: 2.010001 }, 0, 0.01),
    false
  );
  assert.throws(
    () => G.areSimultaneousInFrame(eventA, eventA, 0, -0.01),
    RangeError
  );
});
