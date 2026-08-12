(function initFermatGeometry(root, factory) {
  const geometry = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = geometry;
  } else {
    root.FermatGeometry = geometry;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createFermatGeometry() {
  "use strict";

  const TAU = Math.PI * 2;
  const SIXTY_DEGREES = Math.PI / 3;
  const ONE_TWENTY_DEGREES = Math.PI * 2 / 3;
  const EPSILON = 1e-9;

  function add(a, b) {
    return { x: a.x + b.x, y: a.y + b.y };
  }

  function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
  }

  function scale(vector, amount) {
    return { x: vector.x * amount, y: vector.y * amount };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  function cross(a, b) {
    return a.x * b.y - a.y * b.x;
  }

  function magnitude(vector) {
    return Math.hypot(vector.x, vector.y);
  }

  function distance(a, b) {
    return magnitude(subtract(a, b));
  }

  function normalize(vector) {
    const length = magnitude(vector);
    if (length < EPSILON) return { x: 0, y: 0 };
    return scale(vector, 1 / length);
  }

  function lerp(a, b, amount) {
    return {
      x: a.x + (b.x - a.x) * amount,
      y: a.y + (b.y - a.y) * amount
    };
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function rotateAround(point, center, angle) {
    const relative = subtract(point, center);
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);

    return {
      x: center.x + relative.x * cosine - relative.y * sine,
      y: center.y + relative.x * sine + relative.y * cosine
    };
  }

  function signedDoubleArea(a, b, c) {
    return cross(subtract(b, a), subtract(c, a));
  }

  function triangleArea(a, b, c) {
    return Math.abs(signedDoubleArea(a, b, c)) / 2;
  }

  function angleAt(vertex, first, second) {
    const u = subtract(first, vertex);
    const v = subtract(second, vertex);
    const denominator = magnitude(u) * magnitude(v);

    if (denominator < EPSILON) return 0;
    return Math.acos(clamp(dot(u, v) / denominator, -1, 1));
  }

  function barycentricCoordinates(point, a, b, c) {
    const denominator = signedDoubleArea(a, b, c);
    if (Math.abs(denominator) < EPSILON) return null;

    const wa = signedDoubleArea(point, b, c) / denominator;
    const wb = signedDoubleArea(point, c, a) / denominator;
    return { a: wa, b: wb, c: 1 - wa - wb };
  }

  function pointFromBarycentric(weights, a, b, c) {
    return {
      x: weights.a * a.x + weights.b * b.x + weights.c * c.x,
      y: weights.a * a.y + weights.b * b.y + weights.c * c.y
    };
  }

  function pointInTriangle(point, a, b, c, tolerance = 1e-8) {
    const weights = barycentricCoordinates(point, a, b, c);
    if (!weights) return false;
    return weights.a >= -tolerance && weights.b >= -tolerance && weights.c >= -tolerance;
  }

  function closestPointOnSegment(point, start, end) {
    const segment = subtract(end, start);
    const denominator = dot(segment, segment);
    if (denominator < EPSILON) return { ...start };
    const amount = clamp(dot(subtract(point, start), segment) / denominator, 0, 1);
    return add(start, scale(segment, amount));
  }

  function closestPointInTriangle(point, a, b, c) {
    if (pointInTriangle(point, a, b, c)) return { ...point };

    const candidates = [
      closestPointOnSegment(point, a, b),
      closestPointOnSegment(point, b, c),
      closestPointOnSegment(point, c, a)
    ];

    return candidates.reduce((closest, candidate) => {
      return distance(point, candidate) < distance(point, closest) ? candidate : closest;
    });
  }

  function lineIntersection(a, b, c, d) {
    const firstDirection = subtract(b, a);
    const secondDirection = subtract(d, c);
    const denominator = cross(firstDirection, secondDirection);
    if (Math.abs(denominator) < EPSILON) return null;

    const amount = cross(subtract(c, a), secondDirection) / denominator;
    return add(a, scale(firstDirection, amount));
  }

  function distanceToLine(point, start, end) {
    const direction = subtract(end, start);
    const length = magnitude(direction);
    if (length < EPSILON) return distance(point, start);
    return Math.abs(cross(direction, subtract(point, start))) / length;
  }

  function exteriorRotationAngle(moving, pivot, opposite) {
    const side = subtract(moving, pivot);
    const oppositeSide = cross(side, subtract(opposite, pivot));
    const plusPoint = rotateAround(moving, pivot, SIXTY_DEGREES);
    const plusSide = cross(side, subtract(plusPoint, pivot));

    if (Math.abs(oppositeSide) < EPSILON) return SIXTY_DEGREES;
    return oppositeSide * plusSide < 0 ? SIXTY_DEGREES : -SIXTY_DEGREES;
  }

  const ROTATION_SPECS = Object.freeze({
    AB: Object.freeze({ key: "AB", moving: "A", pivot: "B", opposite: "C", target: "C" }),
    BC: Object.freeze({ key: "BC", moving: "B", pivot: "C", opposite: "A", target: "A" }),
    CA: Object.freeze({ key: "CA", moving: "C", pivot: "A", opposite: "B", target: "B" })
  });

  function constructionFor(vertices, point, key) {
    const spec = ROTATION_SPECS[key];
    if (!spec) throw new Error(`Unknown rotation construction: ${key}`);

    const moving = vertices[spec.moving];
    const pivot = vertices[spec.pivot];
    const opposite = vertices[spec.opposite];
    const target = vertices[spec.target];
    const angle = exteriorRotationAngle(moving, pivot, opposite);

    return {
      ...spec,
      angle,
      movingPoint: moving,
      pivotPoint: pivot,
      targetPoint: target,
      apex: rotateAround(moving, pivot, angle),
      rotatedPoint: rotateAround(point, pivot, angle)
    };
  }

  function triangleAngles(vertices) {
    return {
      A: angleAt(vertices.A, vertices.B, vertices.C),
      B: angleAt(vertices.B, vertices.C, vertices.A),
      C: angleAt(vertices.C, vertices.A, vertices.B)
    };
  }

  function distanceSum(point, vertices) {
    return distance(point, vertices.A)
      + distance(point, vertices.B)
      + distance(point, vertices.C);
  }

  function fermatPoint(vertices, angleTolerance = 1e-8) {
    const angles = triangleAngles(vertices);
    const wideVertex = ["A", "B", "C"].find((label) => {
      return angles[label] >= ONE_TWENTY_DEGREES - angleTolerance;
    });

    if (wideVertex) {
      const point = { ...vertices[wideVertex] };
      return {
        type: "vertex",
        point,
        vertex: wideVertex,
        angles,
        minimum: distanceSum(point, vertices),
        constructions: null
      };
    }

    const constructions = {};
    Object.keys(ROTATION_SPECS).forEach((key) => {
      constructions[key] = constructionFor(vertices, vertices.A, key);
    });

    const first = constructions.AB;
    const second = constructions.BC;
    let point = lineIntersection(first.apex, first.targetPoint, second.apex, second.targetPoint);

    if (!point) {
      const third = constructions.CA;
      point = lineIntersection(first.apex, first.targetPoint, third.apex, third.targetPoint);
    }

    if (!point) throw new Error("Unable to intersect Fermat construction lines.");

    return {
      type: "interior",
      point,
      vertex: null,
      angles,
      minimum: distanceSum(point, vertices),
      constructions
    };
  }

  function normalizeAngle(angle) {
    let result = angle % TAU;
    if (result < 0) result += TAU;
    return result;
  }

  return Object.freeze({
    TAU,
    SIXTY_DEGREES,
    ONE_TWENTY_DEGREES,
    EPSILON,
    ROTATION_SPECS,
    add,
    subtract,
    scale,
    dot,
    cross,
    magnitude,
    distance,
    normalize,
    lerp,
    clamp,
    rotateAround,
    signedDoubleArea,
    triangleArea,
    angleAt,
    barycentricCoordinates,
    pointFromBarycentric,
    pointInTriangle,
    closestPointOnSegment,
    closestPointInTriangle,
    lineIntersection,
    distanceToLine,
    exteriorRotationAngle,
    constructionFor,
    triangleAngles,
    distanceSum,
    fermatPoint,
    normalizeAngle
  });
});
