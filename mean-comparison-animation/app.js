const MIN_SIDE = 2;
const MAX_SIDE = 12;
const DEFAULTS = {
  a: 9,
  b: 4,
  progress: 0
};

const state = {
  a: DEFAULTS.a,
  b: DEFAULTS.b,
  progress: DEFAULTS.progress,
  playing: false,
  animationFrame: null,
  animationStart: 0,
  draggingSource: false
};

const panelSpecs = [
  {
    key: "arithmetic",
    title: "Arithmetic Mean",
    rule: "same perimeter",
    formula: "s = (a + b) / 2",
    value: ({ a, b }) => (a + b) / 2,
    invariantLabel: "Perimeter",
    invariantValue: ({ a, b }) => 2 * (a + b),
    invariantUnit: "units",
    dimensions: ({ a, b }, t) => {
      const s = (a + b) / 2;
      return {
        w: lerp(a, s, t),
        h: lerp(b, s, t)
      };
    }
  },
  {
    key: "geometric",
    title: "Geometric Mean",
    rule: "same area",
    formula: "s = sqrt(ab)",
    value: ({ a, b }) => Math.sqrt(a * b),
    invariantLabel: "Area",
    invariantValue: ({ a, b }) => a * b,
    invariantUnit: "square units",
    dimensions: ({ a, b }, t) => {
      const s = Math.sqrt(a * b);
      const w = Math.exp(lerp(Math.log(a), Math.log(s), t));
      return {
        w,
        h: (a * b) / w
      };
    }
  },
  {
    key: "quadratic",
    title: "Quadratic Mean",
    rule: "same diagonal",
    formula: "s = sqrt((a^2 + b^2) / 2)",
    value: ({ a, b }) => Math.sqrt((a * a + b * b) / 2),
    invariantLabel: "Diagonal",
    invariantValue: ({ a, b }) => Math.sqrt(a * a + b * b),
    invariantUnit: "units",
    dimensions: ({ a, b }, t) => {
      const diagonal = Math.sqrt(a * a + b * b);
      const startAngle = Math.atan2(b, a);
      const angle = lerp(startAngle, Math.PI / 4, t);
      return {
        w: diagonal * Math.cos(angle),
        h: diagonal * Math.sin(angle)
      };
    }
  },
  {
    key: "harmonic",
    title: "Harmonic Mean",
    rule: "same perimeter / area",
    formula: "s = 2ab / (a + b)",
    value: ({ a, b }) => (2 * a * b) / (a + b),
    invariantLabel: "P / A",
    invariantValue: ({ a, b }) => (2 * (a + b)) / (a * b),
    invariantUnit: "per unit",
    dimensions: ({ a, b }, t) => {
      const reciprocalSum = (1 / a) + (1 / b);
      const reciprocalWidth = lerp(1 / a, reciprocalSum / 2, t);
      const reciprocalHeight = reciprocalSum - reciprocalWidth;
      return {
        w: 1 / reciprocalWidth,
        h: 1 / reciprocalHeight
      };
    }
  }
];

const el = {
  aValue: document.getElementById("aValue"),
  bValue: document.getElementById("bValue"),
  aSlider: document.getElementById("aSlider"),
  bSlider: document.getElementById("bSlider"),
  progressSlider: document.getElementById("progressSlider"),
  playBtn: document.getElementById("playBtn"),
  resetBtn: document.getElementById("resetBtn"),
  meanGrid: document.getElementById("meanGrid"),
  sourceSvg: document.getElementById("sourceSvg"),
  sourceGrid: document.getElementById("sourceGrid"),
  sourceRect: document.getElementById("sourceRect"),
  sourceWidthGuide: document.getElementById("sourceWidthGuide"),
  sourceHeightGuide: document.getElementById("sourceHeightGuide"),
  sourceWidthLabel: document.getElementById("sourceWidthLabel"),
  sourceHeightLabel: document.getElementById("sourceHeightLabel"),
  sourceHandle: document.getElementById("sourceHandle"),
  sourceHandleHit: document.getElementById("sourceHandleHit"),
  sourceHandleRing: document.getElementById("sourceHandleRing"),
  sourceHandleDot: document.getElementById("sourceHandleDot")
};

