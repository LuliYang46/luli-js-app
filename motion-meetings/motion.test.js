"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const M = require("./motion.js");

function close(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should equal ${expected}`);
}

test("the sketch has ten meetings; the third explains a one-S difference", () => {
  const model = M.analyzeMotion({ ratio: [5, 3], starts: ["A", "B"] });
  assert.equal(model.events.length, 10);
  const third = model.events[2];
  assert.deepEqual(third.time, { n: 1, d: 2 });
  assert.equal(third.x, 0.5);
  assert.deepEqual(third.distances, [{ n: 5, d: 2 }, { n: 3, d: 2 }]);
  assert.deepEqual(third.relations, [{ kind: "difference", multiple: 1 }]);
  assert.deepEqual(model.events[0].relations, [{ kind: "sum", multiple: 1 }]);
});

test("equivalent ratios produce identical periods and events", () => {
  assert.deepEqual(
    M.analyzeMotion({ ratio: [10, 6], starts: ["A", "B"] }),
    M.analyzeMotion({ ratio: [5, 3], starts: ["A", "B"] })
  );
});

test("endpoint meetings are deduplicated, the initial start is excluded, and the period end is included", () => {
  const same = M.analyzeMotion({ ratio: [3, 1], starts: ["A", "A"] });
  assert.deepEqual(same.events.map(event => event.t), [0.5, 1, 1.5, 2]);
  assert.equal(same.events[1].endpoint, "B");
  assert.equal(same.events[3].endpoint, "A");
  assert.deepEqual(same.events[1].relations, [
    { kind: "difference", multiple: 2 }, { kind: "sum", multiple: 4 }
  ]);
  const opposite = M.analyzeMotion({ ratio: [2, 1], starts: ["A", "B"] });
  assert.deepEqual(opposite.events.map(event => event.time), [
    { n: 1, d: 3 }, { n: 1, d: 1 }, { n: 5, d: 3 }
  ]);
  assert.equal(opposite.events[1].endpoint, "A");
});

test("equal speeds distinguish continuous overlap from two midpoint encounters", () => {
  for (const start of ["A", "B"]) {
    const model = M.analyzeMotion({ ratio: [7, 7], starts: [start, start] });
    assert.equal(model.continuous, true);
    assert.deepEqual(model.events, []);
  }
  const model = M.analyzeMotion({ ratio: [12, 12], starts: ["B", "A"] });
  assert.equal(model.continuous, false);
  assert.deepEqual(model.events.map(event => event.t), [0.5, 1.5]);
  model.events.forEach(event => assert.equal(event.x, 0.5));
});

test("all 576 configurations have complete, ordered, correct meeting sets and the shortest shared period", () => {
  let configurations = 0;
  for (let first = 1; first <= 12; first++) {
    for (let second = 1; second <= 12; second++) {
      for (const a of ["A", "B"]) {
        for (const b of ["A", "B"]) {
          configurations++;
          const model = M.analyzeMotion({ ratio: [first, second], starts: [a, b] });
          const [p, q] = model.ratio;
          assert.equal(M.gcd(p, q), 1);
          assert.equal(model.period, 2);
          close(M.positionAt(p, a, 2), a === "A" ? 0 : 1);
          close(M.positionAt(q, b, 2), b === "A" ? 0 : 1);
          // Check every earlier return of person 1: none can also return person 2.
          for (let trip = 1; trip < p; trip++) {
            assert.ok(Math.abs(M.positionAt(q, b, 2 * trip / p) - (b === "A" ? 0 : 1)) > 1e-9);
          }
          if (model.continuous) continue;

          const times = new Set();
          model.events.forEach((event, i) => {
            assert.equal(event.index, i + 1);
            assert.ok(event.t > 0 && event.t <= 2);
            if (i) assert.ok(event.t > model.events[i - 1].t);
            const key = `${event.time.n}/${event.time.d}`;
            assert.ok(!times.has(key));
            times.add(key);
            close(M.positionAt(p, a, event.t), event.x);
            close(M.positionAt(q, b, event.t), event.x);
            assert.ok(event.relations.length > 0);
            for (const relation of event.relations) {
              const d1 = M.value(event.distances[0]);
              const d2 = M.value(event.distances[1]);
              close(relation.kind === "sum" ? d1 + d2 : Math.abs(d1 - d2), relation.multiple);
              assert.equal(relation.multiple % 2, a === b ? 0 : 1);
            }
          });

          // Independent completeness check: partition time at all endpoint turns,
          // then solve the linear position difference on every interval.
          const breaks = new Set([0, 2]);
          for (const speed of [p, q]) for (let leg = 1; leg < 2 * speed; leg++) breaks.add(leg / speed);
          const boundaries = [...breaks].sort((x, y) => x - y);
          const expected = [];
          function add(t) {
            if (t > 1e-9 && !expected.some(other => Math.abs(t - other) < 1e-9)) expected.push(t);
          }
          for (let j = 1; j < boundaries.length; j++) {
            const left = boundaries[j - 1], right = boundaries[j];
            const fl = M.positionAt(p, a, left) - M.positionAt(q, b, left);
            const fr = M.positionAt(p, a, right) - M.positionAt(q, b, right);
            if (Math.abs(fl) < 1e-9) add(left);
            if (Math.abs(fr) < 1e-9) add(right);
            if (fl * fr < 0 && Math.abs(fl) > 1e-9 && Math.abs(fr) > 1e-9) add(left - fl * (right - left) / (fr - fl));
          }
          expected.sort((x, y) => x - y);
          assert.equal(model.events.length, expected.length, `${first}:${second}, ${a}/${b}`);
          expected.forEach((time, i) => close(time, model.events[i].t));
        }
      }
    }
  }
  assert.equal(configurations, 576);
});

test("folded routes preserve distance, endpoint turns, and the final meeting position", () => {
  for (const starts of [["A", "B"], ["B", "A"], ["A", "A"], ["B", "B"]]) {
    for (const event of M.analyzeMotion({ ratio: [12, 11], starts }).events) {
      [12, 11].forEach((speed, i) => {
        const route = M.routeAt(speed, starts[i], event.t);
        close(route.reduce((sum, leg) => sum + leg.length, 0), speed * event.t);
        close(route.at(-1).to, event.x);
        route.forEach((leg, j) => {
          assert.ok(leg.length > 0 && leg.length <= 1);
          if (j) close(leg.from, route[j - 1].to);
        });
      });
    }
  }
  assert.deepEqual(M.routeAt(5, "A", 0), []);
  assert.equal(M.routeAt(5, "A", 0.4).length, 2);
});

test("invalid inputs are rejected, and exact fractions format without approximation", () => {
  for (const bad of [0, -1, 13, 1.5, NaN, Infinity, "5"]) {
    assert.throws(() => M.analyzeMotion({ ratio: [bad, 3], starts: ["A", "B"] }));
  }
  assert.throws(() => M.analyzeMotion({ ratio: [5, 3], starts: ["C", "B"] }));
  assert.throws(() => M.analyzeMotion({ ratio: [], starts: [] }));
  assert.throws(() => M.positionAt(5, "A", -1));
  assert.throws(() => M.routeAt(5, "A", 3));
  assert.equal(M.formatFraction({ n: 5, d: 2 }), "2.5");
  assert.equal(M.formatFraction({ n: 2, d: 3 }), "2/3");
  assert.deepEqual(M.fraction(0, -6), { n: 0, d: 1 });
});
