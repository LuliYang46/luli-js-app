"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("./geometry.js");

const TOLERANCE = 1e-7;

function approximatelyEqual(actual, expected, tolerance = TOLERANCE) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function assertPointClose(actual, expected, tolerance = TOLERANCE) {
  approximatelyEqual(actual.x, expected.x, tolerance);
  approximatelyEqual(actual.y, expected.y, tolerance);
}

function trialPoints(vertices) {
  return [
    G.pointFromBarycentric({ a: 0.2, b: 0.3, c: 0.5 }, vertices.A, vertices.B, vertices.C),
    G.pointFromBarycentric({ a: 0, b: 0.6, c: 0.4 }, vertices.A, vertices.B, vertices.C),
    G.pointFromBarycentric({ a: 0.75, b: 0.1, c: 0.15 }, vertices.A, vertices.B, vertices.C)
  ];
}

test("equilateral triangle has its Fermat point at the center", () => {
  const vertices = {
    A: { x: 0, y: Math.sqrt(3) },
    B: { x: -1, y: 0 },
    C: { x: 1, y: 0 }
  };
  const result = G.fermatPoint(vertices);

  assert.equal(result.type, "interior");
  assertPointClose(result.point, { x: 0, y: Math.sqrt(3) / 3 });
  Object.values(result.angles).forEach((angle) => approximatelyEqual(angle, Math.PI / 3));
  [
    G.angleAt(result.point, vertices.A, vertices.B),
    G.angleAt(result.point, vertices.B, vertices.C),
    G.angleAt(result.point, vertices.C, vertices.A)
  ].forEach((angle) => approximatelyEqual(angle, G.ONE_TWENTY_DEGREES));
});

test("all three exterior construction lines concur for acute scalene triangles", () => {
  const triangles = [
    { A: { x: 570, y: 125 }, B: { x: 250, y: 570 }, C: { x: 930, y: 545 } },
    { A: { x: 1.1, y: -1.2 }, B: { x: -2.4, y: 2.6 }, C: { x: 4.3, y: 2.1 } },
    { A: { x: 0, y: 0 }, B: { x: 5, y: 0 }, C: { x: 2.2, y: 4.4 } }
  ];

  triangles.forEach((vertices) => {
    const result = G.fermatPoint(vertices);
    assert.equal(result.type, "interior");
    Object.values(result.constructions).forEach((construction) => {
      approximatelyEqual(
        G.distanceToLine(result.point, construction.apex, construction.targetPoint),
        0
      );
      assert.ok(G.pointInTriangle(result.point, vertices.A, vertices.B, vertices.C));
    });
  });
});

test("each selected rotation preserves both required equality families", () => {
  const vertices = {
    A: { x: 570, y: 125 },
    B: { x: 250, y: 570 },
    C: { x: 930, y: 545 }
  };
  const point = G.pointFromBarycentric({ a: 0.27, b: 0.43, c: 0.30 }, vertices.A, vertices.B, vertices.C);

  Object.keys(G.ROTATION_SPECS).forEach((key) => {
    const construction = G.constructionFor(vertices, point, key);
    const movingDistance = G.distance(construction.movingPoint, point);
    const rotatedMovingDistance = G.distance(construction.apex, construction.rotatedPoint);
    const pivotDistance = G.distance(construction.pivotPoint, point);

    approximatelyEqual(movingDistance, rotatedMovingDistance);
    approximatelyEqual(pivotDistance, G.distance(construction.pivotPoint, construction.rotatedPoint));
    approximatelyEqual(pivotDistance, G.distance(point, construction.rotatedPoint));
    approximatelyEqual(G.distance(construction.movingPoint, construction.pivotPoint), G.distance(construction.apex, construction.pivotPoint));

    const originalSide = G.cross(
      G.subtract(construction.movingPoint, construction.pivotPoint),
      G.subtract(vertices[construction.opposite], construction.pivotPoint)
    );
    const apexSide = G.cross(
      G.subtract(construction.movingPoint, construction.pivotPoint),
      G.subtract(construction.apex, construction.pivotPoint)
    );
    assert.ok(originalSide * apexSide < 0, `${key} apex should be exterior`);
  });
});

test("trial totals never beat the Fermat minimum", () => {
  const vertices = {
    A: { x: 570, y: 125 },
    B: { x: 250, y: 570 },
    C: { x: 930, y: 545 }
  };
  const result = G.fermatPoint(vertices);

  trialPoints(vertices).forEach((point) => {
    assert.ok(G.distanceSum(point, vertices) + TOLERANCE >= result.minimum);
  });
  approximatelyEqual(G.distanceSum(result.point, vertices), result.minimum);
});

test("the transformed path at F is straight for every rotation choice", () => {
  const vertices = {
    A: { x: 570, y: 125 },
    B: { x: 250, y: 570 },
    C: { x: 930, y: 545 }
  };
  const result = G.fermatPoint(vertices);

  Object.keys(G.ROTATION_SPECS).forEach((key) => {
    const construction = G.constructionFor(vertices, result.point, key);
    const chain = [
      construction.apex,
      construction.rotatedPoint,
      result.point,
      construction.targetPoint
    ];
    chain.slice(1, -1).forEach((point) => {
      approximatelyEqual(G.distanceToLine(point, chain[0], chain.at(-1)), 0);
    });
    const chainLength = chain.slice(0, -1).reduce((total, point, index) => {
      return total + G.distance(point, chain[index + 1]);
    }, 0);
    approximatelyEqual(chainLength, G.distance(chain[0], chain.at(-1)));
    approximatelyEqual(chainLength, result.minimum);
  });
});

test("an exactly 120-degree angle uses that vertex", () => {
  const vertices = {
    A: { x: 0, y: 0 },
    B: { x: 2, y: 0 },
    C: { x: -1, y: Math.sqrt(3) }
  };
  const result = G.fermatPoint(vertices);

  assert.equal(result.type, "vertex");
  assert.equal(result.vertex, "A");
  assertPointClose(result.point, vertices.A);
  approximatelyEqual(result.minimum, G.distance(vertices.A, vertices.B) + G.distance(vertices.A, vertices.C));
});

test("an obtuse triangle uses its wide-angle vertex", () => {
  const vertices = {
    A: { x: 0, y: 0 },
    B: { x: 4, y: 0 },
    C: { x: -2, y: 1 }
  };
  const result = G.fermatPoint(vertices);

  assert.equal(result.type, "vertex");
  assert.equal(result.vertex, "A");
  assertPointClose(result.point, vertices.A);
  trialPoints(vertices).forEach((point) => {
    assert.ok(G.distanceSum(point, vertices) + TOLERANCE >= result.minimum);
  });
});

test("barycentric coordinates preserve P as vertices move", () => {
  const weights = { a: 0.21, b: 0.34, c: 0.45 };
  const first = { A: { x: 0, y: 0 }, B: { x: 5, y: 0 }, C: { x: 2, y: 4 } };
  const second = { A: { x: 1, y: -1 }, B: { x: 7, y: 2 }, C: { x: -1, y: 5 } };
  const point = G.pointFromBarycentric(weights, first.A, first.B, first.C);
  const recovered = G.barycentricCoordinates(point, first.A, first.B, first.C);

  approximatelyEqual(recovered.a, weights.a);
  approximatelyEqual(recovered.b, weights.b);
  approximatelyEqual(recovered.c, weights.c);
  assert.ok(G.pointInTriangle(
    G.pointFromBarycentric(recovered, second.A, second.B, second.C),
    second.A,
    second.B,
    second.C
  ));
});