const sourceLayout = {
  x: 52,
  y: 38,
  scale: 12.5,
  labelGap: 18
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start, end, t) {
  return start + (end - start) * t;
}

function easeInOut(t) {
  return t * t * (3 - (2 * t));
}

function formatNumber(value, places = 2) {
  return Number(value.toFixed(places)).toString();
}

function setAttributes(node, attributes) {
  Object.entries(attributes).forEach(([name, value]) => {
    node.setAttribute(name, value);
  });
}

function createSvgElement(name, attributes = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  setAttributes(node, attributes);
  return node;
}

function svgPointFromEvent(svg, event) {
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(svg.getScreenCTM().inverse());
}

function panelTemplate(spec) {
  return `
    <article class="mean-panel" data-kind="${spec.key}">
      <div class="panel-head">
        <div class="panel-title">
          <h2>${spec.title}</h2>
          <p>${spec.rule}</p>
        </div>
        <div class="mean-value" id="${spec.key}Value">0</div>
      </div>
      <svg class="panel-svg" id="${spec.key}Svg" viewBox="0 0 430 285" role="img" aria-labelledby="${spec.key}Title ${spec.key}Desc">
        <title id="${spec.key}Title">${spec.title} construction</title>
        <desc id="${spec.key}Desc">The rectangle changes into a square while preserving ${spec.rule}.</desc>
        <rect x="0" y="0" width="430" height="285" fill="#fcfbf8"></rect>
        <g id="${spec.key}Grid"></g>
        <rect id="${spec.key}Target" class="target-outline"></rect>
        <rect id="${spec.key}Original" class="original-outline"></rect>
        <g id="${spec.key}Invariant"></g>
        <rect id="${spec.key}Shape" class="moving-shape"></rect>
        <text id="${spec.key}WidthLabel" class="panel-small-label"></text>
        <text id="${spec.key}HeightLabel" class="panel-small-label"></text>
        <text id="${spec.key}ShapeLabel" class="panel-label"></text>
        <text id="${spec.key}InvariantLabel" class="panel-small-label"></text>
      </svg>
      <div class="panel-foot">
        <div class="formula"><strong>${spec.formula}</strong><br><span id="${spec.key}FormulaValue"></span></div>
        <div class="invariant"><strong>${spec.invariantLabel}</strong><br><span id="${spec.key}InvariantValue"></span></div>
      </div>
    </article>
  `;
}

function buildPanels() {
  el.meanGrid.innerHTML = panelSpecs.map(panelTemplate).join("");

  panelSpecs.forEach((spec) => {
    spec.nodes = {
      value: document.getElementById(`${spec.key}Value`),
      svg: document.getElementById(`${spec.key}Svg`),
      grid: document.getElementById(`${spec.key}Grid`),
      target: document.getElementById(`${spec.key}Target`),
      original: document.getElementById(`${spec.key}Original`),
      invariant: document.getElementById(`${spec.key}Invariant`),
      shape: document.getElementById(`${spec.key}Shape`),
      widthLabel: document.getElementById(`${spec.key}WidthLabel`),
      heightLabel: document.getElementById(`${spec.key}HeightLabel`),
      shapeLabel: document.getElementById(`${spec.key}ShapeLabel`),
      invariantLabel: document.getElementById(`${spec.key}InvariantLabel`),
      formulaValue: document.getElementById(`${spec.key}FormulaValue`),
      invariantValue: document.getElementById(`${spec.key}InvariantValue`)
    };
    drawGrid(spec.nodes.grid, 430, 285, 24);
  });
}

