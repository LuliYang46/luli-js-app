(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const MODEL_WIDTH = 16;
  const TOTAL_DEPTH = 8;
  const MIN_LAYERS = 2;
  const MAX_LAYERS = 8;
  const MATCH_TOLERANCE = 1e-7;
  const RACE_DURATION_MS = 5000;

  const plot = {
    x: 48,
    y: 58,
    width: 1024,
    height: 512,
    xScale: 64,
    yScale: 64
  };

  const defaults = {
    layerCount: 4,
    startX: MODEL_WIDTH * 0.2,
    endX: MODEL_WIDTH * 0.8
  };

  const state = {
    layerCount: defaults.layerCount,
    startX: defaults.startX,
    endX: defaults.endX,
    trialXs: [],
    dragging: null,
    raceFrame: null,
    raceRunning: false,
    raceData: null,
    raceAnnouncementMade: false,
    geometry: null
  };

  const el = {
    diagram: document.getElementById("diagram"),
    layerGroup: document.getElementById("layerGroup"),
    interfaceGroup: document.getElementById("interfaceGroup"),
    normalGroup: document.getElementById("normalGroup"),
    optimalPath: document.getElementById("optimalPath"),
    trialPath: document.getElementById("trialPath"),
    optimalPointGroup: document.getElementById("optimalPointGroup"),
    trialHandleGroup: document.getElementById("trialHandleGroup"),
    endpointGroup: document.getElementById("endpointGroup"),
    pulseLayer: document.getElementById("pulseLayer"),
    trialPulse: document.getElementById("trialPulse"),
    optimalPulseHalo: document.getElementById("optimalPulseHalo"),
    optimalPulse: document.getElementById("optimalPulse"),
    layerSlider: document.getElementById("layerSlider"),
    layerValue: document.getElementById("layerValue"),
    layerDepth: document.getElementById("layerDepth"),
    raceButton: document.getElementById("raceButton"),
    resetButton: document.getElementById("resetButton"),
    trialTime: document.getElementById("trialTime"),
    optimalTime: document.getElementById("optimalTime"),
    differenceTime: document.getElementById("differenceTime"),
    percentageSlower: document.getElementById("percentageSlower"),
    comparisonMessage: document.getElementById("comparisonMessage"),
    raceStatus: document.getElementById("raceStatus")
  };

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  function createSvgElement(name, attributes = {}, text = "") {
    const node = document.createElementNS(SVG_NS, name);

    Object.entries(attributes).forEach(([key, value]) => {
      node.setAttribute(key, String(value));
    });

    if (text) {
      node.textContent = text;
    }

    return node;
  }

  function toSvgPoint(point) {
    return {
      x: plot.x + point.x * plot.xScale,
      y: plot.y + point.y * plot.yScale
    };
  }

  function refractiveIndices(layerCount) {
    return Array.from({ length: layerCount }, (_, index) => 5 - 0.5 * index);
  }

  function straightTrialXs(layerCount = state.layerCount) {
    return Array.from({ length: layerCount - 1 }, (_, index) => {
      const fraction = (index + 1) / layerCount;
      return lerp(state.startX, state.endX, fraction);
    });
  }

  function trialPoints() {
    const layerDepth = TOTAL_DEPTH / state.layerCount;
    const points = [{ x: state.startX, y: 0 }];

    state.trialXs.forEach((x, index) => {
      points.push({ x, y: (index + 1) * layerDepth });
    });

    points.push({ x: state.endX, y: TOTAL_DEPTH });
    return points;
  }

  function samplePolylineAtDepth(points, depth) {
    if (depth <= 0) {
      return points[0].x;
    }

    if (depth >= TOTAL_DEPTH) {
      return points[points.length - 1].x;
    }

    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];

      if (depth >= start.y - 1e-10 && depth <= end.y + 1e-10) {
        const fraction = (depth - start.y) / (end.y - start.y);
        return lerp(start.x, end.x, fraction);
      }
    }

    return points[points.length - 1].x;
  }

  function resampleTrial(points, newLayerCount) {
    const layerDepth = TOTAL_DEPTH / newLayerCount;

    return Array.from({ length: newLayerCount - 1 }, (_, index) => {
      return clamp(
        samplePolylineAtDepth(points, (index + 1) * layerDepth),
        0,
        MODEL_WIDTH
      );
    });
  }

  function horizontalSpanForInvariant(invariant, indices, layerDepth) {
    return indices.reduce((total, refractiveIndex) => {
      const denominator = Math.sqrt(Math.max(
        refractiveIndex * refractiveIndex - invariant * invariant,
        Number.EPSILON
      ));
      return total + layerDepth * invariant / denominator;
    }, 0);
  }

  function solveFastestPath(startX, endX, indices) {
    const layerDepth = TOTAL_DEPTH / indices.length;
    const targetSpan = endX - startX;
    const minimumIndex = Math.min(...indices);
    let invariant = 0;

    if (Math.abs(targetSpan) > 1e-12) {
      const limit = minimumIndex * (1 - 1e-12);
      let lower = -limit;
      let upper = limit;

      for (let iteration = 0; iteration < 100; iteration += 1) {
        const candidate = (lower + upper) / 2;
        const candidateSpan = horizontalSpanForInvariant(candidate, indices, layerDepth);

        if (candidateSpan < targetSpan) {
          lower = candidate;
        } else {
          upper = candidate;
        }
      }

      invariant = (lower + upper) / 2;
    }

    const points = [{ x: startX, y: 0 }];
    let currentX = startX;

    indices.forEach((refractiveIndex, index) => {
      const denominator = Math.sqrt(Math.max(
        refractiveIndex * refractiveIndex - invariant * invariant,
        Number.EPSILON
      ));
      currentX += layerDepth * invariant / denominator;

      points.push({
        x: index === indices.length - 1 ? endX : currentX,
        y: (index + 1) * layerDepth
      });
    });

    return { points, invariant };
  }

  function pathTiming(points, indices) {
    const segmentTimes = indices.map((refractiveIndex, index) => {
      const start = points[index];
      const end = points[index + 1];
      return refractiveIndex * Math.hypot(end.x - start.x, end.y - start.y);
    });

    return {
      segmentTimes,
      total: segmentTimes.reduce((sum, time) => sum + time, 0)
    };
  }

  function currentGeometry() {
    const indices = refractiveIndices(state.layerCount);
    const trial = trialPoints();
    const optimalSolution = solveFastestPath(state.startX, state.endX, indices);
    const trialTiming = pathTiming(trial, indices);
    const optimalTiming = pathTiming(optimalSolution.points, indices);

    return {
      indices,
      trial,
      optimal: optimalSolution.points,
      invariant: optimalSolution.invariant,
      trialTiming,
      optimalTiming
    };
  }

  function pathDefinition(points) {
    return points.map((point, index) => {
      const svgPoint = toSvgPoint(point);
      return `${index === 0 ? "M" : "L"} ${svgPoint.x.toFixed(2)} ${svgPoint.y.toFixed(2)}`;
    }).join(" ");
  }

  function layerColor(refractiveIndex) {
    const amount = clamp((5 - refractiveIndex) / 3.5, 0, 1);
    const hue = lerp(204, 178, amount);
    const saturation = lerp(66, 52, amount);
    const lightness = lerp(82, 90, amount);
    return `hsl(${hue.toFixed(0)} ${saturation.toFixed(0)}% ${lightness.toFixed(0)}%)`;
  }

  function renderLayers(geometry) {
    const layerFragment = document.createDocumentFragment();
    const interfaceFragment = document.createDocumentFragment();
    const layerPixelHeight = plot.height / state.layerCount;

    geometry.indices.forEach((refractiveIndex, index) => {
      const y = plot.y + index * layerPixelHeight;
      const centerY = y + layerPixelHeight / 2;

      layerFragment.appendChild(createSvgElement("rect", {
        class: "medium-layer",
        x: plot.x,
        y,
        width: plot.width,
        height: layerPixelHeight + 0.5,
        fill: layerColor(refractiveIndex)
      }));

      layerFragment.appendChild(createSvgElement("text", {
        class: "layer-label",
        x: plot.x + 17,
        y: centerY - 3
      }, `n = ${refractiveIndex.toFixed(1)}`));

      layerFragment.appendChild(createSvgElement("text", {
        class: "layer-speed",
        x: plot.x + 17,
        y: centerY + 17
      }, `speed = c / ${refractiveIndex.toFixed(1)}`));

      if (index > 0) {
        interfaceFragment.appendChild(createSvgElement("line", {
          class: "interface-line",
          x1: plot.x,
          y1: y,
          x2: plot.x + plot.width,
          y2: y
        }));
      }
    });

    el.layerGroup.replaceChildren(layerFragment);
    el.interfaceGroup.replaceChildren(interfaceFragment);
  }

  function renderOptimalGuides(geometry) {
    const normalFragment = document.createDocumentFragment();
    const pointFragment = document.createDocumentFragment();
    const normalHalfLength = Math.min(35, plot.height / state.layerCount * 0.33);

    geometry.optimal.slice(1, -1).forEach((point) => {
      const svgPoint = toSvgPoint(point);

      normalFragment.appendChild(createSvgElement("line", {
        class: "normal-line",
        x1: svgPoint.x,
        y1: svgPoint.y - normalHalfLength,
        x2: svgPoint.x,
        y2: svgPoint.y + normalHalfLength
      }));

      pointFragment.appendChild(createSvgElement("circle", {
        class: "optimal-interface-dot",
        cx: svgPoint.x,
        cy: svgPoint.y,
        r: 5
      }));
    });

    el.normalGroup.replaceChildren(normalFragment);
    el.optimalPointGroup.replaceChildren(pointFragment);
  }

  function draggableAttributes(type, x, label, index = null) {
    const attributes = {
      class: `drag-handle ${type === "trial" ? "trial-handle" : `endpoint-${type.toLowerCase()}`}`,
      "data-drag-type": type,
      tabindex: 0,
      role: "slider",
      "aria-label": label,
      "aria-orientation": "horizontal",
      "aria-valuemin": 0,
      "aria-valuemax": MODEL_WIDTH,
      "aria-valuenow": x.toFixed(2),
      "aria-valuetext": `${x.toFixed(2)} horizontal units`
    };

    if (index !== null) {
      attributes["data-index"] = index;
    }

    return attributes;
  }

  function renderTrialHandles() {
    const fragment = document.createDocumentFragment();
    const layerDepth = TOTAL_DEPTH / state.layerCount;

    state.trialXs.forEach((x, index) => {
      const point = toSvgPoint({ x, y: (index + 1) * layerDepth });
      const group = createSvgElement("g", draggableAttributes(
        "trial",
        x,
        `Trial path point ${index + 1} on interface ${index + 1}`,
        index
      ));

      group.appendChild(createSvgElement("circle", {
        class: "handle-hit",
        cx: point.x,
        cy: point.y,
        r: 24
      }));
      group.appendChild(createSvgElement("circle", {
        class: "trial-handle-ring",
        cx: point.x,
        cy: point.y,
        r: 11
      }));
      group.appendChild(createSvgElement("circle", {
        class: "trial-handle-dot",
        cx: point.x,
        cy: point.y,
        r: 4
      }));
      fragment.appendChild(group);
    });

    el.trialHandleGroup.replaceChildren(fragment);
  }

  function endpointGroup(type, x, depth) {
    const point = toSvgPoint({ x, y: depth });
    const group = createSvgElement("g", draggableAttributes(
      type,
      x,
      `${type === "A" ? "Starting" : "Destination"} point ${type}`
    ));

    group.appendChild(createSvgElement("circle", {
      class: "handle-hit",
      cx: point.x,
      cy: point.y,
      r: 26
    }));
    group.appendChild(createSvgElement("circle", {
      class: "endpoint-halo",
      cx: point.x,
      cy: point.y,
      r: 12
    }));
    group.appendChild(createSvgElement("circle", {
      class: "endpoint-dot",
      cx: point.x,
      cy: point.y,
      r: 6
    }));
    group.appendChild(createSvgElement("text", {
      class: "endpoint-label",
      x: point.x,
      y: type === "A" ? point.y - 22 : point.y + 37,
      "text-anchor": "middle"
    }, type));

    return group;
  }

  function renderEndpoints() {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(endpointGroup("A", state.startX, 0));
    fragment.appendChild(endpointGroup("B", state.endX, TOTAL_DEPTH));
    el.endpointGroup.replaceChildren(fragment);
  }

  function formatTime(value) {
    return value.toFixed(3);
  }

  function renderReadouts(geometry) {
    const rawDifference = geometry.trialTiming.total - geometry.optimalTiming.total;
    const difference = Math.abs(rawDifference) < MATCH_TOLERANCE ? 0 : Math.max(0, rawDifference);
    const percentage = geometry.optimalTiming.total > 0
      ? difference / geometry.optimalTiming.total * 100
      : 0;

    el.layerValue.value = String(state.layerCount);
    el.layerValue.textContent = String(state.layerCount);
    el.layerDepth.textContent = `${(TOTAL_DEPTH / state.layerCount).toFixed(2)} units`;
    el.trialTime.textContent = formatTime(geometry.trialTiming.total);
    el.optimalTime.textContent = formatTime(geometry.optimalTiming.total);
    el.differenceTime.textContent = formatTime(difference);
    el.percentageSlower.textContent = `${percentage.toFixed(1)}%`;

    if (difference === 0) {
      el.comparisonMessage.textContent = "Your orange path matches the fastest path.";
      el.comparisonMessage.classList.add("is-match");
    } else {
      el.comparisonMessage.textContent = "Move the orange points toward the blue path to reduce the travel time.";
      el.comparisonMessage.classList.remove("is-match");
    }
  }

  function render(focusTarget = null) {
    const geometry = currentGeometry();
    state.geometry = geometry;

    renderLayers(geometry);
    renderOptimalGuides(geometry);
    el.optimalPath.setAttribute("d", pathDefinition(geometry.optimal));
    el.trialPath.setAttribute("d", pathDefinition(geometry.trial));
    renderTrialHandles();
    renderEndpoints();
    renderReadouts(geometry);

    if (focusTarget) {
      const indexSelector = focusTarget.index === null
        ? ""
        : `[data-index="${focusTarget.index}"]`;
      const target = el.diagram.querySelector(
        `[data-drag-type="${focusTarget.type}"]${indexSelector}`
      );
      target?.focus({ preventScroll: true });
    }
  }

  function eventToLogicalX(event) {
    const point = el.diagram.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const localPoint = point.matrixTransform(el.diagram.getScreenCTM().inverse());
    return clamp((localPoint.x - plot.x) / plot.xScale, 0, MODEL_WIDTH);
  }

  function setDragValue(type, index, x) {
    const value = clamp(x, 0, MODEL_WIDTH);

    if (type === "A") {
      state.startX = value;
    } else if (type === "B") {
      state.endX = value;
    } else if (type === "trial" && Number.isInteger(index)) {
      state.trialXs[index] = value;
    }
  }

  function defaultRaceMessage() {
    return "Press Race to watch both pulses move at the local speed of each layer.";
  }

  function setRaceButtonLabel(label) {
    el.raceButton.textContent = label;
  }

  function cancelRace(resetMessage = true) {
    if (state.raceFrame !== null) {
      cancelAnimationFrame(state.raceFrame);
    }

    state.raceFrame = null;
    state.raceRunning = false;
    state.raceData = null;
    state.raceAnnouncementMade = false;
    el.pulseLayer.classList.add("is-hidden");
    setRaceButtonLabel("▶ Race the paths");

    if (resetMessage) {
      el.raceStatus.textContent = defaultRaceMessage();
    }
  }

  function pointAtTravelTime(points, timing, elapsedTime) {
    if (elapsedTime <= 0) {
      return points[0];
    }

    if (elapsedTime >= timing.total) {
      return points[points.length - 1];
    }

    let cumulativeTime = 0;

    for (let index = 0; index < timing.segmentTimes.length; index += 1) {
      const segmentTime = timing.segmentTimes[index];

      if (elapsedTime <= cumulativeTime + segmentTime) {
        const fraction = (elapsedTime - cumulativeTime) / segmentTime;
        return {
          x: lerp(points[index].x, points[index + 1].x, fraction),
          y: lerp(points[index].y, points[index + 1].y, fraction)
        };
      }

      cumulativeTime += segmentTime;
    }

    return points[points.length - 1];
  }

  function setPulsePosition(nodes, point) {
    const svgPoint = toSvgPoint(point);
    nodes.forEach((node) => {
      node.setAttribute("cx", svgPoint.x.toFixed(2));
      node.setAttribute("cy", svgPoint.y.toFixed(2));
    });
  }

  function updateRacePulses(simulationTime, data) {
    const trialPoint = pointAtTravelTime(data.trial, data.trialTiming, simulationTime);
    const optimalPoint = pointAtTravelTime(data.optimal, data.optimalTiming, simulationTime);

    setPulsePosition([el.trialPulse], trialPoint);
    setPulsePosition([el.optimalPulseHalo, el.optimalPulse], optimalPoint);
  }

  function raceOutcome(data, reducedMotion = false) {
    const difference = data.trialTiming.total - data.optimalTiming.total;

    if (Math.abs(difference) < MATCH_TOLERANCE) {
      return reducedMotion
        ? "Animation skipped because reduced motion is enabled. The two paths tie."
        : "The two pulses arrive together: your trial matches the fastest path.";
    }

    const outcome = `The blue path arrives ${formatTime(difference)} relative time units sooner.`;
    return reducedMotion
      ? `Animation skipped because reduced motion is enabled. ${outcome}`
      : outcome;
  }

  function finishRace(data, reducedMotion = false) {
    updateRacePulses(data.maxTime, data);
    state.raceRunning = false;
    state.raceFrame = null;
    el.raceStatus.textContent = raceOutcome(data, reducedMotion);
    setRaceButtonLabel("↻ Race again");
  }

  function raceFrame(timestamp) {
    const data = state.raceData;

    if (!state.raceRunning || !data) {
      return;
    }

    const elapsed = timestamp - data.startTimestamp;
    const fraction = clamp(elapsed / RACE_DURATION_MS, 0, 1);
    const simulationTime = fraction * data.maxTime;
    updateRacePulses(simulationTime, data);

    if (
      !state.raceAnnouncementMade
      && data.trialTiming.total - data.optimalTiming.total >= MATCH_TOLERANCE
      && simulationTime >= data.optimalTiming.total
      && simulationTime < data.trialTiming.total
    ) {
      el.raceStatus.textContent = "The blue pulse has arrived; the orange pulse is still traveling.";
      state.raceAnnouncementMade = true;
    }

    if (fraction < 1) {
      state.raceFrame = requestAnimationFrame(raceFrame);
    } else {
      finishRace(data);
    }
  }

  function startRace() {
    cancelRace(false);
    const geometry = currentGeometry();
    const data = {
      ...geometry,
      maxTime: Math.max(geometry.trialTiming.total, geometry.optimalTiming.total),
      startTimestamp: performance.now()
    };

    state.raceData = data;
    el.pulseLayer.classList.remove("is-hidden");
    updateRacePulses(0, data);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishRace(data, true);
      return;
    }

    state.raceRunning = true;
    state.raceAnnouncementMade = false;
    el.raceStatus.textContent = "Both pulses start together. Their speed changes as they enter each layer.";
    setRaceButtonLabel("↻ Restart race");
    state.raceFrame = requestAnimationFrame(raceFrame);
  }

  function handlePointerDown(event) {
    const handle = event.target.closest?.("[data-drag-type]");

    if (!handle || (event.pointerType === "mouse" && event.button !== 0)) {
      return;
    }

    event.preventDefault();
    cancelRace();
    const indexValue = handle.dataset.index;
    state.dragging = {
      pointerId: event.pointerId,
      type: handle.dataset.dragType,
      index: indexValue === undefined ? null : Number(indexValue)
    };
    el.diagram.setPointerCapture(event.pointerId);
    setDragValue(state.dragging.type, state.dragging.index, eventToLogicalX(event));
    render();
  }

  function handlePointerMove(event) {
    if (!state.dragging || state.dragging.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    setDragValue(state.dragging.type, state.dragging.index, eventToLogicalX(event));
    render();
  }

  function handlePointerEnd(event) {
    if (!state.dragging || state.dragging.pointerId !== event.pointerId) {
      return;
    }

    if (el.diagram.hasPointerCapture(event.pointerId)) {
      el.diagram.releasePointerCapture(event.pointerId);
    }
    state.dragging = null;
  }

  function handleKeyboard(event) {
    const handle = event.target.closest?.("[data-drag-type]");
    const handledKeys = ["ArrowLeft", "ArrowRight", "Home", "End"];

    if (!handle || !handledKeys.includes(event.key)) {
      return;
    }

    event.preventDefault();
    cancelRace();
    const type = handle.dataset.dragType;
    const index = handle.dataset.index === undefined ? null : Number(handle.dataset.index);
    const currentX = type === "A"
      ? state.startX
      : type === "B"
        ? state.endX
        : state.trialXs[index];
    const step = event.shiftKey ? 0.5 : 0.1;
    let nextX = currentX;

    if (event.key === "ArrowLeft") {
      nextX -= step;
    } else if (event.key === "ArrowRight") {
      nextX += step;
    } else if (event.key === "Home") {
      nextX = 0;
    } else if (event.key === "End") {
      nextX = MODEL_WIDTH;
    }

    setDragValue(type, index, nextX);
    render({ type, index });
  }

  function changeLayerCount(newLayerCount) {
    const count = clamp(Math.round(newLayerCount), MIN_LAYERS, MAX_LAYERS);

    if (count === state.layerCount) {
      return;
    }

    cancelRace();
    const oldTrial = trialPoints();
    state.layerCount = count;
    state.trialXs = resampleTrial(oldTrial, count);
    render();
  }

  function resetTrial() {
    cancelRace();
    state.trialXs = straightTrialXs();
    render();
  }

  el.layerSlider.addEventListener("input", (event) => {
    changeLayerCount(Number(event.target.value));
  });
  el.raceButton.addEventListener("click", startRace);
  el.resetButton.addEventListener("click", resetTrial);
  el.diagram.addEventListener("pointerdown", handlePointerDown);
  el.diagram.addEventListener("pointermove", handlePointerMove);
  el.diagram.addEventListener("pointerup", handlePointerEnd);
  el.diagram.addEventListener("pointercancel", handlePointerEnd);
  el.diagram.addEventListener("keydown", handleKeyboard);

  state.trialXs = straightTrialXs();
  render();
})();
