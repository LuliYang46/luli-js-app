(() => {
  "use strict";

  const G = window.RelativityGeometry;
  const SVG_NS = "http://www.w3.org/2000/svg";
  const PERSPECTIVE_DURATION = 1400;
  const GRID_TRANSITION_DURATION = 1400;
  const SIMULTANEITY_TOLERANCE = 0.01;
  const MIN_VIEW_HALF = 8;
  const MIN_ZOOM_HALF = 0.25;
  const MAX_ZOOM_HALF = 1_000_000;
  const BUTTON_ZOOM_FACTOR = 0.72;
  const BETA_LIMIT = 0.95;
  const PLOT = Object.freeze({ left: 50, top: 50, size: 800, centerX: 450, centerY: 450 });

  const defaults = Object.freeze({
    beta: 0.6,
    events: Object.freeze({
      A: Object.freeze({ x: 3, ct: 5 }),
      B: Object.freeze({ x: -3, ct: 5 })
    }),
    activeEvent: "A",
    coordinateFrame: "earth",
    perspective: "earth"
  });

  const state = {
    beta: defaults.beta,
    events: cloneEvents(defaults.events),
    activeEvent: defaults.activeEvent,
    coordinateFrame: defaults.coordinateFrame,
    perspective: defaults.perspective,
    currentViewRapidity: 0,
    currentGridRapidity: 0,
    viewCenterEarth: { x: 0, ct: 0 },
    viewHalf: MIN_VIEW_HALF,
    perspectiveFrame: null,
    gridFrame: null,
    draggingPointer: null,
    draggingEvent: null,
    zoomAnnouncementTimer: null
  };

  const el = {
    diagram: document.getElementById("diagram"),
    gridLayer: document.getElementById("gridLayer"),
    lightLayer: document.getElementById("lightLayer"),
    simultaneityLayer: document.getElementById("simultaneityLayer"),
    guideLayer: document.getElementById("guideLayer"),
    axisLayer: document.getElementById("axisLayer"),
    tickLayer: document.getElementById("tickLayer"),
    eventHandles: Array.from(document.querySelectorAll("[data-event]")),
    viewBadge: document.getElementById("viewBadge"),
    headerBeta: document.getElementById("headerBeta"),
    headerGamma: document.getElementById("headerGamma"),
    speedSlider: document.getElementById("speedSlider"),
    speedInput: document.getElementById("speedInput"),
    speedOutput: document.getElementById("speedOutput"),
    gammaOutput: document.getElementById("gammaOutput"),
    frameButtons: Array.from(document.querySelectorAll("[data-frame]")),
    perspectiveButtons: Array.from(document.querySelectorAll("[data-perspective]")),
    eventSelectButtons: Array.from(document.querySelectorAll("[data-event-select]")),
    eventFrameLabel: document.getElementById("eventFrameLabel"),
    activeEventChip: document.getElementById("activeEventChip"),
    eventXLabel: document.getElementById("eventXLabel"),
    eventTLabel: document.getElementById("eventTLabel"),
    eventXInput: document.getElementById("eventXInput"),
    eventTInput: document.getElementById("eventTInput"),
    intervalOutput: document.getElementById("intervalOutput"),
    viewRangeBadge: document.getElementById("viewRangeBadge"),
    zoomOutButton: document.getElementById("zoomOutButton"),
    fitViewButton: document.getElementById("fitViewButton"),
    zoomInButton: document.getElementById("zoomInButton"),
    simultaneityCard: document.getElementById("simultaneityCard"),
    simultaneityIcon: document.getElementById("simultaneityIcon"),
    simultaneityFrame: document.getElementById("simultaneityFrame"),
    simultaneityTitle: document.getElementById("simultaneityTitle"),
    simultaneityDetail: document.getElementById("simultaneityDetail"),
    timeDifferenceOutput: document.getElementById("timeDifferenceOutput"),
    resetButton: document.getElementById("resetButton"),
    liveStatus: document.getElementById("liveStatus")
  };

  function cloneEvents(events) {
    return {
      A: { ...events.A },
      B: { ...events.B }
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

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function lerp(start, end, amount) {
    return start + (end - start) * amount;
  }

  function nearlyZero(value) {
    return Math.abs(value) < 1e-10;
  }

  function titleCase(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function formatSigned(value, digits = 2, suffix = "") {
    const rounded = nearlyZero(value) ? 0 : value;
    const prefix = rounded > 0 ? "+" : "";
    return `${prefix}${rounded.toFixed(digits)}${suffix}`;
  }

  function formatCoordinate(value) {
    const rounded = nearlyZero(value) ? 0 : value;
    return rounded.toFixed(2).replace("-0.00", "0.00");
  }

  function formatGridValue(value) {
    const rounded = nearlyZero(value) ? 0 : value;
    const absolute = Math.abs(rounded);
    if (absolute >= 100) return rounded.toFixed(0);
    if (absolute >= 10) return rounded.toFixed(1).replace(/\.0$/, "");
    return rounded.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  }

  function formatViewSpan(value) {
    if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
    if (value >= 10) return value.toFixed(1).replace(/\.0$/, "");
    if (value >= 1) return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  }

  function rocketRapidity() {
    return G.rapidityFromBeta(state.beta);
  }

  function earthToCoordinateFrame(point, frame = state.coordinateFrame) {
    return frame === "rocket" ? G.earthToRocket(point, state.beta) : { ...point };
  }

  function coordinateFrameToEarth(point, frame = state.coordinateFrame) {
    return frame === "rocket" ? G.rocketToEarth(point, state.beta) : { ...point };
  }

  function earthToView(point) {
    return G.boost(point, state.currentViewRapidity);
  }

  function viewToEarth(point) {
    return G.boost(point, -state.currentViewRapidity);
  }

  function frameToView(point, frame) {
    return earthToView(coordinateFrameToEarth(point, frame));
  }

  function earthToGridFrame(point) {
    return G.boost(point, state.currentGridRapidity);
  }

  function gridFrameToEarth(point) {
    return G.boost(point, -state.currentGridRapidity);
  }

  function gridFrameToView(point) {
    return earthToView(gridFrameToEarth(point));
  }

  function currentViewCenter() {
    return earthToView(state.viewCenterEarth);
  }

  function currentViewBounds() {
    const center = currentViewCenter();
    return {
      minX: center.x - state.viewHalf,
      maxX: center.x + state.viewHalf,
      minCt: center.ct - state.viewHalf,
      maxCt: center.ct + state.viewHalf
    };
  }

  function viewToScreen(point) {
    const scale = PLOT.size / (2 * state.viewHalf);
    const center = currentViewCenter();
    return {
      x: PLOT.centerX + (point.x - center.x) * scale,
      y: PLOT.centerY - (point.ct - center.ct) * scale
    };
  }

  function screenToView(point) {
    const scale = PLOT.size / (2 * state.viewHalf);
    const center = currentViewCenter();
    return {
      x: center.x + (point.x - PLOT.centerX) / scale,
      ct: center.ct + (PLOT.centerY - point.y) / scale
    };
  }

  function addPoints(a, b) {
    return { x: a.x + b.x, ct: a.ct + b.ct };
  }

  function subtractPoints(a, b) {
    return { x: a.x - b.x, ct: a.ct - b.ct };
  }

  function scalePoint(point, amount) {
    return { x: point.x * amount, ct: point.ct * amount };
  }

  function clipInfiniteLine(point, direction) {
    let minimumAmount = -Infinity;
    let maximumAmount = Infinity;
    const bounds = currentViewBounds();

    ["x", "ct"].forEach((coordinate) => {
      const position = point[coordinate];
      const delta = direction[coordinate];
      const minimum = coordinate === "x" ? bounds.minX : bounds.minCt;
      const maximum = coordinate === "x" ? bounds.maxX : bounds.maxCt;

      if (Math.abs(delta) < G.EPSILON) {
        if (position < minimum || position > maximum) {
          minimumAmount = 1;
          maximumAmount = 0;
        }
        return;
      }

      let first = (minimum - position) / delta;
      let second = (maximum - position) / delta;
      if (first > second) [first, second] = [second, first];
      minimumAmount = Math.max(minimumAmount, first);
      maximumAmount = Math.min(maximumAmount, second);
    });

    if (minimumAmount > maximumAmount) return null;
    return {
      start: addPoints(point, scalePoint(direction, minimumAmount)),
      end: addPoints(point, scalePoint(direction, maximumAmount)),
      direction
    };
  }

  function clippedFrameLine(framePoint, frameDirection, frame) {
    const earthStart = coordinateFrameToEarth(framePoint, frame);
    const earthEnd = coordinateFrameToEarth(addPoints(framePoint, frameDirection), frame);
    const viewStart = earthToView(earthStart);
    const viewEnd = earthToView(earthEnd);
    return clipInfiniteLine(viewStart, subtractPoints(viewEnd, viewStart));
  }

  function clippedGridLine(gridPoint, gridDirection) {
    const earthStart = gridFrameToEarth(gridPoint);
    const earthEnd = gridFrameToEarth(addPoints(gridPoint, gridDirection));
    const viewStart = earthToView(earthStart);
    const viewEnd = earthToView(earthEnd);
    return clipInfiniteLine(viewStart, subtractPoints(viewEnd, viewStart));
  }

  function clippedEarthLine(earthPoint, earthDirection) {
    const viewStart = earthToView(earthPoint);
    const viewEnd = earthToView(addPoints(earthPoint, earthDirection));
    return clipInfiniteLine(viewStart, subtractPoints(viewEnd, viewStart));
  }

  function lineAttributes(segment) {
    const start = viewToScreen(segment.start);
    const end = viewToScreen(segment.end);
    return {
      x1: start.x.toFixed(2),
      y1: start.y.toFixed(2),
      x2: end.x.toFixed(2),
      y2: end.y.toFixed(2)
    };
  }

  function visibleBoundsInGridFrame() {
    const viewBounds = currentViewBounds();
    const corners = [
      { x: viewBounds.minX, ct: viewBounds.minCt },
      { x: viewBounds.minX, ct: viewBounds.maxCt },
      { x: viewBounds.maxX, ct: viewBounds.minCt },
      { x: viewBounds.maxX, ct: viewBounds.maxCt }
    ].map((corner) => earthToGridFrame(viewToEarth(corner)));

    return {
      minX: Math.min(...corners.map((point) => point.x)),
      maxX: Math.max(...corners.map((point) => point.x)),
      minCt: Math.min(...corners.map((point) => point.ct)),
      maxCt: Math.max(...corners.map((point) => point.ct))
    };
  }

  function niceGridStep(range) {
    const target = Math.max(range / 24, Number.EPSILON);
    const power = 10 ** Math.floor(Math.log10(target));
    const normalized = target / power;
    const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    return factor * power;
  }

  function renderGrid() {
    el.gridLayer.replaceChildren();
    const bounds = visibleBoundsInGridFrame();
    const range = Math.max(bounds.maxX - bounds.minX, bounds.maxCt - bounds.minCt);
    const step = niceGridStep(range);
    const fragment = document.createDocumentFragment();

    function appendFamily(minimum, maximum, vertical) {
      const firstIndex = Math.floor(minimum / step) - 1;
      const lastIndex = Math.ceil(maximum / step) + 1;

      for (let index = firstIndex; index <= lastIndex; index += 1) {
        if (index === 0) continue;
        const value = index * step;
        const point = vertical ? { x: value, ct: 0 } : { x: 0, ct: value };
        const direction = vertical ? { x: 0, ct: 1 } : { x: 1, ct: 0 };
        const segment = clippedGridLine(point, direction);
        if (!segment) continue;

        fragment.appendChild(createSvgElement("line", {
          class: `grid-line ${index % 5 === 0 ? "major-grid" : "minor-grid"}`,
          ...lineAttributes(segment)
        }));
      }
    }

    appendFamily(bounds.minX, bounds.maxX, true);
    appendFamily(bounds.minCt, bounds.maxCt, false);
    el.gridLayer.appendChild(fragment);
    return { bounds, step, majorStep: step * 5 };
  }

  function labelPosition(segment, distanceFromEdge = 26, sideOffset = 11) {
    const start = viewToScreen(segment.start);
    const end = viewToScreen(segment.end);
    const direction = { x: end.x - start.x, y: end.y - start.y };
    const length = Math.hypot(direction.x, direction.y) || 1;
    const unit = { x: direction.x / length, y: direction.y / length };

    return {
      x: end.x - unit.x * distanceFromEdge - unit.y * sideOffset,
      y: end.y - unit.y * distanceFromEdge + unit.x * sideOffset
    };
  }

  function appendLineWithLabel(layer, segment, lineClass, marker, label, labelClass, offset = 26) {
    if (!segment) return;
    const line = createSvgElement("line", {
      class: lineClass,
      ...lineAttributes(segment),
      "marker-end": `url(#${marker})`
    });
    layer.appendChild(line);

    const position = labelPosition(segment, offset);
    layer.appendChild(createSvgElement("text", {
      class: labelClass,
      x: clamp(position.x, PLOT.left + 68, PLOT.left + PLOT.size - 68).toFixed(2),
      y: clamp(position.y, PLOT.top + 20, PLOT.top + PLOT.size - 12).toFixed(2),
      "text-anchor": "middle"
    }, label));
  }

  function renderLightCone() {
    el.lightLayer.replaceChildren();
    [
      { direction: { x: 1, ct: 1 }, label: "light +c" },
      { direction: { x: -1, ct: 1 }, label: "light −c" }
    ].forEach((spec) => {
      appendLineWithLabel(
        el.lightLayer,
        clippedEarthLine({ x: 0, ct: 0 }, spec.direction),
        "light-line",
        "lightArrow",
        spec.label,
        "light-label",
        52
      );
    });
  }

  function renderAxes() {
    el.axisLayer.replaceChildren();
    const betaIsZero = nearlyZero(state.beta);

    if (betaIsZero) {
      [
        { direction: { x: 1, ct: 0 }, label: "x = x′" },
        { direction: { x: 0, ct: 1 }, label: "ct = ct′" }
      ].forEach((spec) => {
        appendLineWithLabel(
          el.axisLayer,
          clippedEarthLine({ x: 0, ct: 0 }, spec.direction),
          "axis-line shared-axis selected-axis",
          "sharedArrow",
          spec.label,
          "axis-label shared-label"
        );
      });
      return;
    }

    const axisSpecs = [
      { frame: "earth", direction: { x: 1, ct: 0 }, label: "Earth x", marker: "earthArrow" },
      { frame: "earth", direction: { x: 0, ct: 1 }, label: "Earth ct", marker: "earthArrow" },
      { frame: "rocket", direction: { x: 1, ct: 0 }, label: "Rocket x′", marker: "rocketArrow" },
      { frame: "rocket", direction: { x: 0, ct: 1 }, label: "Rocket ct′", marker: "rocketArrow" }
    ];

    axisSpecs.sort((a, b) => Number(a.frame === state.coordinateFrame) - Number(b.frame === state.coordinateFrame));
    axisSpecs.forEach((spec) => {
      const selected = spec.frame === state.coordinateFrame ? " selected-axis" : "";
      appendLineWithLabel(
        el.axisLayer,
        clippedFrameLine({ x: 0, ct: 0 }, spec.direction, spec.frame),
        `axis-line ${spec.frame}-axis${selected}`,
        spec.marker,
        spec.label,
        `axis-label ${spec.frame}-label${selected}`
      );
    });
  }

  function pointIsInsidePlot(point, inset = 12) {
    return point.x >= PLOT.left + inset
      && point.x <= PLOT.left + PLOT.size - inset
      && point.y >= PLOT.top + inset
      && point.y <= PLOT.top + PLOT.size - inset;
  }

  function renderTicks(grid) {
    el.tickLayer.replaceChildren();
    const fragment = document.createDocumentFragment();
    const { bounds, majorStep } = grid;

    function appendTicks(minimum, maximum, onPositionAxis) {
      const firstIndex = Math.ceil(minimum / majorStep);
      const lastIndex = Math.floor(maximum / majorStep);

      for (let index = firstIndex; index <= lastIndex; index += 1) {
        if (index === 0) continue;
        const value = index * majorStep;
        const overlapsEventValue = Object.values(state.events).some((earthEvent) => {
          const eventInFrame = earthToGridFrame(earthEvent);
          const coordinate = onPositionAxis ? eventInFrame.x : eventInFrame.ct;
          return Math.abs(coordinate - value) <= Math.max(0.02, majorStep * 0.02);
        });
        if (overlapsEventValue) continue;
        const framePoint = onPositionAxis ? { x: value, ct: 0 } : { x: 0, ct: value };
        const screenPoint = viewToScreen(gridFrameToView(framePoint));
        if (!pointIsInsidePlot(screenPoint, 18)) continue;

        fragment.appendChild(createSvgElement("circle", {
          class: "axis-tick",
          cx: screenPoint.x.toFixed(2),
          cy: screenPoint.y.toFixed(2),
          r: 2.5
        }));
        fragment.appendChild(createSvgElement("text", {
          class: "tick-label",
          x: (screenPoint.x + (onPositionAxis ? 0 : 11)).toFixed(2),
          y: (screenPoint.y + (onPositionAxis ? 18 : 4)).toFixed(2),
          "text-anchor": onPositionAxis ? "middle" : "start"
        }, formatGridValue(value)));
      }
    }

    appendTicks(bounds.minX, bounds.maxX, true);
    appendTicks(bounds.minCt, bounds.maxCt, false);

    const origin = viewToScreen(earthToView({ x: 0, ct: 0 }));
    fragment.appendChild(createSvgElement("text", {
      class: "origin-label",
      x: (origin.x + 9).toFixed(2),
      y: (origin.y + 18).toFixed(2)
    }, "O"));
    el.tickLayer.appendChild(fragment);
  }

  function renderGuides() {
    el.guideLayer.replaceChildren();
    const frame = state.coordinateFrame;
    const prime = frame === "rocket" ? "′" : "";
    const occupiedTags = [];

    Object.entries(state.events).forEach(([key, earthEvent]) => {
      const event = earthToGridFrame(earthEvent);
      const eventScreen = viewToScreen(gridFrameToView(event));
      const feet = [
        {
          kind: "position",
          point: { x: event.x, ct: 0 },
          label: `${key} · x${prime}=${formatCoordinate(event.x)}`
        },
        {
          kind: "time",
          point: { x: 0, ct: event.ct },
          label: `${key} · t${prime}=${formatCoordinate(event.ct)}`
        }
      ];

      feet.forEach((foot) => {
        const footScreen = viewToScreen(gridFrameToView(foot.point));
        el.guideLayer.appendChild(createSvgElement("line", {
          class: `guide-line event-${key.toLowerCase()}-guide${key === state.activeEvent ? " is-active" : ""}`,
          x1: eventScreen.x.toFixed(2),
          y1: eventScreen.y.toFixed(2),
          x2: footScreen.x.toFixed(2),
          y2: footScreen.y.toFixed(2)
        }));
        el.guideLayer.appendChild(createSvgElement("circle", {
          class: `guide-foot event-${key.toLowerCase()}-guide-foot`,
          cx: footScreen.x.toFixed(2),
          cy: footScreen.y.toFixed(2),
          r: key === state.activeEvent ? 4.5 : 3.5
        }));
        if (pointIsInsidePlot(footScreen, 4)) {
          appendAxisValueTag(key, foot, footScreen, occupiedTags);
        }
      });
    });
  }

  function boxesOverlap(first, second) {
    return first.x < second.x + second.width
      && first.x + first.width > second.x
      && first.y < second.y + second.height
      && first.y + first.height > second.y;
  }

  function appendAxisValueTag(key, foot, anchor, occupiedTags) {
    const width = Math.max(76, foot.label.length * 6.4 + 17);
    const height = 24;
    let x;
    let y;

    if (foot.kind === "position") {
      x = anchor.x - width / 2;
      y = key === "A" ? anchor.y + 9 : anchor.y - height - 9;
    } else {
      x = key === "A" ? anchor.x + 9 : anchor.x - width - 9;
      y = anchor.y - height / 2;
    }

    x = clamp(x, PLOT.left + 5, PLOT.left + PLOT.size - width - 5);
    y = clamp(y, PLOT.top + 5, PLOT.top + PLOT.size - height - 5);
    let attempts = 0;
    while (occupiedTags.some((box) => boxesOverlap(box, { x, y, width, height })) && attempts < 6) {
      const shift = height + 5;
      y = clamp(
        y + (key === "A" ? shift : -shift),
        PLOT.top + 5,
        PLOT.top + PLOT.size - height - 5
      );
      attempts += 1;
    }
    occupiedTags.push({ x, y, width, height });
    const group = createSvgElement("g", {
      class: `axis-value-tag event-${key.toLowerCase()}-tag`,
      transform: `translate(${x.toFixed(2)} ${y.toFixed(2)})`
    });
    group.appendChild(createSvgElement("rect", { x: 0, y: 0, width: width.toFixed(2), height, rx: 6 }));
    group.appendChild(createSvgElement("text", {
      x: (width / 2).toFixed(2),
      y: 16,
      "text-anchor": "middle"
    }, foot.label));
    el.guideLayer.appendChild(group);
  }

  function selectedObserverBeta() {
    return state.coordinateFrame === "rocket" ? state.beta : 0;
  }

  function simultaneityData() {
    const observerBeta = selectedObserverBeta();
    const delta = G.timeDifferenceInFrame(state.events.A, state.events.B, observerBeta);
    return {
      delta,
      simultaneous: G.areSimultaneousInFrame(
        state.events.A,
        state.events.B,
        observerBeta,
        SIMULTANEITY_TOLERANCE
      )
    };
  }

  function renderSimultaneity() {
    el.simultaneityLayer.replaceChildren();
    const data = simultaneityData();
    const rocketSelected = state.coordinateFrame === "rocket";
    const prime = rocketSelected ? "′" : "";
    const frameName = titleCase(state.coordinateFrame);

    el.simultaneityCard.classList.toggle("is-simultaneous", data.simultaneous);
    el.simultaneityCard.classList.toggle("is-separated", !data.simultaneous);
    el.simultaneityIcon.textContent = data.simultaneous ? "✓" : "Δ";
    el.simultaneityFrame.textContent = `${frameName} frame comparison`;
    el.simultaneityTitle.textContent = data.simultaneous
      ? "A and B are simultaneous"
      : "A and B are not simultaneous";
    el.simultaneityDetail.textContent = data.simultaneous
      ? "Their time difference is within 0.01 seconds."
      : `Event B occurs ${data.delta > 0 ? "later" : "earlier"} than Event A in this frame.`;
    el.timeDifferenceOutput.textContent = `Δt${prime} = ${formatSigned(data.delta, 2)} s`;

    if (!data.simultaneous) return;
    const first = earthToCoordinateFrame(state.events.A);
    const second = earthToCoordinateFrame(state.events.B);
    const meanTime = (first.ct + second.ct) / 2;
    const segment = clippedFrameLine({ x: 0, ct: meanTime }, { x: 1, ct: 0 }, state.coordinateFrame);
    if (!segment) return;

    el.simultaneityLayer.appendChild(createSvgElement("line", {
      class: "simultaneity-line",
      ...lineAttributes(segment)
    }));
    const labelPoint = labelPosition(segment, 86, -13);
    el.simultaneityLayer.appendChild(createSvgElement("text", {
      class: "simultaneity-line-label",
      x: clamp(labelPoint.x, PLOT.left + 70, PLOT.left + PLOT.size - 70).toFixed(2),
      y: clamp(labelPoint.y, PLOT.top + 18, PLOT.top + PLOT.size - 12).toFixed(2),
      "text-anchor": "middle"
    }, `same t${prime} ${Math.abs(data.delta) < 1e-9 ? "=" : "≈"} ${formatCoordinate(meanTime)} s`));
  }

  function renderEvents() {
    el.eventHandles.forEach((handle) => {
      const key = handle.dataset.event;
      const earthEvent = state.events[key];
      const coordinate = earthToCoordinateFrame(earthEvent);
      const eventScreen = viewToScreen(earthToView(earthEvent));
      const pointLabel = handle.querySelector(".event-point-label");
      const labelBelow = eventScreen.y < PLOT.top + 42;

      setAttributes(handle, {
        transform: `translate(${eventScreen.x.toFixed(2)} ${eventScreen.y.toFixed(2)})`
      });
      setAttributes(pointLabel, { y: labelBelow ? 31 : -25 });
      handle.classList.toggle("is-active", key === state.activeEvent);
      handle.setAttribute(
        "aria-label",
        `Event ${key}. ${titleCase(state.coordinateFrame)} coordinates: position ${formatCoordinate(coordinate.x)} light-seconds, time ${formatCoordinate(coordinate.ct)} seconds. Use arrow keys to move it.`
      );
    });
  }

  function updateControls() {
    const betaText = formatSigned(state.beta, 2, "c");
    const gammaText = `γ = ${G.gamma(state.beta).toFixed(3)}`;
    const activeEarthEvent = state.events[state.activeEvent];
    const coordinate = earthToCoordinateFrame(activeEarthEvent);
    const rocketSelected = state.coordinateFrame === "rocket";

    el.headerBeta.textContent = betaText;
    el.headerGamma.textContent = gammaText;
    el.speedOutput.textContent = betaText;
    el.gammaOutput.textContent = gammaText;
    el.speedSlider.value = state.beta.toFixed(2);
    if (document.activeElement !== el.speedInput) el.speedInput.value = state.beta.toFixed(2);

    el.frameButtons.forEach((button) => {
      const selected = button.dataset.frame === state.coordinateFrame;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });
    el.perspectiveButtons.forEach((button) => {
      const selected = button.dataset.perspective === state.perspective;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });

    el.eventSelectButtons.forEach((button) => {
      const selected = button.dataset.eventSelect === state.activeEvent;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-checked", String(selected));
    });
    el.eventHandles.forEach((handle) => {
      handle.classList.toggle("is-active", handle.dataset.event === state.activeEvent);
    });

    el.eventFrameLabel.textContent = `Editing ${state.activeEvent} · ${titleCase(state.coordinateFrame)} frame`;
    el.activeEventChip.textContent = state.activeEvent;
    el.activeEventChip.classList.toggle("event-a-chip", state.activeEvent === "A");
    el.activeEventChip.classList.toggle("event-b-chip", state.activeEvent === "B");
    el.eventXLabel.textContent = rocketSelected ? "Position x′" : "Position x";
    el.eventTLabel.textContent = rocketSelected ? "Time t′" : "Time t";
    if (document.activeElement !== el.eventXInput) el.eventXInput.value = formatCoordinate(coordinate.x);
    if (document.activeElement !== el.eventTInput) el.eventTInput.value = formatCoordinate(coordinate.ct);
    el.intervalOutput.textContent = formatSigned(G.minkowskiInterval(activeEarthEvent), 2);
    el.viewBadge.textContent = `${titleCase(state.coordinateFrame)} grid · ${titleCase(state.perspective)} upright`;
    el.viewRangeBadge.textContent = `${formatViewSpan(state.viewHalf * 2)} × ${formatViewSpan(state.viewHalf * 2)} units`;
  }

  function render() {
    updateControls();
    const grid = renderGrid();
    renderLightCone();
    renderSimultaneity();
    renderGuides();
    renderAxes();
    renderTicks(grid);
    renderEvents();
  }

  function roundedViewHalf(required, minimum = MIN_VIEW_HALF) {
    if (required <= minimum) return minimum;
    const unit = required < 12 ? 0.5 : required < 30 ? 1 : 5;
    return clamp(Math.ceil(required / unit) * unit, minimum, MAX_ZOOM_HALF);
  }

  function viewFitCandidates(includeOrigin = false) {
    const candidates = [];
    Object.values(state.events).forEach((earthEvent) => {
      const frameEvent = earthToCoordinateFrame(earthEvent);
      candidates.push(earthEvent);
      candidates.push(coordinateFrameToEarth({ x: frameEvent.x, ct: 0 }));
      candidates.push(coordinateFrameToEarth({ x: 0, ct: frameEvent.ct }));
    });
    if (includeOrigin) candidates.push({ x: 0, ct: 0 });
    return candidates;
  }

  function targetViewHalf(rapidity = state.currentViewRapidity) {
    const center = G.boost(state.viewCenterEarth, rapidity);
    const candidates = viewFitCandidates();
    const greatestCoordinate = candidates.reduce((greatest, point) => {
      const viewed = G.boost(point, rapidity);
      return Math.max(
        greatest,
        Math.abs(viewed.x - center.x),
        Math.abs(viewed.ct - center.ct)
      );
    }, 0);
    const required = greatestCoordinate * 1.18 + 0.4;
    return Math.max(state.viewHalf, roundedViewHalf(required, MIN_ZOOM_HALF));
  }

  function fitViewToEvents(announceChange = true) {
    const viewedCandidates = viewFitCandidates(true).map((point) => earthToView(point));
    const minX = Math.min(...viewedCandidates.map((point) => point.x));
    const maxX = Math.max(...viewedCandidates.map((point) => point.x));
    const minCt = Math.min(...viewedCandidates.map((point) => point.ct));
    const maxCt = Math.max(...viewedCandidates.map((point) => point.ct));
    const centerView = {
      x: (minX + maxX) / 2,
      ct: (minCt + maxCt) / 2
    };
    const required = Math.max(maxX - minX, maxCt - minCt) * 0.59 + 0.4;

    state.viewCenterEarth = viewToEarth(centerView);
    state.viewHalf = roundedViewHalf(required);
    render();
    if (announceChange) announce(`View fitted to Events A and B. Visible span ${formatViewSpan(state.viewHalf * 2)} units.`);
  }

  function cancelPerspectiveAnimation() {
    if (state.perspectiveFrame !== null) {
      cancelAnimationFrame(state.perspectiveFrame);
      state.perspectiveFrame = null;
    }
  }

  function cancelGridAnimation() {
    if (state.gridFrame !== null) {
      cancelAnimationFrame(state.gridFrame);
      state.gridFrame = null;
    }
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function animateCoordinateFrame(frame) {
    cancelGridAnimation();
    state.coordinateFrame = frame;
    const targetRapidity = frame === "rocket" ? rocketRapidity() : 0;

    if (prefersReducedMotion() || Math.abs(targetRapidity - state.currentGridRapidity) < 1e-10) {
      state.currentGridRapidity = targetRapidity;
      render();
      announceEvent(state.activeEvent);
      return;
    }

    const startRapidity = state.currentGridRapidity;
    const startTime = performance.now();

    function tick(now) {
      const progress = clamp((now - startTime) / GRID_TRANSITION_DURATION, 0, 1);
      const eased = progress < 0.5
        ? 4 * progress ** 3
        : 1 - (-2 * progress + 2) ** 3 / 2;
      state.currentGridRapidity = lerp(startRapidity, targetRapidity, eased);
      render();

      if (progress < 1) {
        state.gridFrame = requestAnimationFrame(tick);
      } else {
        state.currentGridRapidity = targetRapidity;
        state.gridFrame = null;
        render();
        announceEvent(state.activeEvent);
      }
    }

    render();
    state.gridFrame = requestAnimationFrame(tick);
  }

  function animatePerspective(perspective) {
    cancelPerspectiveAnimation();
    state.perspective = perspective;
    const targetRapidity = perspective === "rocket" ? rocketRapidity() : 0;
    const targetHalf = targetViewHalf(targetRapidity);

    if (prefersReducedMotion() || Math.abs(targetRapidity - state.currentViewRapidity) < 1e-10) {
      state.currentViewRapidity = targetRapidity;
      state.viewHalf = targetHalf;
      render();
      announce(`${titleCase(perspective)} axes are upright.`);
      return;
    }

    const startRapidity = state.currentViewRapidity;
    const startHalf = state.viewHalf;
    const startTime = performance.now();

    function tick(now) {
      const progress = clamp((now - startTime) / PERSPECTIVE_DURATION, 0, 1);
      const eased = 1 - (1 - progress) ** 3;
      state.currentViewRapidity = lerp(startRapidity, targetRapidity, eased);
      state.viewHalf = lerp(startHalf, targetHalf, eased);
      render();

      if (progress < 1) {
        state.perspectiveFrame = requestAnimationFrame(tick);
      } else {
        state.currentViewRapidity = targetRapidity;
        state.viewHalf = targetHalf;
        state.perspectiveFrame = null;
        render();
        announce(`${titleCase(perspective)} axes are upright.`);
      }
    }

    render();
    state.perspectiveFrame = requestAnimationFrame(tick);
  }

  function setBeta(rawValue) {
    if (!Number.isFinite(rawValue)) return;
    cancelPerspectiveAnimation();
    cancelGridAnimation();
    state.beta = Math.round(clamp(rawValue, -BETA_LIMIT, BETA_LIMIT) * 100) / 100;
    state.currentViewRapidity = state.perspective === "rocket" ? rocketRapidity() : 0;
    state.currentGridRapidity = state.coordinateFrame === "rocket" ? rocketRapidity() : 0;
    state.viewHalf = targetViewHalf();
    render();
  }

  function commitEventInputs() {
    const x = Number.parseFloat(el.eventXInput.value);
    const ct = Number.parseFloat(el.eventTInput.value);
    const valid = Number.isFinite(x) && Number.isFinite(ct);

    el.eventXInput.setAttribute("aria-invalid", String(!Number.isFinite(x)));
    el.eventTInput.setAttribute("aria-invalid", String(!Number.isFinite(ct)));
    if (!valid) return;

    state.events[state.activeEvent] = coordinateFrameToEarth({ x, ct });
    state.viewHalf = targetViewHalf();
    render();
    announceEvent(state.activeEvent);
  }

  function svgPointFromClient(clientX, clientY) {
    const point = el.diagram.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const matrix = el.diagram.getScreenCTM();
    return matrix ? point.matrixTransform(matrix.inverse()) : { x: PLOT.centerX, y: PLOT.centerY };
  }

  function pointInsidePlot(point) {
    return point.x >= PLOT.left
      && point.x <= PLOT.left + PLOT.size
      && point.y >= PLOT.top
      && point.y <= PLOT.top + PLOT.size;
  }

  function scheduleZoomAnnouncement() {
    if (state.zoomAnnouncementTimer !== null) clearTimeout(state.zoomAnnouncementTimer);
    state.zoomAnnouncementTimer = setTimeout(() => {
      state.zoomAnnouncementTimer = null;
      announce(`Graph span ${formatViewSpan(state.viewHalf * 2)} units in both directions.`);
    }, 280);
  }

  function zoomAtPoint(svgPoint, factor, announceChange = true) {
    const anchorView = screenToView(svgPoint);
    const newHalf = clamp(state.viewHalf * factor, MIN_ZOOM_HALF, MAX_ZOOM_HALF);
    if (Math.abs(newHalf - state.viewHalf) < 1e-12) return;

    const newScale = PLOT.size / (2 * newHalf);
    const newCenterView = {
      x: anchorView.x - (svgPoint.x - PLOT.centerX) / newScale,
      ct: anchorView.ct - (PLOT.centerY - svgPoint.y) / newScale
    };
    state.viewCenterEarth = viewToEarth(newCenterView);
    state.viewHalf = newHalf;
    render();
    if (announceChange) scheduleZoomAnnouncement();
  }

  function handleWheelZoom(event) {
    const svgPoint = svgPointFromClient(event.clientX, event.clientY);
    if (!pointInsidePlot(svgPoint) || event.deltaY === 0) return;

    event.preventDefault();
    const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? PLOT.size : 1;
    const normalizedDelta = clamp(event.deltaY * deltaScale * 0.0015, -0.45, 0.45);
    zoomAtPoint(svgPoint, Math.exp(normalizedDelta));
  }

  function zoomFromCenter(factor) {
    zoomAtPoint({ x: PLOT.centerX, y: PLOT.centerY }, factor);
  }

  function placeEventFromClient(clientX, clientY, eventKey) {
    const svgPoint = svgPointFromClient(clientX, clientY);
    const clampedPoint = {
      x: clamp(svgPoint.x, PLOT.left, PLOT.left + PLOT.size),
      y: clamp(svgPoint.y, PLOT.top, PLOT.top + PLOT.size)
    };
    state.events[eventKey] = viewToEarth(screenToView(clampedPoint));
    render();
  }

  function announce(message) {
    el.liveStatus.textContent = "";
    requestAnimationFrame(() => {
      el.liveStatus.textContent = message;
    });
  }

  function comparisonAnnouncement() {
    const comparison = simultaneityData();
    return comparison.simultaneous
      ? `Events A and B are simultaneous in the ${state.coordinateFrame} frame.`
      : `Their time difference in this frame is ${formatSigned(comparison.delta, 2)} seconds.`;
  }

  function announceEvent(eventKey = state.activeEvent) {
    const coordinate = earthToCoordinateFrame(state.events[eventKey]);
    announce(
      `Event ${eventKey} in the ${state.coordinateFrame} frame: position ${formatCoordinate(coordinate.x)} light-seconds, time ${formatCoordinate(coordinate.ct)} seconds. ${comparisonAnnouncement()}`
    );
  }

  function setActiveEvent(eventKey, focusHandle = false) {
    state.activeEvent = eventKey;
    render();
    if (focusHandle) {
      const handle = el.eventHandles.find((candidate) => candidate.dataset.event === eventKey);
      handle?.focus({ preventScroll: true });
    }
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return;
    const svgPoint = svgPointFromClient(event.clientX, event.clientY);
    if (!pointInsidePlot(svgPoint)) return;

    cancelPerspectiveAnimation();
    const handle = event.target.closest?.("[data-event]");
    const eventKey = handle?.dataset.event || state.activeEvent;
    state.activeEvent = eventKey;
    state.draggingPointer = event.pointerId;
    state.draggingEvent = eventKey;
    el.diagram.setPointerCapture(event.pointerId);
    placeEventFromClient(event.clientX, event.clientY, eventKey);
    const activeHandle = el.eventHandles.find((candidate) => candidate.dataset.event === eventKey);
    activeHandle?.focus({ preventScroll: true });
    event.preventDefault();
  }

  function handlePointerMove(event) {
    if (state.draggingPointer !== event.pointerId) return;
    placeEventFromClient(event.clientX, event.clientY, state.draggingEvent);
    event.preventDefault();
  }

  function finishPointerDrag(event) {
    if (state.draggingPointer !== event.pointerId) return;
    if (el.diagram.hasPointerCapture(event.pointerId)) el.diagram.releasePointerCapture(event.pointerId);
    const movedEvent = state.draggingEvent;
    state.draggingPointer = null;
    state.draggingEvent = null;
    announceEvent(movedEvent);
  }

  function handleEventKeyboard(event) {
    const deltas = {
      ArrowLeft: { x: -1, ct: 0 },
      ArrowRight: { x: 1, ct: 0 },
      ArrowDown: { x: 0, ct: -1 },
      ArrowUp: { x: 0, ct: 1 }
    };
    const delta = deltas[event.key];
    if (!delta) return;

    event.preventDefault();
    event.stopPropagation();
    const eventKey = event.currentTarget.dataset.event;
    state.activeEvent = eventKey;
    const amount = event.shiftKey ? 1 : 0.1;
    const coordinate = earthToCoordinateFrame(state.events[eventKey]);
    coordinate.x += delta.x * amount;
    coordinate.ct += delta.ct * amount;
    state.events[eventKey] = coordinateFrameToEarth(coordinate);
    state.viewHalf = targetViewHalf();
    render();
    announceEvent(eventKey);
  }

  function reset() {
    cancelPerspectiveAnimation();
    cancelGridAnimation();
    if (state.zoomAnnouncementTimer !== null) clearTimeout(state.zoomAnnouncementTimer);
    state.beta = defaults.beta;
    state.events = cloneEvents(defaults.events);
    state.activeEvent = defaults.activeEvent;
    state.coordinateFrame = defaults.coordinateFrame;
    state.perspective = defaults.perspective;
    state.currentViewRapidity = 0;
    state.currentGridRapidity = 0;
    state.viewCenterEarth = { x: 0, ct: 0 };
    state.viewHalf = MIN_VIEW_HALF;
    state.zoomAnnouncementTimer = null;
    render();
    announce("Explorer reset. Events A and B are simultaneous in the Earth frame at 5 seconds.");
  }

  el.speedSlider.addEventListener("input", () => setBeta(Number.parseFloat(el.speedSlider.value)));
  el.speedSlider.addEventListener("change", () => {
    announce(`Rocket velocity ${formatSigned(state.beta, 2, " c")}. ${comparisonAnnouncement()}`);
  });
  el.speedInput.addEventListener("input", () => {
    const value = Number.parseFloat(el.speedInput.value);
    if (Number.isFinite(value)) setBeta(value);
  });
  el.speedInput.addEventListener("change", () => {
    setBeta(Number.parseFloat(el.speedInput.value));
    el.speedInput.value = state.beta.toFixed(2);
    announce(`Rocket velocity ${formatSigned(state.beta, 2, " c")}. ${comparisonAnnouncement()}`);
  });

  el.frameButtons.forEach((button) => {
    button.addEventListener("click", () => animateCoordinateFrame(button.dataset.frame));
  });

  el.perspectiveButtons.forEach((button) => {
    button.addEventListener("click", () => animatePerspective(button.dataset.perspective));
  });

  el.eventSelectButtons.forEach((button) => {
    button.addEventListener("click", () => {
      setActiveEvent(button.dataset.eventSelect);
      announceEvent(button.dataset.eventSelect);
    });
  });

  [el.eventXInput, el.eventTInput].forEach((input) => {
    input.addEventListener("change", commitEventInputs);
    input.addEventListener("blur", render);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        commitEventInputs();
        input.select();
      }
    });
  });

  el.diagram.addEventListener("pointerdown", handlePointerDown);
  el.diagram.addEventListener("pointermove", handlePointerMove);
  el.diagram.addEventListener("pointerup", finishPointerDrag);
  el.diagram.addEventListener("pointercancel", finishPointerDrag);
  el.diagram.addEventListener("wheel", handleWheelZoom, { passive: false });
  el.eventHandles.forEach((handle) => handle.addEventListener("keydown", handleEventKeyboard));
  el.zoomOutButton.addEventListener("click", () => zoomFromCenter(1 / BUTTON_ZOOM_FACTOR));
  el.zoomInButton.addEventListener("click", () => zoomFromCenter(BUTTON_ZOOM_FACTOR));
  el.fitViewButton.addEventListener("click", () => fitViewToEvents());
  el.resetButton.addEventListener("click", reset);

  render();
})();