function drawGrid(target, width, height, spacing) {
  const fragment = document.createDocumentFragment();

  for (let x = spacing; x < width; x += spacing) {
    fragment.appendChild(createSvgElement("line", {
      class: "grid-line",
      x1: x,
      y1: 0,
      x2: x,
      y2: height
    }));
  }

  for (let y = spacing; y < height; y += spacing) {
    fragment.appendChild(createSvgElement("line", {
      class: "grid-line",
      x1: 0,
      y1: y,
      x2: width,
      y2: y
    }));
  }

  target.replaceChildren(fragment);
}

function drawSourceGrid() {
  const fragment = document.createDocumentFragment();

  for (let value = MIN_SIDE; value <= MAX_SIDE; value += 2) {
    const x = sourceLayout.x + value * sourceLayout.scale;
    fragment.appendChild(createSvgElement("line", {
      class: "grid-line",
      x1: x,
      y1: 18,
      x2: x,
      y2: 212
    }));
  }

  for (let value = MIN_SIDE; value <= MAX_SIDE; value += 2) {
    const y = sourceLayout.y + value * sourceLayout.scale;
    fragment.appendChild(createSvgElement("line", {
      class: "grid-line",
      x1: 18,
      y1: y,
      x2: 302,
      y2: y
    }));
  }

  el.sourceGrid.replaceChildren(fragment);
}

function panelGeometry(spec, progress) {
  const targetSide = spec.value(state);
  const current = spec.dimensions(state, progress);
  const maxSide = Math.max(state.a, state.b, targetSide, current.w, current.h);
  const scale = Math.min(220 / maxSide, 150 / maxSide);
  const center = { x: 215, y: 134 };

  return {
    targetSide,
    current,
    scale,
    center,
    rect: rectFromCenter(center, current.w * scale, current.h * scale),
    original: rectFromCenter(center, state.a * scale, state.b * scale),
    target: rectFromCenter(center, targetSide * scale, targetSide * scale)
  };
}

function rectFromCenter(center, width, height) {
  return {
    x: center.x - width / 2,
    y: center.y - height / 2,
    width,
    height,
    right: center.x + width / 2,
    bottom: center.y + height / 2
  };
}

function updateRect(node, rect) {
  setAttributes(node, {
    x: rect.x.toFixed(2),
    y: rect.y.toFixed(2),
    width: rect.width.toFixed(2),
    height: rect.height.toFixed(2)
  });
}

function drawInvariant(spec, geometry) {
  const group = spec.nodes.invariant;
  const rect = geometry.rect;
  const progress = state.progress;
  const fragment = document.createDocumentFragment();

  if (spec.key === "arithmetic") {
    fragment.appendChild(createSvgElement("rect", {
      class: "invariant-line",
      x: rect.x.toFixed(2),
      y: rect.y.toFixed(2),
      width: rect.width.toFixed(2),
      height: rect.height.toFixed(2),
      fill: "none",
      "stroke-dasharray": "12 8"
    }));
  }

  if (spec.key === "geometric") {
    const columns = Math.max(2, Math.round(geometry.current.w));
    const rows = Math.max(2, Math.round(geometry.current.h));

    for (let i = 1; i < columns; i += 1) {
      const x = rect.x + (rect.width * i) / columns;
      fragment.appendChild(createSvgElement("line", {
        class: "area-grid",
        x1: x.toFixed(2),
        y1: rect.y.toFixed(2),
        x2: x.toFixed(2),
        y2: rect.bottom.toFixed(2)
      }));
    }

    for (let i = 1; i < rows; i += 1) {
      const y = rect.y + (rect.height * i) / rows;
      fragment.appendChild(createSvgElement("line", {
        class: "area-grid",
        x1: rect.x.toFixed(2),
        y1: y.toFixed(2),
        x2: rect.right.toFixed(2),
        y2: y.toFixed(2)
      }));
    }
  }

  if (spec.key === "quadratic") {
    fragment.appendChild(createSvgElement("line", {
      class: "invariant-line",
      x1: rect.x.toFixed(2),
      y1: rect.y.toFixed(2),
      x2: rect.right.toFixed(2),
      y2: rect.bottom.toFixed(2)
    }));
  }

  if (spec.key === "harmonic") {
    fragment.appendChild(createSvgElement("rect", {
      class: "invariant-line",
      x: rect.x.toFixed(2),
      y: rect.y.toFixed(2),
      width: rect.width.toFixed(2),
      height: rect.height.toFixed(2),
      fill: "none",
      opacity: "0.65"
    }));
    fragment.appendChild(createSvgElement("line", {
      class: "secondary-line",
      x1: rect.x.toFixed(2),
      y1: rect.bottom.toFixed(2),
      x2: rect.right.toFixed(2),
      y2: rect.y.toFixed(2)
    }));
  }

  group.replaceChildren(fragment);

  const label = spec.nodes.invariantLabel;
  label.textContent = progress >= 0.98 ? "square" : spec.rule;
  setAttributes(label, {
    x: 24,
    y: 262
  });
}

