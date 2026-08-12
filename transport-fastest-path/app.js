(() => {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";
  const MODEL_WIDTH = 16;
  const TOTAL_DEPTH = 16;
  const MIN_LAYERS = 2;
  const MAX_LAYERS = 8;
  const MATCH_TOLERANCE = 1e-8;
  const RACE_DURATION_MS = 5000;

  const plot = {
    x: 52,
    y: 66,
    width: 896,
    height: 896,
    xScale: 56,
    yScale: 56
  };

  const modes = [
    { key: "swimming", label: "Swimming", speed: 2, quip: "Splash!", background: "#c7ebf7", accent: "#238bb5" },
    { key: "walking", label: "Walking", speed: 7, quip: "Nice and steady", background: "#f5e7c8", accent: "#b27a35" },
    { key: "running", label: "Running", speed: 12, quip: "Run like lunch is escaping!", background: "#f8d5c7", accent: "#d36b49" },
    { key: "cycling", label: "Cycling", speed: 17, quip: "Pedal power!", background: "#d5efdf", accent: "#37865b" },
    { key: "horse", label: "Horse riding", speed: 22, quip: "Giddy-up!", background: "#e5dfbd", accent: "#83743a" },
    { key: "motorcycle", label: "Motorcycling", speed: 27, quip: "Vroooom!", background: "#d9dce1", accent: "#5c6875" },
    { key: "formula", label: "Formula 1", speed: 32, quip: "Maximum zoom", background: "#f6d0d0", accent: "#bf3f3f" },
    { key: "cannonball", label: "Human cannonball", speed: 37, quip: "Do not try this at home", background: "#e3d7f3", accent: "#7855a8" }
  ];

  const state = {
    layerCount: 8,
    startX: MODEL_WIDTH * 0.2,
    endX: MODEL_WIDTH * 0.8,
    trialXs: [],
    dragging: null,
    geometry: null,
    raceFrame: null,
    raceRunning: false,
    raceData: null,
    raceAnnouncementMade: false,
    lastRaceMode: -1
  };

  const el = {
    diagram: document.getElementById("diagram"),
    layerGroup: document.getElementById("layerGroup"),
    decorationGroup: document.getElementById("decorationGroup"),
    interfaceGroup: document.getElementById("interfaceGroup"),
    angleGuideGroup: document.getElementById("angleGuideGroup"),
    optimalPath: document.getElementById("optimalPath"),
    trialPath: document.getElementById("trialPath"),
    optimalPointGroup: document.getElementById("optimalPointGroup"),
    trialHandleGroup: document.getElementById("trialHandleGroup"),
    endpointGroup: document.getElementById("endpointGroup"),
    racerLayer: document.getElementById("racerLayer"),
    trialRacer: document.getElementById("trialRacer"),
    optimalRacer: document.getElementById("optimalRacer"),
    trialRacerIcon: document.getElementById("trialRacerIcon"),
    optimalRacerIcon: document.getElementById("optimalRacerIcon"),
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
    raceStatus: document.getElementById("raceStatus"),
    speedList: document.getElementById("speedList")
  };

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  function createSvgElement(name, attributes = {}, text = "") {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    if (text) node.textContent = text;
    return node;
  }

  function toSvgPoint(point) {
    return {
      x: plot.x + point.x * plot.xScale,
      y: plot.y + point.y * plot.yScale
    };
  }

  function activeModes() {
    return modes.slice(0, state.layerCount);
  }

  function straightTrialXs(layerCount = state.layerCount) {
    return Array.from({ length: layerCount - 1 }, (_, index) => {
      return lerp(state.startX, state.endX, (index + 1) / layerCount);
    });
  }

  function trialPoints() {
    const layerDepth = TOTAL_DEPTH / state.layerCount;
    return [
      { x: state.startX, y: 0 },
      ...state.trialXs.map((x, index) => ({ x, y: (index + 1) * layerDepth })),
      { x: state.endX, y: TOTAL_DEPTH }
    ];
  }

  function samplePolylineAtDepth(points, depth) {
    if (depth <= 0) return points[0].x;
    if (depth >= TOTAL_DEPTH) return points.at(-1).x;

    for (let index = 0; index < points.length - 1; index += 1) {
      const start = points[index];
      const end = points[index + 1];
      if (depth >= start.y - 1e-10 && depth <= end.y + 1e-10) {
        return lerp(start.x, end.x, (depth - start.y) / (end.y - start.y));
      }
    }
    return points.at(-1).x;
  }

  function resampleTrial(points, newLayerCount) {
    const layerDepth = TOTAL_DEPTH / newLayerCount;
    return Array.from({ length: newLayerCount - 1 }, (_, index) => {
      return clamp(samplePolylineAtDepth(points, (index + 1) * layerDepth), 0, MODEL_WIDTH);
    });
  }

  function horizontalSpanForInvariant(invariant, slownesses, layerDepth) {
    return slownesses.reduce((total, slowness) => {
      const denominator = Math.sqrt(Math.max(
        slowness * slowness - invariant * invariant,
        Number.EPSILON
      ));
      return total + layerDepth * invariant / denominator;
    }, 0);
  }

  function solveFastestPath(startX, endX, transports) {
    const layerDepth = TOTAL_DEPTH / transports.length;
    const targetSpan = endX - startX;
    const slownesses = transports.map((mode) => 1 / mode.speed);
    const minimumSlowness = Math.min(...slownesses);
    let invariant = 0;

    if (Math.abs(targetSpan) > 1e-12) {
      const limit = minimumSlowness * (1 - 1e-12);
      let lower = -limit;
      let upper = limit;

      for (let iteration = 0; iteration < 100; iteration += 1) {
        const candidate = (lower + upper) / 2;
        const span = horizontalSpanForInvariant(candidate, slownesses, layerDepth);
        if (span < targetSpan) lower = candidate;
        else upper = candidate;
      }
      invariant = (lower + upper) / 2;
    }

    const points = [{ x: startX, y: 0 }];
    let currentX = startX;
    slownesses.forEach((slowness, index) => {
      const denominator = Math.sqrt(Math.max(
        slowness * slowness - invariant * invariant,
        Number.EPSILON
      ));
      currentX += layerDepth * invariant / denominator;
      points.push({
        x: index === slownesses.length - 1 ? endX : currentX,
        y: (index + 1) * layerDepth
      });
    });
    return { points, invariant };
  }

  function pathTiming(points, transports) {
    const segmentTimes = transports.map((mode, index) => {
      const start = points[index];
      const end = points[index + 1];
      return Math.hypot(end.x - start.x, end.y - start.y) / mode.speed;
    });
    return { segmentTimes, total: segmentTimes.reduce((sum, value) => sum + value, 0) };
  }

  function currentGeometry() {
    const transports = activeModes();
    const trial = trialPoints();
    const solution = solveFastestPath(state.startX, state.endX, transports);
    return {
      transports,
      trial,
      optimal: solution.points,
      invariant: solution.invariant,
      trialTiming: pathTiming(trial, transports),
      optimalTiming: pathTiming(solution.points, transports)
    };
  }

  function pathDefinition(points) {
    return points.map((point, index) => {
      const svgPoint = toSvgPoint(point);
      return `${index === 0 ? "M" : "L"} ${svgPoint.x.toFixed(2)} ${svgPoint.y.toFixed(2)}`;
    }).join(" ");
  }

  function appendSceneLine(fragment, attributes, accent) {
    fragment.appendChild(createSvgElement("line", {
      class: "scene-detail",
      stroke: accent,
      ...attributes
    }));
  }

  function renderSceneDetails(fragment, mode, y, height) {
    const left = plot.x;
    const right = plot.x + plot.width;
    const center = y + height / 2;
    const accent = mode.accent;

    if (mode.key === "swimming") {
      for (let offset = 18; offset < height; offset += 28) {
        fragment.appendChild(createSvgElement("path", {
          class: "scene-detail",
          stroke: accent,
          d: `M ${left + 250} ${y + offset} Q ${left + 275} ${y + offset - 8} ${left + 300} ${y + offset} T ${left + 350} ${y + offset}`
        }));
      }
      [0.34, 0.42, 0.5].forEach((fraction, index) => {
        fragment.appendChild(createSvgElement("circle", {
          class: "scene-detail",
          stroke: accent,
          cx: left + plot.width * fraction,
          cy: center + (index - 1) * 14,
          r: 4 + index * 2
        }));
      });
    } else if (mode.key === "walking") {
      appendSceneLine(fragment, { x1: left, y1: y + height - 18, x2: right, y2: y + height - 18 }, accent);
      for (let x = left + 260; x < right - 170; x += 70) {
        appendSceneLine(fragment, { x1: x, y1: y + height - 18, x2: x + 34, y2: y + height - 18 }, accent);
      }
    } else if (mode.key === "running") {
      [0.25, 0.5, 0.75].forEach((fraction) => {
        appendSceneLine(fragment, { x1: left + 220, y1: y + height * fraction, x2: right, y2: y + height * fraction }, accent);
      });
    } else if (mode.key === "cycling") {
      appendSceneLine(fragment, { x1: left + 210, y1: center, x2: right, y2: center, "stroke-dasharray": "16 14" }, accent);
    } else if (mode.key === "horse") {
      appendSceneLine(fragment, { x1: left + 210, y1: y + height - 24, x2: right, y2: y + height - 24 }, accent);
      for (let x = left + 240; x < right; x += 110) {
        appendSceneLine(fragment, { x1: x, y1: y + 18, x2: x, y2: y + height - 10 }, accent);
      }
    } else if (mode.key === "motorcycle") {
      appendSceneLine(fragment, { x1: left + 220, y1: center, x2: right, y2: center, "stroke-dasharray": "28 22" }, accent);
      appendSceneLine(fragment, { x1: left + 220, y1: y + 12, x2: right, y2: y + 12 }, accent);
      appendSceneLine(fragment, { x1: left + 220, y1: y + height - 12, x2: right, y2: y + height - 12 }, accent);
    } else if (mode.key === "formula") {
      const size = Math.min(16, height / 5);
      for (let row = 0; row < 2; row += 1) {
        for (let column = 0; column < 9; column += 1) {
          fragment.appendChild(createSvgElement("rect", {
            class: "scene-solid",
            fill: (row + column) % 2 ? "#ffffff" : accent,
            x: right - 190 + column * size,
            y: y + 10 + row * size,
            width: size,
            height: size
          }));
        }
      }
    } else if (mode.key === "cannonball") {
      for (let index = 0; index < 9; index += 1) {
        const cx = left + 240 + index * 72;
        const cy = y + 20 + (index % 3) * Math.max(18, (height - 40) / 3);
        fragment.appendChild(createSvgElement("path", {
          class: "scene-detail",
          stroke: accent,
          d: `M ${cx - 5} ${cy} H ${cx + 5} M ${cx} ${cy - 5} V ${cy + 5}`
        }));
      }
    }
  }

  function renderLayers(geometry) {
    const layerFragment = document.createDocumentFragment();
    const decorationFragment = document.createDocumentFragment();
    const interfaceFragment = document.createDocumentFragment();
    const layerHeight = plot.height / state.layerCount;

    geometry.transports.forEach((mode, index) => {
      const y = plot.y + index * layerHeight;
      const center = y + layerHeight / 2;
      layerFragment.appendChild(createSvgElement("rect", {
        class: "zone-layer",
        x: plot.x,
        y,
        width: plot.width,
        height: layerHeight + 0.5,
        fill: mode.background
      }));

      layerFragment.appendChild(createSvgElement("text", {
        class: "zone-label",
        x: plot.x + 16,
        y: center - 4
      }, `${index + 1}. ${mode.label}`));
      layerFragment.appendChild(createSvgElement("text", {
        class: "zone-speed",
        x: plot.x + 16,
        y: center + 17
      }, `${mode.speed} m/s`));

      renderSceneDetails(decorationFragment, mode, y, layerHeight);
      const iconWidth = clamp(layerHeight * 0.78, 76, 124);
      const iconHeight = iconWidth * 0.6;
      decorationFragment.appendChild(createSvgElement("use", {
        class: "scene-use",
        href: `#mode-${mode.key}`,
        x: plot.x + plot.width - iconWidth - 17,
        y: center - iconHeight / 2 - 4,
        width: iconWidth,
        height: iconHeight
      }));
      decorationFragment.appendChild(createSvgElement("text", {
        class: "zone-caption",
        x: plot.x + plot.width - 16,
        y: mode.key === "cannonball" ? y + 20 : y + layerHeight - 10
      }, mode.quip));

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
    el.decorationGroup.replaceChildren(decorationFragment);
    el.interfaceGroup.replaceChildren(interfaceFragment);
  }

  function renderOptimalGuides(geometry) {
    const guideFragment = document.createDocumentFragment();
    const pointFragment = document.createDocumentFragment();
    const guideHalfLength = Math.min(34, plot.height / state.layerCount * 0.3);

    geometry.optimal.slice(1, -1).forEach((point) => {
      const svgPoint = toSvgPoint(point);
      guideFragment.appendChild(createSvgElement("line", {
        class: "angle-guide",
        x1: svgPoint.x,
        y1: svgPoint.y - guideHalfLength,
        x2: svgPoint.x,
        y2: svgPoint.y + guideHalfLength
      }));
      pointFragment.appendChild(createSvgElement("circle", {
        class: "optimal-interface-dot",
        cx: svgPoint.x,
        cy: svgPoint.y,
        r: 5
      }));
    });
    el.angleGuideGroup.replaceChildren(guideFragment);
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
      "aria-valuetext": `${x.toFixed(2)} horizontal metres`
    };
    if (index !== null) attributes["data-index"] = index;
    return attributes;
  }

  function renderTrialHandles() {
    const fragment = document.createDocumentFragment();
    const layerDepth = TOTAL_DEPTH / state.layerCount;
    state.trialXs.forEach((x, index) => {
      const point = toSvgPoint({ x, y: (index + 1) * layerDepth });
      const group = createSvgElement("g", draggableAttributes(
        "trial", x, `Trial route point ${index + 1} on boundary ${index + 1}`, index
      ));
      group.appendChild(createSvgElement("circle", { class: "handle-hit", cx: point.x, cy: point.y, r: 24 }));
      group.appendChild(createSvgElement("circle", { class: "trial-handle-ring", cx: point.x, cy: point.y, r: 11 }));
      group.appendChild(createSvgElement("circle", { class: "trial-handle-dot", cx: point.x, cy: point.y, r: 4 }));
      fragment.appendChild(group);
    });
    el.trialHandleGroup.replaceChildren(fragment);
  }

  function endpointGroup(type, x, depth) {
    const point = toSvgPoint({ x, y: depth });
    const group = createSvgElement("g", draggableAttributes(
      type, x, `${type === "A" ? "Starting" : "Finish"} point ${type}`
    ));
    group.appendChild(createSvgElement("circle", { class: "handle-hit", cx: point.x, cy: point.y, r: 26 }));
    group.appendChild(createSvgElement("circle", { class: "endpoint-halo", cx: point.x, cy: point.y, r: 12 }));
    group.appendChild(createSvgElement("circle", { class: "endpoint-dot", cx: point.x, cy: point.y, r: 6 }));
    group.appendChild(createSvgElement("text", {
      class: "endpoint-label",
      x: point.x,
      y: type === "A" ? point.y - 22 : point.y + 38,
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

  function formatSeconds(value) {
    return `${value.toFixed(3)} s`;
  }

  function renderReadouts(geometry) {
    const rawDifference = geometry.trialTiming.total - geometry.optimalTiming.total;
    const difference = Math.abs(rawDifference) < MATCH_TOLERANCE ? 0 : Math.max(0, rawDifference);
    const percentage = difference / geometry.optimalTiming.total * 100;

    el.layerValue.value = String(state.layerCount);
    el.layerValue.textContent = String(state.layerCount);
    el.layerDepth.textContent = `${(TOTAL_DEPTH / state.layerCount).toFixed(2)} m`;
    el.trialTime.textContent = formatSeconds(geometry.trialTiming.total);
    el.optimalTime.textContent = formatSeconds(geometry.optimalTiming.total);
    el.differenceTime.textContent = formatSeconds(difference);
    el.percentageSlower.textContent = `${percentage.toFixed(1)}%`;

    if (difference === 0) {
      el.comparisonMessage.textContent = "Bullseye! Your orange route matches the fastest route.";
      el.comparisonMessage.classList.add("is-match");
    } else {
      el.comparisonMessage.textContent = "Nudge the orange points toward blue—save the sideways distance for faster zones.";
      el.comparisonMessage.classList.remove("is-match");
    }
  }

  function renderSpeedList() {
    const fragment = document.createDocumentFragment();
    modes.forEach((mode, index) => {
      const item = document.createElement("li");
      item.className = `speed-item${index >= state.layerCount ? " is-inactive" : ""}`;
      const icon = createSvgElement("svg", { class: "speed-mini-icon", viewBox: "0 0 100 60", "aria-hidden": "true" });
      icon.appendChild(createSvgElement("use", { href: `#mode-${mode.key}`, width: 100, height: 60 }));
      const text = document.createElement("span");
      const strong = document.createElement("strong");
      strong.textContent = mode.label;
      text.append(strong, `${mode.speed} m/s`);
      item.append(icon, text);
      fragment.appendChild(item);
    });
    el.speedList.replaceChildren(fragment);
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
    renderSpeedList();

    if (focusTarget) {
      const indexSelector = focusTarget.index === null ? "" : `[data-index="${focusTarget.index}"]`;
      el.diagram.querySelector(`[data-drag-type="${focusTarget.type}"]${indexSelector}`)
        ?.focus({ preventScroll: true });
    }
  }

  function eventToLogicalX(event) {
    const point = el.diagram.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const local = point.matrixTransform(el.diagram.getScreenCTM().inverse());
    return clamp((local.x - plot.x) / plot.xScale, 0, MODEL_WIDTH);
  }

  function setDragValue(type, index, x) {
    const value = clamp(x, 0, MODEL_WIDTH);
    if (type === "A") state.startX = value;
    else if (type === "B") state.endX = value;
    else if (type === "trial" && Number.isInteger(index)) state.trialXs[index] = value;
  }

  function defaultRaceMessage() {
    return "Press Start the chaos to race both travelers through every active zone.";
  }

  function setRaceButtonLabel(label) {
    el.raceButton.textContent = label;
  }

  function cancelRace(resetMessage = true) {
    if (state.raceFrame !== null) cancelAnimationFrame(state.raceFrame);
    state.raceFrame = null;
    state.raceRunning = false;
    state.raceData = null;
    state.raceAnnouncementMade = false;
    state.lastRaceMode = -1;
    el.racerLayer.classList.add("is-hidden");
    setRaceButtonLabel("▶ Start the chaos");
    if (resetMessage) el.raceStatus.textContent = defaultRaceMessage();
  }

  function positionAtTravelTime(points, timing, elapsedTime) {
    if (elapsedTime <= 0) return { point: points[0], segmentIndex: 0 };
    if (elapsedTime >= timing.total) return { point: points.at(-1), segmentIndex: timing.segmentTimes.length - 1 };
    let cumulative = 0;
    for (let index = 0; index < timing.segmentTimes.length; index += 1) {
      const segmentTime = timing.segmentTimes[index];
      if (elapsedTime <= cumulative + segmentTime) {
        const fraction = (elapsedTime - cumulative) / segmentTime;
        return {
          point: {
            x: lerp(points[index].x, points[index + 1].x, fraction),
            y: lerp(points[index].y, points[index + 1].y, fraction)
          },
          segmentIndex: index
        };
      }
      cumulative += segmentTime;
    }
    return { point: points.at(-1), segmentIndex: timing.segmentTimes.length - 1 };
  }

  function setRacerPosition(group, icon, result) {
    const point = toSvgPoint(result.point);
    group.setAttribute("transform", `translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`);
    icon.setAttribute("href", `#mode-${modes[result.segmentIndex].key}`);
  }

  function updateRaceRacers(simulationTime, data) {
    const trialResult = positionAtTravelTime(data.trial, data.trialTiming, simulationTime);
    const optimalResult = positionAtTravelTime(data.optimal, data.optimalTiming, simulationTime);
    setRacerPosition(el.trialRacer, el.trialRacerIcon, trialResult);
    setRacerPosition(el.optimalRacer, el.optimalRacerIcon, optimalResult);
    return optimalResult.segmentIndex;
  }

  function raceOutcome(data, reducedMotion = false) {
    const difference = data.trialTiming.total - data.optimalTiming.total;
    if (Math.abs(difference) < MATCH_TOLERANCE) {
      return reducedMotion
        ? "Animation skipped because reduced motion is enabled. It is a perfect tie!"
        : "Photo finish! Both travelers arrive together.";
    }
    const outcome = `Blue arrives ${difference.toFixed(3)} seconds sooner. Fast and delightfully ridiculous!`;
    return reducedMotion ? `Animation skipped because reduced motion is enabled. ${outcome}` : outcome;
  }

  function finishRace(data, reducedMotion = false) {
    updateRaceRacers(data.maxTime, data);
    state.raceRunning = false;
    state.raceFrame = null;
    el.raceStatus.textContent = raceOutcome(data, reducedMotion);
    setRaceButtonLabel("↻ Race again");
  }

  function raceFrame(timestamp) {
    const data = state.raceData;
    if (!state.raceRunning || !data) return;
    const fraction = clamp((timestamp - data.startTimestamp) / RACE_DURATION_MS, 0, 1);
    const simulationTime = fraction * data.maxTime;
    const currentMode = updateRaceRacers(simulationTime, data);

    if (currentMode !== state.lastRaceMode && !state.raceAnnouncementMade) {
      state.lastRaceMode = currentMode;
      el.raceStatus.textContent = `${modes[currentMode].quip} Blue switches to ${modes[currentMode].label.toLowerCase()} at ${modes[currentMode].speed} m/s.`;
    }
    if (
      !state.raceAnnouncementMade
      && data.trialTiming.total - data.optimalTiming.total >= MATCH_TOLERANCE
      && simulationTime >= data.optimalTiming.total
      && simulationTime < data.trialTiming.total
    ) {
      el.raceStatus.textContent = "Blue has arrived! Orange is still having an adventure.";
      state.raceAnnouncementMade = true;
    }

    if (fraction < 1) state.raceFrame = requestAnimationFrame(raceFrame);
    else finishRace(data);
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
    state.lastRaceMode = 0;
    el.racerLayer.classList.remove("is-hidden");
    updateRaceRacers(0, data);

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishRace(data, true);
      return;
    }
    state.raceRunning = true;
    el.raceStatus.textContent = `Splash! Both racers begin at ${modes[0].speed} m/s.`;
    setRaceButtonLabel("↻ Restart race");
    state.raceFrame = requestAnimationFrame(raceFrame);
  }

  function handlePointerDown(event) {
    const handle = event.target.closest?.("[data-drag-type]");
    if (!handle || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    cancelRace();
    state.dragging = {
      pointerId: event.pointerId,
      type: handle.dataset.dragType,
      index: handle.dataset.index === undefined ? null : Number(handle.dataset.index)
    };
    el.diagram.setPointerCapture(event.pointerId);
    setDragValue(state.dragging.type, state.dragging.index, eventToLogicalX(event));
    render();
  }

  function handlePointerMove(event) {
    if (!state.dragging || state.dragging.pointerId !== event.pointerId) return;
    event.preventDefault();
    setDragValue(state.dragging.type, state.dragging.index, eventToLogicalX(event));
    render();
  }

  function handlePointerEnd(event) {
    if (!state.dragging || state.dragging.pointerId !== event.pointerId) return;
    if (el.diagram.hasPointerCapture(event.pointerId)) el.diagram.releasePointerCapture(event.pointerId);
    state.dragging = null;
  }

  function handleKeyboard(event) {
    const handle = event.target.closest?.("[data-drag-type]");
    if (!handle || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    cancelRace();
    const type = handle.dataset.dragType;
    const index = handle.dataset.index === undefined ? null : Number(handle.dataset.index);
    const currentX = type === "A" ? state.startX : type === "B" ? state.endX : state.trialXs[index];
    const step = event.shiftKey ? 0.5 : 0.1;
    let nextX = currentX;
    if (event.key === "ArrowLeft") nextX -= step;
    else if (event.key === "ArrowRight") nextX += step;
    else if (event.key === "Home") nextX = 0;
    else if (event.key === "End") nextX = MODEL_WIDTH;
    setDragValue(type, index, nextX);
    render({ type, index });
  }

  function changeLayerCount(value) {
    const count = clamp(Math.round(value), MIN_LAYERS, MAX_LAYERS);
    if (count === state.layerCount) return;
    cancelRace();
    const oldTrial = trialPoints();
    state.layerCount = count;
    state.trialXs = resampleTrial(oldTrial, count);
    render();
  }

  function resetRoute() {
    cancelRace();
    state.trialXs = straightTrialXs();
    render();
  }

  el.layerSlider.addEventListener("input", (event) => changeLayerCount(Number(event.target.value)));
  el.raceButton.addEventListener("click", startRace);
  el.resetButton.addEventListener("click", resetRoute);
  el.diagram.addEventListener("pointerdown", handlePointerDown);
  el.diagram.addEventListener("pointermove", handlePointerMove);
  el.diagram.addEventListener("pointerup", handlePointerEnd);
  el.diagram.addEventListener("pointercancel", handlePointerEnd);
  el.diagram.addEventListener("keydown", handleKeyboard);

  state.trialXs = straightTrialXs();
  render();
})();
