(() => {
  "use strict";

  const G = window.FermatGeometry;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const STEP_COUNT = 6;
  const ROTATION_DURATION = 900;
  const AUTOPLAY_DELAY = 1650;
  const MODEL_BOUNDS = Object.freeze({ minX: 70, maxX: 1130, minY: 55, maxY: 665 });
  const MIN_TRIANGLE_AREA = 6500;
  const MIN_VERTEX_DISTANCE = 90;
  const VIEW_ASPECT = 4 / 3;

  const defaults = Object.freeze({
    vertices: Object.freeze({
      A: Object.freeze({ x: 570, y: 125 }),
      B: Object.freeze({ x: 250, y: 570 }),
      C: Object.freeze({ x: 930, y: 545 })
    }),
    pWeights: Object.freeze({ a: 0.27, b: 0.43, c: 0.30 }),
    rotationKey: "AB"
  });

  const state = {
    vertices: cloneVertices(defaults.vertices),
    pWeights: { ...defaults.pWeights },
    rotationKey: defaults.rotationKey,
    step: 0,
    dragging: null,
    dragMoved: false,
    rotationProgress: 0,
    rotationFrame: null,
    playTimer: null,
    playing: false,
    wideMode: false
  };

  const el = {
    diagram: document.getElementById("diagram"),
    triangleFill: document.getElementById("triangleFill"),
    triangleOutline: document.getElementById("triangleOutline"),
    trialLayer: document.getElementById("trialLayer"),
    trialPath: document.getElementById("trialPath"),
    trialFormula: document.getElementById("trialFormula"),
    rotationLayer: document.getElementById("rotationLayer"),
    rotationSweep: document.getElementById("rotationSweep"),
    rotatingTriangle: document.getElementById("rotatingTriangle"),
    rotatingEdges: document.getElementById("rotatingEdges"),
    angleArc: document.getElementById("angleArc"),
    angleLabel: document.getElementById("angleLabel"),
    rotatedMovingDot: document.getElementById("rotatedMovingDot"),
    rotatedPointDot: document.getElementById("rotatedPointDot"),
    rotatedMovingLabel: document.getElementById("rotatedMovingLabel"),
    rotatedPointLabel: document.getElementById("rotatedPointLabel"),
    equalityLayer: document.getElementById("equalityLayer"),
    straightenedTrialPath: document.getElementById("straightenedTrialPath"),
    equalitySegments: document.getElementById("equalitySegments"),
    equalityTicks: document.getElementById("equalityTicks"),
    equalityLabels: document.getElementById("equalityLabels"),
    selectedLineLayer: document.getElementById("selectedLineLayer"),
    selectedConstructionLine: document.getElementById("selectedConstructionLine"),
    selectedLineLabel: document.getElementById("selectedLineLabel"),
    allLinesLayer: document.getElementById("allLinesLayer"),
    allConstructionLines: document.getElementById("allConstructionLines"),
    optimalStraightPath: document.getElementById("optimalStraightPath"),
    fermatHalo: document.getElementById("fermatHalo"),
    fermatDot: document.getElementById("fermatDot"),
    fermatLabel: document.getElementById("fermatLabel"),
    fermatAngleMarks: document.getElementById("fermatAngleMarks"),
    wideAngleLayer: document.getElementById("wideAngleLayer"),
    wideAngleArc: document.getElementById("wideAngleArc"),
    wideAngleLabel: document.getElementById("wideAngleLabel"),
    vertexFermatHalo: document.getElementById("vertexFermatHalo"),
    vertexFermatLabel: document.getElementById("vertexFermatLabel"),
    trialPointHandle: document.getElementById("trialPointHandle"),
    pointGroups: Array.from(document.querySelectorAll("[data-point]")),
    rotationChoices: Array.from(document.querySelectorAll("[data-rotation]")),
    stepBadge: document.getElementById("stepBadge"),
    stepKicker: document.getElementById("stepKicker"),
    stepTitle: document.getElementById("stepTitle"),
    stepExplanation: document.getElementById("stepExplanation"),
    playButton: document.getElementById("playButton"),
    backButton: document.getElementById("backButton"),
    nextButton: document.getElementById("nextButton"),
    resetButton: document.getElementById("resetButton"),
    trialTotal: document.getElementById("trialTotal"),
    minimumTotal: document.getElementById("minimumTotal"),
    distanceGap: document.getElementById("distanceGap"),
    measurementNote: document.getElementById("measurementNote"),
    liveStatus: document.getElementById("liveStatus")
  };

  function cloneVertices(vertices) {
    return {
      A: { ...vertices.A },
      B: { ...vertices.B },
      C: { ...vertices.C }
    };
  }

  function createSvgElement(name, attributes = {}, text = "") {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text) node.textContent = text;
    return node;
  }

  function setAttributes(node, attributes) {
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
  }

  function setPoint(node, point) {
    setAttributes(node, { cx: point.x.toFixed(2), cy: point.y.toFixed(2) });
  }

  function setTextPoint(node, point) {
    setAttributes(node, { x: point.x.toFixed(2), y: point.y.toFixed(2) });
  }

  function setLine(node, start, end) {
    setAttributes(node, {
      x1: start.x.toFixed(2),
      y1: start.y.toFixed(2),
      x2: end.x.toFixed(2),
      y2: end.y.toFixed(2)
    });
  }

  function pathFrom(points, close = false) {
    if (!points.length) return "";
    const commands = points.map((point, index) => {
      return `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    });
    if (close) commands.push("Z");
    return commands.join(" ");
  }

  function polygonFrom(points) {
    return points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
  }

  function pointAtAngle(center, angle, radius) {
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius
    };
  }

  function arcPath(center, startAngle, delta, radius) {
    const start = pointAtAngle(center, startAngle, radius);
    const end = pointAtAngle(center, startAngle + delta, radius);
    const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;
    const sweep = delta >= 0 ? 1 : 0;
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }

  function sectorPath(center, startAngle, delta, radius) {
    const start = pointAtAngle(center, startAngle, radius);
    const end = pointAtAngle(center, startAngle + delta, radius);
    const sweep = delta >= 0 ? 1 : 0;
    return `M ${center.x.toFixed(2)} ${center.y.toFixed(2)} L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${radius} ${radius} 0 0 ${sweep} ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`;
  }

  function formatDistance(value) {
    return Number.isFinite(value) ? value.toFixed(1) : "—";
  }

  function degrees(radians) {
    return radians * 180 / Math.PI;
  }

  function pointP() {
    return G.pointFromBarycentric(
      state.pWeights,
      state.vertices.A,
      state.vertices.B,
      state.vertices.C
    );
  }

  function currentData() {
    const P = pointP();
    const fermat = G.fermatPoint(state.vertices);
    const construction = fermat.type === "interior"
      ? G.constructionFor(state.vertices, P, state.rotationKey)
      : null;
    return {
      P,
      fermat,
      construction,
      trialTotal: G.distanceSum(P, state.vertices)
    };
  }

  function isValidTriangle(vertices) {
    const distances = [
      G.distance(vertices.A, vertices.B),
      G.distance(vertices.B, vertices.C),
      G.distance(vertices.C, vertices.A)
    ];
    return G.triangleArea(vertices.A, vertices.B, vertices.C) >= MIN_TRIANGLE_AREA
      && Math.min(...distances) >= MIN_VERTEX_DISTANCE;
  }

  function clampToModel(point) {
    return {
      x: G.clamp(point.x, MODEL_BOUNDS.minX, MODEL_BOUNDS.maxX),
      y: G.clamp(point.y, MODEL_BOUNDS.minY, MODEL_BOUNDS.maxY)
    };
  }

  function labelOffsetFromCentroid(point, vertices, amount = 31) {
    const centroid = {
      x: (vertices.A.x + vertices.B.x + vertices.C.x) / 3,
      y: (vertices.A.y + vertices.B.y + vertices.C.y) / 3
    };
    const direction = G.normalize(G.subtract(point, centroid));
    const fallback = { x: 0.75, y: -0.66 };
    const unit = G.magnitude(direction) < G.EPSILON ? fallback : direction;
    return G.add(point, G.scale(unit, amount));
  }

  function textOffset(point, reference, amount = 25) {
    let normal = G.normalize({
      x: -(point.y - reference.y),
      y: point.x - reference.x
    });
    if (normal.y > 0.5) normal = G.scale(normal, -1);
    return G.add(point, G.scale(normal, amount));
  }

  function stepCopy(data) {
    if (data.fermat.type === "vertex") {
      const vertex = data.fermat.vertex;
      const angle = degrees(data.fermat.angles[vertex]);
      return {
        kicker: "The 120° exception",
        title: `Angle ${vertex} is ${angle.toFixed(1)}°, so the Fermat point is vertex ${vertex}.`,
        explanation: "When an angle is at least 120°, moving into the triangle cannot shorten the total. The minimum is the sum of the two sides meeting at that vertex."
      };
    }

    const { moving, pivot, target } = data.construction;
    const prime = `${moving}′`;
    const copies = [
      {
        kicker: "Explore",
        title: "Shape the triangle and choose any trial point P.",
        explanation: "P does not need to be your best guess. Its three distances give us a path that can be straightened."
      },
      {
        kicker: "Add the distances",
        title: "The orange path has length PA + PB + PC.",
        explanation: "Move P to compare different totals. The construction works for every trial point inside the triangle."
      },
      {
        kicker: "Rotate 60°",
        title: `Rotate triangle ${moving}${pivot}P about ${pivot}, carrying ${moving} to ${prime} and P to P′.`,
        explanation: `The signed rotation is chosen so the equilateral triangle ${moving}${pivot}${prime} lies outside ABC.`
      },
      {
        kicker: "Preserve the length",
        title: `${moving}P = ${prime}P′ and ${pivot}P = ${pivot}P′ = PP′.`,
        explanation: `Therefore ${prime}P′ + P′P + P${target} is exactly the original total PA + PB + PC.`
      },
      {
        kicker: "Straighten the chain",
        title: `Every trial chain from ${prime} to ${target} is at least as long as straight line ${prime}${target}.`,
        explanation: "Equality is possible only when all four points in the transformed chain lie on that straight line."
      },
      {
        kicker: "The Fermat point",
        title: "The three construction lines meet at the same point F.",
        explanation: "At F the three rays to A, B, and C make 120° angles, the transformed chain is straight, and FA + FB + FC reaches its minimum."
      }
    ];
    return copies[state.step];
  }

  function setLayerVisible(layer, visible) {
    layer.classList.toggle("is-visible", visible);
  }

  function updateViewBox(data) {
    if (state.dragging) return;

    const points = [state.vertices.A, state.vertices.B, state.vertices.C, data.P];
    if (data.fermat.type === "interior") {
      Object.keys(G.ROTATION_SPECS).forEach((key) => {
        const construction = G.constructionFor(state.vertices, data.P, key);
        points.push(
          construction.apex,
          construction.rotatedPoint,
          construction.targetPoint
        );
      });
      points.push(data.fermat.point);
    }

    let minX = Math.min(...points.map((point) => point.x));
    let maxX = Math.max(...points.map((point) => point.x));
    let minY = Math.min(...points.map((point) => point.y));
    let maxY = Math.max(...points.map((point) => point.y));
    minX -= 72;
    maxX += 72;
    minY -= 72;
    maxY += 72;

    let width = Math.max(920, maxX - minX);
    let height = Math.max(690, maxY - minY);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    if (width / height < VIEW_ASPECT) width = height * VIEW_ASPECT;
    else height = width / VIEW_ASPECT;

    el.diagram.setAttribute("viewBox", [
      (centerX - width / 2).toFixed(2),
      (centerY - height / 2).toFixed(2),
      width.toFixed(2),
      height.toFixed(2)
    ].join(" "));
  }

  function renderTriangle(data) {
    const vertices = state.vertices;
    const trianglePoints = [vertices.A, vertices.B, vertices.C];
    el.triangleFill.setAttribute("points", polygonFrom(trianglePoints));
    el.triangleOutline.setAttribute("d", pathFrom([...trianglePoints, vertices.A]));
    el.trialPath.setAttribute("d", [
      pathFrom([data.P, vertices.A]),
      pathFrom([data.P, vertices.B]),
      pathFrom([data.P, vertices.C])
    ].join(" "));

    const formulaPoint = G.add(data.P, { x: 23, y: 45 });
    setTextPoint(el.trialFormula, formulaPoint);
    setLayerVisible(el.trialLayer, state.step >= 1 || data.fermat.type === "vertex");

    el.pointGroups.forEach((group) => {
      const label = group.dataset.point;
      const point = label === "P" ? data.P : vertices[label];
      group.setAttribute("transform", `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`);
      const text = group.querySelector("text");
      const labelPoint = label === "P"
        ? { x: 22, y: -18 }
        : G.subtract(labelOffsetFromCentroid(point, vertices), point);
      setAttributes(text, { x: labelPoint.x.toFixed(2), y: labelPoint.y.toFixed(2) });
    });
  }

  function renderRotation(data) {
    if (!data.construction) return;

    const construction = data.construction;
    const progress = state.step >= 2 ? state.rotationProgress : 0;
    const currentAngle = construction.angle * progress;
    const movingCurrent = G.rotateAround(construction.movingPoint, construction.pivotPoint, currentAngle);
    const pCurrent = G.rotateAround(data.P, construction.pivotPoint, currentAngle);
    const startAngle = Math.atan2(
      construction.movingPoint.y - construction.pivotPoint.y,
      construction.movingPoint.x - construction.pivotPoint.x
    );
    const sweepRadius = G.distance(construction.movingPoint, construction.pivotPoint);
    const arcRadius = Math.min(78, Math.max(48, sweepRadius * 0.20));
    const labelPoint = pointAtAngle(
      construction.pivotPoint,
      startAngle + currentAngle / 2,
      arcRadius + 29
    );

    el.rotationSweep.setAttribute("d", sectorPath(
      construction.pivotPoint,
      startAngle,
      currentAngle,
      sweepRadius
    ));
    el.rotatingTriangle.setAttribute("points", polygonFrom([
      construction.pivotPoint,
      movingCurrent,
      pCurrent
    ]));
    el.rotatingEdges.setAttribute("d", pathFrom([
      construction.movingPoint,
      construction.pivotPoint,
      data.P
    ]));
    el.angleArc.setAttribute("d", arcPath(construction.pivotPoint, startAngle, currentAngle, arcRadius));
    setTextPoint(el.angleLabel, labelPoint);
    setPoint(el.rotatedMovingDot, movingCurrent);
    setPoint(el.rotatedPointDot, pCurrent);
    el.rotatedMovingLabel.textContent = `${construction.moving}′`;
    setTextPoint(el.rotatedMovingLabel, G.add(movingCurrent, { x: 17, y: -15 }));
    setTextPoint(el.rotatedPointLabel, G.add(pCurrent, { x: 17, y: -15 }));
    setLayerVisible(el.rotationLayer, state.step >= 2);
  }

  function tickElements(start, end, count, family) {
    const midpoint = G.lerp(start, end, 0.5);
    const direction = G.normalize(G.subtract(end, start));
    const normal = { x: -direction.y, y: direction.x };
    const spacing = 8;
    const length = 15;
    const fragment = document.createDocumentFragment();

    for (let index = 0; index < count; index += 1) {
      const offset = (index - (count - 1) / 2) * spacing;
      const center = G.add(midpoint, G.scale(direction, offset));
      fragment.appendChild(createSvgElement("line", {
        class: `equality-tick ${family}`,
        x1: center.x - normal.x * length / 2,
        y1: center.y - normal.y * length / 2,
        x2: center.x + normal.x * length / 2,
        y2: center.y + normal.y * length / 2
      }));
    }
    return fragment;
  }

  function appendEqualitySegment(fragment, start, end, family) {
    fragment.appendChild(createSvgElement("line", {
      class: `equality-segment ${family}`,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y
    }));
  }

  function appendEqualityLabel(fragment, text, start, end, side = 1) {
    const midpoint = G.lerp(start, end, 0.5);
    const direction = G.normalize(G.subtract(end, start));
    const normal = { x: -direction.y * side, y: direction.x * side };
    const position = G.add(midpoint, G.scale(normal, 25));
    fragment.appendChild(createSvgElement("text", {
      class: "equality-text",
      x: position.x,
      y: position.y,
      "text-anchor": "middle"
    }, text));
  }

  function renderEqualities(data) {
    if (!data.construction) return;
    const c = data.construction;
    const firstFamily = [
      [c.movingPoint, data.P],
      [c.apex, c.rotatedPoint]
    ];
    const secondFamily = [
      [c.pivotPoint, data.P],
      [c.pivotPoint, c.rotatedPoint],
      [c.rotatedPoint, data.P]
    ];
    const segmentFragment = document.createDocumentFragment();
    const tickFragment = document.createDocumentFragment();
    const labelFragment = document.createDocumentFragment();

    firstFamily.forEach(([start, end]) => {
      appendEqualitySegment(segmentFragment, start, end, "family-one");
      tickFragment.appendChild(tickElements(start, end, 1, "family-one"));
    });
    secondFamily.forEach(([start, end]) => {
      appendEqualitySegment(segmentFragment, start, end, "family-two");
      tickFragment.appendChild(tickElements(start, end, 2, "family-two"));
    });

    appendEqualityLabel(
      labelFragment,
      `${c.moving}P = ${c.moving}′P′`,
      c.apex,
      c.rotatedPoint,
      -1
    );
    appendEqualityLabel(
      labelFragment,
      `${c.pivot}P = ${c.pivot}P′ = PP′`,
      c.rotatedPoint,
      data.P,
      1
    );

    el.equalitySegments.replaceChildren(segmentFragment);
    el.equalityTicks.replaceChildren(tickFragment);
    el.equalityLabels.replaceChildren(labelFragment);
    el.straightenedTrialPath.setAttribute("d", pathFrom([
      c.apex,
      c.rotatedPoint,
      data.P,
      c.targetPoint
    ]));
    setLayerVisible(el.equalityLayer, state.step >= 3);
  }

  function renderSelectedLine(data) {
    if (!data.construction) return;
    const c = data.construction;
    setLine(el.selectedConstructionLine, c.apex, c.targetPoint);
    const midpoint = G.lerp(c.apex, c.targetPoint, 0.5);
    setTextPoint(el.selectedLineLabel, textOffset(midpoint, c.targetPoint, 28));
    el.selectedLineLabel.textContent = `straight line ${c.moving}′${c.target}`;
    setLayerVisible(el.selectedLineLayer, state.step >= 4);
  }

  function appendFermatAngleMarks(fragment, data) {
    const center = data.fermat.point;
    const directions = ["A", "B", "C"].map((label) => ({
      label,
      angle: G.normalizeAngle(Math.atan2(
        state.vertices[label].y - center.y,
        state.vertices[label].x - center.x
      ))
    })).sort((first, second) => first.angle - second.angle);

    directions.forEach((direction, index) => {
      const next = directions[(index + 1) % directions.length];
      let delta = G.normalizeAngle(next.angle - direction.angle);
      if (delta < 1e-8) delta = G.TAU;
      fragment.appendChild(createSvgElement("path", {
        class: "fermat-angle-arc",
        d: arcPath(center, direction.angle, delta, 38)
      }));
      const textPoint = pointAtAngle(center, direction.angle + delta / 2, 59);
      fragment.appendChild(createSvgElement("text", {
        class: "fermat-angle-text",
        x: textPoint.x,
        y: textPoint.y,
        "text-anchor": "middle",
        "dominant-baseline": "middle"
      }, "120°"));
    });
  }

  function renderAllConstructions(data) {
    if (data.fermat.type !== "interior") return;
    const lineFragment = document.createDocumentFragment();

    Object.entries(data.fermat.constructions).forEach(([key, construction]) => {
      lineFragment.appendChild(createSvgElement("line", {
        class: `all-construction-line${key === state.rotationKey ? " is-selected" : ""}`,
        x1: construction.apex.x,
        y1: construction.apex.y,
        x2: construction.targetPoint.x,
        y2: construction.targetPoint.y
      }));
      lineFragment.appendChild(createSvgElement("circle", {
        class: "construction-apex",
        cx: construction.apex.x,
        cy: construction.apex.y,
        r: 5
      }));
      lineFragment.appendChild(createSvgElement("text", {
        class: "construction-apex-label",
        x: construction.apex.x + 14,
        y: construction.apex.y - 12
      }, `${construction.moving}′`));
    });
    el.allConstructionLines.replaceChildren(lineFragment);

    const selectedAtF = G.constructionFor(state.vertices, data.fermat.point, state.rotationKey);
    el.optimalStraightPath.setAttribute("d", pathFrom([
      selectedAtF.apex,
      selectedAtF.rotatedPoint,
      data.fermat.point,
      selectedAtF.targetPoint
    ]));
    setPoint(el.fermatHalo, data.fermat.point);
    setPoint(el.fermatDot, data.fermat.point);
    setTextPoint(el.fermatLabel, G.add(data.fermat.point, { x: 20, y: -19 }));

    const angleFragment = document.createDocumentFragment();
    appendFermatAngleMarks(angleFragment, data);
    el.fermatAngleMarks.replaceChildren(angleFragment);
    setLayerVisible(el.allLinesLayer, state.step >= 5);
  }

  function renderWideAngle(data) {
    const visible = data.fermat.type === "vertex";
    if (!visible) {
      setLayerVisible(el.wideAngleLayer, false);
      return;
    }

    const vertexLabel = data.fermat.vertex;
    const labels = ["A", "B", "C"].filter((label) => label !== vertexLabel);
    const center = state.vertices[vertexLabel];
    const first = state.vertices[labels[0]];
    const second = state.vertices[labels[1]];
    const startAngle = Math.atan2(first.y - center.y, first.x - center.x);
    const rawEnd = Math.atan2(second.y - center.y, second.x - center.x);
    let delta = G.normalizeAngle(rawEnd - startAngle);
    if (delta > Math.PI) delta -= G.TAU;
    const radius = 75;
    el.wideAngleArc.setAttribute("d", sectorPath(center, startAngle, delta, radius));
    const labelPoint = pointAtAngle(center, startAngle + delta / 2, radius + 30);
    setTextPoint(el.wideAngleLabel, labelPoint);
    el.wideAngleLabel.setAttribute("text-anchor", "middle");
    el.wideAngleLabel.textContent = `${degrees(data.fermat.angles[vertexLabel]).toFixed(1)}° ≥ 120°`;
    setPoint(el.vertexFermatHalo, center);
    setTextPoint(el.vertexFermatLabel, G.add(center, { x: 25, y: -25 }));
    el.vertexFermatLabel.textContent = `F = ${vertexLabel}`;
    setLayerVisible(el.wideAngleLayer, true);
  }

  function renderControls(data) {
    const wide = data.fermat.type === "vertex";
    const copy = stepCopy(data);
    el.stepBadge.textContent = wide ? "Vertex case" : `Step ${state.step + 1} of ${STEP_COUNT}`;
    el.stepKicker.textContent = copy.kicker;
    el.stepTitle.textContent = copy.title;
    el.stepExplanation.textContent = copy.explanation;

    el.rotationChoices.forEach((button) => {
      const selected = button.dataset.rotation === state.rotationKey;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
      button.disabled = wide;
    });

    el.backButton.disabled = wide || state.step === 0;
    el.nextButton.disabled = wide || state.step === STEP_COUNT - 1;
    el.playButton.disabled = wide;
    el.playButton.innerHTML = state.playing
      ? "<span aria-hidden=\"true\">Ⅱ</span> Pause"
      : state.step === STEP_COUNT - 1
        ? "<span aria-hidden=\"true\">↻</span> Replay proof"
        : "<span aria-hidden=\"true\">▶</span> Play proof";

    const revealMinimum = wide || state.step >= 5;
    const gap = Math.max(0, data.trialTotal - data.fermat.minimum);
    el.trialTotal.textContent = formatDistance(data.trialTotal);
    el.minimumTotal.textContent = revealMinimum ? formatDistance(data.fermat.minimum) : "—";
    el.distanceGap.textContent = revealMinimum ? formatDistance(gap) : "—";

    if (wide) {
      el.measurementNote.textContent = `The minimum occurs at ${data.fermat.vertex}, the vertex with angle at least 120°.`;
    } else if (state.step >= 5) {
      el.measurementNote.textContent = gap < 0.05
        ? "Your trial point is at the minimum."
        : "The trial total cannot be smaller than the minimum at F.";
    } else {
      el.measurementNote.textContent = "The minimum will be revealed at the final step.";
    }
  }

  function render(options = {}) {
    const data = currentData();
    const isWide = data.fermat.type === "vertex";
    if (isWide && !state.wideMode) {
      stopPlayback(false);
      cancelRotation();
      state.step = 0;
      state.rotationProgress = 0;
    }
    state.wideMode = isWide;

    updateViewBox(data);
    renderTriangle(data);

    if (data.fermat.type === "interior") {
      renderRotation(data);
      renderEqualities(data);
      renderSelectedLine(data);
      renderAllConstructions(data);
      setLayerVisible(el.wideAngleLayer, false);
    } else {
      [el.rotationLayer, el.equalityLayer, el.selectedLineLayer, el.allLinesLayer].forEach((layer) => {
        setLayerVisible(layer, false);
      });
      renderWideAngle(data);
    }

    renderControls(data);
    if (options.announce) el.liveStatus.textContent = options.announce;
  }

  function cancelRotation() {
    if (state.rotationFrame !== null) {
      cancelAnimationFrame(state.rotationFrame);
      state.rotationFrame = null;
    }
  }

  function animateRotation() {
    cancelRotation();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      state.rotationProgress = 1;
      render();
      return;
    }

    state.rotationProgress = 0;
    const startTime = performance.now();
    function frame(now) {
      const linear = G.clamp((now - startTime) / ROTATION_DURATION, 0, 1);
      state.rotationProgress = linear * linear * (3 - 2 * linear);
      render();
      if (linear < 1) {
        state.rotationFrame = requestAnimationFrame(frame);
      } else {
        state.rotationFrame = null;
      }
    }
    state.rotationFrame = requestAnimationFrame(frame);
  }

  function animateDraw(node) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const length = Math.max(1, node.getTotalLength());
    node.style.transition = "none";
    node.style.strokeDasharray = String(length);
    node.style.strokeDashoffset = String(length);
    node.getBoundingClientRect();
    node.style.transition = "stroke-dashoffset 800ms ease";
    requestAnimationFrame(() => {
      node.style.strokeDashoffset = "0";
    });
    window.setTimeout(() => {
      node.style.strokeDasharray = "";
      node.style.strokeDashoffset = "";
      node.style.transition = "";
    }, 900);
  }

  function goToStep(nextStep, options = {}) {
    if (currentData().fermat.type === "vertex") return;
    const previous = state.step;
    if (!options.fromPlayback) stopPlayback(false);
    state.step = G.clamp(Math.round(nextStep), 0, STEP_COUNT - 1);
    cancelRotation();
    state.rotationProgress = state.step >= 2 ? 1 : 0;
    render({ announce: `Step ${state.step + 1}: ${stepCopy(currentData()).title}` });

    if (state.step === 2 && previous < 2) animateRotation();
    if (state.step === 4 && previous < 4) animateDraw(el.selectedConstructionLine);
    if (state.step === 5 && previous < 5) animateDraw(el.optimalStraightPath);
  }

  function stopPlayback(update = true) {
    if (state.playTimer !== null) {
      clearTimeout(state.playTimer);
      state.playTimer = null;
    }
    const wasPlaying = state.playing;
    state.playing = false;
    if (update && wasPlaying) render();
  }

  function scheduleNextStep() {
    state.playTimer = window.setTimeout(() => {
      state.playTimer = null;
      if (!state.playing) return;
      if (state.step >= STEP_COUNT - 1) {
        stopPlayback(true);
        return;
      }
      goToStep(state.step + 1, { fromPlayback: true });
      if (state.step >= STEP_COUNT - 1) stopPlayback(true);
      else scheduleNextStep();
    }, state.step === 2 ? AUTOPLAY_DELAY + 350 : AUTOPLAY_DELAY);
  }

  function playProof() {
    if (currentData().fermat.type === "vertex") return;
    if (state.playing) {
      stopPlayback(true);
      return;
    }
    cancelRotation();
    state.step = 0;
    state.rotationProgress = 0;
    state.playing = true;
    render({ announce: "Playing the Fermat point proof." });
    scheduleNextStep();
  }

  function svgPointFromEvent(event) {
    const point = el.diagram.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(el.diagram.getScreenCTM().inverse());
    return { x: transformed.x, y: transformed.y };
  }

  function setTrialPoint(rawPoint) {
    const vertices = state.vertices;
    const point = G.closestPointInTriangle(rawPoint, vertices.A, vertices.B, vertices.C);
    const weights = G.barycentricCoordinates(point, vertices.A, vertices.B, vertices.C);
    if (weights) state.pWeights = weights;
  }

  function moveVertex(label, rawPoint) {
    const candidate = cloneVertices(state.vertices);
    candidate[label] = clampToModel(rawPoint);
    if (isValidTriangle(candidate)) state.vertices = candidate;
  }

  function beginPointDrag(event) {
    stopPlayback(false);
    cancelRotation();
    state.rotationProgress = state.step >= 2 ? 1 : 0;
    state.dragging = event.currentTarget.dataset.point;
    state.dragMoved = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function movePointDrag(event) {
    if (!state.dragging) return;
    const point = svgPointFromEvent(event);
    state.dragMoved = true;
    if (state.dragging === "P") setTrialPoint(point);
    else moveVertex(state.dragging, point);
    render();
  }

  function endPointDrag(event) {
    if (!state.dragging) return;
    const group = event.currentTarget;
    if (group.hasPointerCapture(event.pointerId)) group.releasePointerCapture(event.pointerId);
    const label = state.dragging;
    state.dragging = null;
    render({ announce: `${label} moved.` });
  }

  function placePFromDiagram(event) {
    if (event.target.closest(".drag-point")) return;
    const point = svgPointFromEvent(event);
    if (!G.pointInTriangle(point, state.vertices.A, state.vertices.B, state.vertices.C)) return;
    stopPlayback(false);
    setTrialPoint(point);
    render({ announce: "Trial point P placed." });
  }

  function handlePointKeyboard(event) {
    const label = event.currentTarget.dataset.point;
    const step = event.shiftKey ? 18 : 5;
    let dx = 0;
    let dy = 0;
    if (event.key === "ArrowLeft") dx = -step;
    else if (event.key === "ArrowRight") dx = step;
    else if (event.key === "ArrowUp") dy = -step;
    else if (event.key === "ArrowDown") dy = step;
    else return;

    event.preventDefault();
    stopPlayback(false);
    if (label === "P") setTrialPoint(G.add(pointP(), { x: dx, y: dy }));
    else moveVertex(label, G.add(state.vertices[label], { x: dx, y: dy }));
    render({ announce: `${label} moved.` });
  }

  function selectRotation(event) {
    stopPlayback(false);
    cancelRotation();
    state.rotationKey = event.currentTarget.dataset.rotation;
    state.step = 1;
    state.rotationProgress = 0;
    const spec = G.ROTATION_SPECS[state.rotationKey];
    render({ announce: `Selected triangle ${spec.moving}${spec.pivot}P about ${spec.pivot}.` });
  }

  function resetAll() {
    stopPlayback(false);
    cancelRotation();
    state.vertices = cloneVertices(defaults.vertices);
    state.pWeights = { ...defaults.pWeights };
    state.rotationKey = defaults.rotationKey;
    state.step = 0;
    state.rotationProgress = 0;
    state.dragging = null;
    state.wideMode = false;
    render({ announce: "The Fermat point lesson was reset." });
  }

  el.pointGroups.forEach((group) => {
    group.addEventListener("pointerdown", beginPointDrag);
    group.addEventListener("pointermove", movePointDrag);
    group.addEventListener("pointerup", endPointDrag);
    group.addEventListener("pointercancel", endPointDrag);
    group.addEventListener("lostpointercapture", () => {
      if (state.dragging === group.dataset.point) {
        state.dragging = null;
        render();
      }
    });
    group.addEventListener("keydown", handlePointKeyboard);
  });

  el.diagram.addEventListener("pointerdown", placePFromDiagram);
  el.rotationChoices.forEach((button) => button.addEventListener("click", selectRotation));
  el.playButton.addEventListener("click", playProof);
  el.backButton.addEventListener("click", () => goToStep(state.step - 1));
  el.nextButton.addEventListener("click", () => goToStep(state.step + 1));
  el.resetButton.addEventListener("click", resetAll);

  window.addEventListener("keydown", (event) => {
    if (event.target.matches("button, [data-point]") || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "ArrowRight") goToStep(state.step + 1);
    else if (event.key === "ArrowLeft") goToStep(state.step - 1);
    else if (event.key === " " && event.target === document.body) {
      event.preventDefault();
      playProof();
    }
  });

  render();
})();