function renderPanels() {
  const easedProgress = easeInOut(state.progress);

  panelSpecs.forEach((spec) => {
    const geometry = panelGeometry(spec, easedProgress);
    const { nodes } = spec;
    const invariantValue = spec.invariantValue(state);

    updateRect(nodes.original, geometry.original);
    updateRect(nodes.target, geometry.target);
    updateRect(nodes.shape, geometry.rect);
    drawInvariant(spec, geometry);

    setAttributes(nodes.widthLabel, {
      x: geometry.rect.x + geometry.rect.width / 2,
      y: geometry.rect.bottom + 22,
      "text-anchor": "middle"
    });
    nodes.widthLabel.textContent = `width ${formatNumber(geometry.current.w)}`;

    setAttributes(nodes.heightLabel, {
      x: geometry.rect.right + 14,
      y: geometry.rect.y + geometry.rect.height / 2 + 5
    });
    nodes.heightLabel.textContent = `height ${formatNumber(geometry.current.h)}`;

    setAttributes(nodes.shapeLabel, {
      x: geometry.center.x,
      y: geometry.center.y + 6,
      "text-anchor": "middle"
    });
    nodes.shapeLabel.textContent = state.progress >= 0.995 ? `s = ${formatNumber(geometry.targetSide)}` : "";

    nodes.value.textContent = formatNumber(geometry.targetSide);
    nodes.formulaValue.textContent = `s = ${formatNumber(geometry.targetSide, 3)}`;
    nodes.invariantValue.textContent = `${formatNumber(invariantValue, 3)} ${spec.invariantUnit}`;
  });
}

function renderSource() {
  const x = sourceLayout.x;
  const y = sourceLayout.y;
  const width = state.a * sourceLayout.scale;
  const height = state.b * sourceLayout.scale;
  const right = x + width;
  const bottom = y + height;

  updateRect(el.sourceRect, { x, y, width, height });

  setAttributes(el.sourceWidthGuide, {
    x1: x,
    y1: bottom + sourceLayout.labelGap,
    x2: right,
    y2: bottom + sourceLayout.labelGap
  });
  setAttributes(el.sourceHeightGuide, {
    x1: right + sourceLayout.labelGap,
    y1: y,
    x2: right + sourceLayout.labelGap,
    y2: bottom
  });

  setAttributes(el.sourceWidthLabel, {
    x: x + width / 2,
    y: bottom + sourceLayout.labelGap + 22,
    "text-anchor": "middle"
  });
  el.sourceWidthLabel.textContent = `a = ${formatNumber(state.a, 1)}`;

  setAttributes(el.sourceHeightLabel, {
    x: right + sourceLayout.labelGap + 8,
    y: y + height / 2 + 6
  });
  el.sourceHeightLabel.textContent = `b = ${formatNumber(state.b, 1)}`;

  [el.sourceHandleHit, el.sourceHandleRing, el.sourceHandleDot].forEach((node) => {
    setAttributes(node, {
      cx: right,
      cy: bottom
    });
  });
}

function renderControls() {
  el.aValue.textContent = formatNumber(state.a, 1);
  el.bValue.textContent = formatNumber(state.b, 1);
  el.aSlider.value = state.a.toFixed(1);
  el.bSlider.value = state.b.toFixed(1);
  el.progressSlider.value = state.progress.toFixed(3);

  if (state.playing) {
    el.playBtn.textContent = "Pause";
  } else {
    el.playBtn.textContent = state.progress >= 0.995 ? "Replay" : "Play";
  }
}

function render() {
  renderControls();
  renderSource();
  renderPanels();
}

function setSides(nextA, nextB) {
  state.a = clamp(nextA, MIN_SIDE, MAX_SIDE);
  state.b = clamp(nextB, MIN_SIDE, MAX_SIDE);
  render();
}

function setProgress(value) {
  state.progress = clamp(value, 0, 1);
  render();
}

function stopAnimation() {
  if (state.animationFrame !== null) {
    cancelAnimationFrame(state.animationFrame);
    state.animationFrame = null;
  }

  state.playing = false;
}

function tick(timestamp) {
  if (!state.playing) {
    return;
  }

  if (!state.animationStart) {
    state.animationStart = timestamp - state.progress * 2600;
  }

  const elapsed = timestamp - state.animationStart;
  state.progress = clamp(elapsed / 2600, 0, 1);
  render();

  if (state.progress >= 1) {
    stopAnimation();
    render();
    return;
  }

  state.animationFrame = requestAnimationFrame(tick);
}

function playOrPause() {
  if (state.playing) {
    stopAnimation();
    render();
    return;
  }

  if (state.progress >= 0.995) {
    state.progress = 0;
  }

  state.playing = true;
  state.animationStart = 0;
  render();
  state.animationFrame = requestAnimationFrame(tick);
}

function resetAll() {
  stopAnimation();
  state.a = DEFAULTS.a;
  state.b = DEFAULTS.b;
  state.progress = DEFAULTS.progress;
  render();
}

function beginSourceDrag(event) {
  stopAnimation();
  state.draggingSource = true;
  el.sourceHandle.setPointerCapture(event.pointerId);
  updateSidesFromDrag(event);
  event.preventDefault();
}

function updateSidesFromDrag(event) {
  const point = svgPointFromEvent(el.sourceSvg, event);
  const nextA = (point.x - sourceLayout.x) / sourceLayout.scale;
  const nextB = (point.y - sourceLayout.y) / sourceLayout.scale;
  setSides(nextA, nextB);
}

function moveSourceDrag(event) {
  if (!state.draggingSource) {
    return;
  }

  updateSidesFromDrag(event);
}

function endSourceDrag(event) {
  if (!state.draggingSource) {
    return;
  }

  if (el.sourceHandle.hasPointerCapture(event.pointerId)) {
    el.sourceHandle.releasePointerCapture(event.pointerId);
  }

  state.draggingSource = false;
}

function handleSliderInput(event) {
  stopAnimation();

  if (event.currentTarget === el.aSlider) {
    setSides(Number(event.currentTarget.value), state.b);
  }

  if (event.currentTarget === el.bSlider) {
    setSides(state.a, Number(event.currentTarget.value));
  }

  if (event.currentTarget === el.progressSlider) {
    setProgress(Number(event.currentTarget.value));
  }
}

function bindEvents() {
  el.aSlider.addEventListener("input", handleSliderInput);
  el.bSlider.addEventListener("input", handleSliderInput);
  el.progressSlider.addEventListener("input", handleSliderInput);
  el.playBtn.addEventListener("click", playOrPause);
  el.resetBtn.addEventListener("click", resetAll);

  el.sourceHandle.addEventListener("pointerdown", beginSourceDrag);
  el.sourceHandle.addEventListener("pointermove", moveSourceDrag);
  el.sourceHandle.addEventListener("pointerup", endSourceDrag);
  el.sourceHandle.addEventListener("pointercancel", endSourceDrag);
  el.sourceHandle.addEventListener("lostpointercapture", () => {
    state.draggingSource = false;
  });
}

buildPanels();
drawSourceGrid();
bindEvents();
render();
