(function initMotionLesson() {
  "use strict";

  const M = window.MotionMath;
  const ids = ["settingsForm", "speed1", "speed2", "start1", "start2", "ratioSummary", "settingsError",
    "meetingNumber", "meetingHint", "meetingError", "playbackRate", "playButton", "playLabel", "playIcon",
    "restartButton", "replayButton", "overviewTab", "detailTab", "stageBadge", "overviewTitle", "periodSummary",
    "traveller1", "traveller2", "trackMeetingTicks", "meetingHalo", "position1", "position2", "trackStatus",
    "timeGraph", "graphNote", "progressSlider", "progressLabel", "timeReadout", "playbackStatus", "meetingCount",
    "meetingList", "detailTitle", "detailSubtitle", "meetingPosition", "continuousNotice", "discreteDetail",
    "routeSvg", "routeScroll", "distance1", "distance2", "equationBox", "equationPrompt", "equationResult",
    "equationContext", "equations", "equationExplanation", "detailPlayButton", "detailProgressSlider", "detailProgressText"];
  const el = Object.fromEntries(ids.map(id => [id, document.getElementById(id)]));
  const PLOT = { left: 65, right: 995, top: 34, bottom: 258 };
  const ROUTE = { left: 85, right: 975, gap: 29 };
  const state = {
    model: M.analyzeMotion({ ratio: [5, 3], starts: ["A", "B"] }),
    selected: 3, stage: "overview", overview: 0, detail: 0,
    playing: false, rate: 1, frame: null, lastTimestamp: null, hold: 0,
    invalidSettings: false, invalidMeeting: false
  };
  let graph = {};
  let routeViews = [];
  let meetingButtons = [];
  let trackTicks = [];

  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const selectedEvent = () => state.model.events[state.selected - 1];
  const distanceText = rational => `${M.formatFraction(rational)}S`;
  const timeText = rational => `${M.formatFraction(M.fraction(rational.n, rational.d * 2))}T`;
  const approximate = n => String(Number(n.toFixed(3)));
  function setText(node, text) { if (node.textContent !== text) node.textContent = text; }
  function attrs(node, values) { Object.entries(values).forEach(([key, val]) => node.setAttribute(key, val)); return node; }
  function svg(name, values = {}, parent, text) {
    const node = attrs(document.createElementNS("http://www.w3.org/2000/svg", name), values);
    if (text !== undefined) node.textContent = text;
    if (parent) parent.appendChild(node);
    return node;
  }
  const plotX = time => PLOT.left + (PLOT.right - PLOT.left) * time / M.PERIOD;
  const plotY = position => PLOT.top + (PLOT.bottom - PLOT.top) * position;
  const routeX = position => ROUTE.left + (ROUTE.right - ROUTE.left) * position;

  function buildGraph() {
    const root = el.timeGraph;
    root.replaceChildren();
    svg("title", { id: "graphTitle" }, root, "Position versus time over one shared period");
    svg("desc", { id: "graphDesc" }, root, "A is at the top and B at the bottom. Numbered intersections are meetings. Select a marker to explore it.");
    const defs = svg("defs", {}, root);
    const clip = svg("clipPath", { id: "traceClip", clipPathUnits: "userSpaceOnUse" }, defs);
    graph.clip = svg("rect", { x: PLOT.left - 4, y: 0, width: 4, height: 310 }, clip);
    for (let i = 0; i <= 4; i++) {
      const x = plotX(i / 2);
      const y = plotY(i / 4);
      svg("line", { x1: x, x2: x, y1: PLOT.top, y2: PLOT.bottom, class: "graph-grid" }, root);
      svg("line", { x1: PLOT.left, x2: PLOT.right, y1: y, y2: y, class: i === 0 || i === 4 ? "graph-boundary" : "graph-grid" }, root);
      svg("text", { x, y: 281, "text-anchor": "middle", class: "graph-label-text" }, root, ["0", "T/4", "T/2", "3T/4", "T"][i]);
    }
    svg("text", { x: 41, y: PLOT.top + 6, class: "graph-end-label" }, root, "A");
    svg("text", { x: 41, y: PLOT.bottom + 6, class: "graph-end-label" }, root, "B");
    svg("path", { d: `M25 ${PLOT.top} H19 V${PLOT.bottom} H25`, fill: "none", class: "graph-boundary" }, root);
    svg("text", { x: 8, y: plotY(0.5) + 5, class: "graph-end-label" }, root, "S");
    svg("text", { x: PLOT.right, y: 305, "text-anchor": "end", class: "graph-label-text" }, root, "time →");

    const traces = state.model.ratio.map((speed, i) => {
      const points = [];
      for (let k = 0; k <= 2 * speed; k++) {
        const position = (k + (state.model.starts[i] === "A" ? 0 : 1)) % 2;
        points.push(`${plotX(k / speed)},${plotY(position)}`);
      }
      const className = `trace trace-${i === 0 ? "one" : "two"}`;
      svg("polyline", { points: points.join(" "), class: `${className} trace-ghost` }, root);
      return { points: points.join(" "), class: className };
    });
    const revealed = svg("g", { "clip-path": "url(#traceClip)" }, root);
    traces.forEach(trace => svg("polyline", trace, revealed));
    graph.cursor = svg("line", { y1: PLOT.top, y2: PLOT.bottom, class: "time-cursor" }, root);
    graph.dots = ["one", "two"].map(name => svg("circle", { r: 5, class: `cursor-${name}` }, root));
    graph.markers = state.model.events.map(event => {
      const x = plotX(event.t), y = plotY(event.x);
      const labelY = clamp(y + (event.index % 2 ? 19 : -19), PLOT.top + 12, PLOT.bottom - 12);
      const group = svg("g", { class: "meeting-marker future", role: "button", tabindex: "-1", "data-meeting": event.index,
        "aria-label": `Meeting ${event.index}, ${distanceText(event.position)} from A, at ${timeText(event.time)}` }, root);
      svg("title", {}, group, `Meeting #${event.index} · ${distanceText(event.position)} from A · ${timeText(event.time)}`);
      svg("line", { x1: x, x2: x, y1: y, y2: labelY, class: "label-link" }, group);
      svg("circle", { cx: x, cy: y, r: 3.2, class: "meeting-dot" }, group);
      svg("circle", { cx: x, cy: labelY, r: 11, class: "label-bg" }, group);
      svg("text", { x, y: labelY }, group, String(event.index));
      group.addEventListener("click", () => selectMeeting(event.index));
      group.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectMeeting(event.index); }
      });
      return group;
    });
  }

  function buildNotebook() {
    el.meetingList.replaceChildren();
    setText(el.meetingCount, state.model.continuous ? "∞" : String(state.model.events.length));
    if (state.model.continuous) {
      const note = document.createElement("p");
      note.className = "helper";
      note.textContent = "They move together continuously. Every instant is shared.";
      el.meetingList.appendChild(note);
      meetingButtons = [];
      return;
    }
    meetingButtons = state.model.events.map(event => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "meeting-item";
      button.dataset.meeting = event.index;
      button.setAttribute("aria-label", `Explore meeting ${event.index}, ${distanceText(event.position)} from A, at ${timeText(event.time)}`);
      for (const [className, text] of [
        ["meeting-ordinal", event.index],
        ["meeting-location", event.endpoint ? `At ${event.endpoint}` : distanceText(event.position)],
        ["meeting-time", timeText(event.time)]
      ]) {
        const span = document.createElement("span");
        span.className = className;
        span.textContent = text;
        button.appendChild(span);
      }
      button.addEventListener("click", () => selectMeeting(event.index));
      el.meetingList.appendChild(button);
      return button;
    });
  }

  function buildTrackTicks() {
    el.trackMeetingTicks.replaceChildren();
    const locations = new Map();
    state.model.events.forEach(event => {
      const key = `${event.position.n}/${event.position.d}`;
      if (!locations.has(key)) locations.set(key, []);
      locations.get(key).push(event);
    });
    trackTicks = [...locations.values()].map(events => {
      const x = 65 + 930 * events[0].x;
      const node = svg("line", { x1: x, x2: x, y1: 101, y2: 108, class: "meeting-tick" }, el.trackMeetingTicks);
      svg("title", {}, node, `Meetings ${events.map(event => event.index).join(", ")}`);
      return { node, events };
    });
  }

  function buildRoutes() {
    routeViews = [];
    const event = selectedEvent();
    const continuous = state.model.continuous;
    el.continuousNotice.hidden = !continuous;
    el.discreteDetail.hidden = continuous;
    el.meetingPosition.hidden = continuous;
    if (continuous) {
      setText(el.detailTitle, "Every instant, together");
      setText(el.detailSubtitle, "Same start. Same speed. One shared path.");
      return;
    }
    setText(el.detailTitle, `Inside meeting #${event.index}`);
    setText(el.detailSubtitle, `Replay from departure to ${timeText(event.time)}. Both arrive at the same position.`);
    setText(el.meetingPosition, event.endpoint ? `Meeting at ${event.endpoint}` : `${distanceText(event.position)} from A`);
    const root = el.routeSvg;
    root.replaceChildren();
    svg("title", { id: "routeTitle" }, root, `Folded journeys to meeting ${event.index}`);
    svg("desc", { id: "routeDesc" }, root, "Each full horizontal leg is S. Turns connect rows without adding distance. The dotted vertical line marks the meeting position.");
    const routes = state.model.ratio.map((speed, i) => M.routeAt(speed, state.model.starts[i], event.t));
    const firstY = 117;
    const secondY = firstY + (routes[0].length - 1) * ROUTE.gap + 80;
    const finalY = secondY + (routes[1].length - 1) * ROUTE.gap;
    attrs(root, { viewBox: `0 0 1060 ${finalY + 37}` });
    const defs = svg("defs", {}, root);
    ["one", "two"].forEach((name, i) => {
      const marker = svg("marker", { id: `arrow-${name}`, markerWidth: 7, markerHeight: 7, refX: 5, refY: 3.5, orient: "auto", markerUnits: "userSpaceOnUse" }, defs);
      svg("path", { d: "M0 0 L7 3.5 L0 7 Z", fill: i === 0 ? "#27566c" : "#c66553" }, marker);
    });
    svg("line", { x1: ROUTE.left, x2: ROUTE.right, y1: 35, y2: 35, class: "route-reference" }, root);
    [ROUTE.left, ROUTE.right].forEach(x => svg("line", { x1: x, x2: x, y1: 29, y2: 41, class: "route-reference" }, root));
    svg("text", { x: 64, y: 40, class: "graph-end-label" }, root, "A");
    svg("text", { x: 991, y: 40, class: "graph-end-label" }, root, "B");
    svg("text", { x: 530, y: 22, "text-anchor": "middle", class: "route-end-label" }, root, "S");
    const meetingX = routeX(event.x);
    svg("line", { x1: meetingX, x2: meetingX, y1: 42, y2: finalY + 18, class: "route-guide" }, root);
    svg("circle", { cx: meetingX, cy: 35, r: 4, fill: "#b38b39" }, root);
    svg("text", { x: meetingX, y: 61, "text-anchor": "middle", class: "route-end-label" }, root, `#${event.index}`);

    routes.forEach((segments, i) => {
      const name = i === 0 ? "one" : "two";
      const startY = i === 0 ? firstY : secondY;
      const group = svg("g", { class: `route-${name}` }, root);
      svg("text", { x: ROUTE.left, y: startY - 23, class: "route-caption" }, group, `PERSON ${i + 1} · starts at ${state.model.starts[i]}`);
      const rows = segments.map((segment, j) => {
        const y = startY + j * ROUTE.gap;
        const x1 = routeX(segment.from), x2 = routeX(segment.to);
        let turn;
        if (j > 0) {
          const previousY = y - ROUTE.gap;
          const curveX = x1 + (segment.from === 0 ? -17 : 17);
          const d = `M${x1} ${previousY} C${curveX} ${previousY},${curveX} ${y},${x1} ${y}`;
          svg("path", { d, class: "route-ghost" }, group);
          turn = svg("path", { d, class: "route-turn", visibility: "hidden" }, group);
        }
        svg("line", { x1, x2, y1: y, y2: y, class: "route-ghost" }, group);
        const path = svg("line", { x1, x2: x1, y1: y, y2: y, class: "route-path", "marker-end": `url(#arrow-${name})`, visibility: "hidden" }, group);
        const length = segment.length === 1 ? "S" : distanceText(M.fraction(event.distances[i].n % event.distances[i].d, event.distances[i].d));
        svg("text", { x: 35, y: y + 4, class: "route-leg-label" }, group, String(j + 1).padStart(2, "0"));
        svg("text", { x: (x1 + x2) / 2, y: y - 7, "text-anchor": "middle", class: "route-leg-label" }, group, length);
        return { segment, y, path, turn };
      });
      const dot = svg("circle", { cx: routeX(segments[0].from), cy: startY, r: 6, class: "route-moving-dot" }, group);
      routeViews.push({ rows, dot });
    });
    el.routeScroll.scrollTop = 0;
    buildEquations(event);
  }

  function buildEquations(event) {
    setText(el.equationContext, `At meeting #${event.index}: d₁ = ${distanceText(event.distances[0])} and d₂ = ${distanceText(event.distances[1])}`);
    el.equations.replaceChildren();
    event.relations.forEach(relation => {
      const block = document.createElement("div");
      const difference = relation.kind === "difference";
      const expression = document.createElement("span");
      expression.textContent = `${difference ? "|d₁ − d₂|" : "d₁ + d₂"} = ${relation.multiple === 1 ? "S" : `${relation.multiple}S`}`;
      const substitution = document.createElement("span");
      substitution.className = "substitution";
      substitution.textContent = `${difference ? "|" : ""}${distanceText(event.distances[0])} ${difference ? "−" : "+"} ${distanceText(event.distances[1])}${difference ? "|" : ""} = ${relation.multiple}S`;
      block.append(expression, substitution);
      el.equations.appendChild(block);
    });
    const sameStart = state.model.starts[0] === state.model.starts[1];
    setText(el.equationExplanation, `${sameStart ? "A shared start gives even multiples of S." : "Opposite starts give odd multiples of S."}${event.relations.length === 2 ? " At this endpoint meeting, both the sum and difference relations hold." : " The folds show why this relation holds at this meeting."}`);
  }

  function renderRoutes() {
    if (state.model.continuous) return;
    const event = selectedEvent();
    const progress = state.stage === "detail" ? state.detail : 0;
    const complete = progress >= 1;
    routeViews.forEach((view, i) => {
      const distance = state.model.ratio[i] * event.t * progress;
      view.rows.forEach(({ segment, path, turn }) => {
        const length = clamp(distance - segment.leg, 0, segment.length);
        const position = segment.from + (segment.from === 0 ? length : -length);
        attrs(path, { x2: routeX(position), visibility: length > 1e-10 ? "visible" : "hidden" });
        if (turn) turn.setAttribute("visibility", distance > segment.leg + 1e-10 ? "visible" : "hidden");
      });
      const currentLeg = clamp(Math.ceil(distance - 1e-10) - 1, 0, view.rows.length - 1);
      const row = view.rows[currentLeg];
      const consumed = clamp(distance - currentLeg, 0, row.segment.length);
      const position = row.segment.from + (row.segment.from === 0 ? consumed : -consumed);
      attrs(view.dot, { cx: routeX(position), cy: row.y });
      setText(el[`distance${i + 1}`], `d${i === 0 ? "₁" : "₂"} = ${complete ? distanceText(event.distances[i]) : `${approximate(distance)}S`}`);
    });
    el.detailProgressSlider.value = progress;
    setText(el.detailProgressText, `${Math.round(progress * 100)}%`);
    setText(el.detailPlayButton, state.stage === "detail" && state.playing ? "Ⅱ Pause replay" : complete ? "↺ Replay again" : "▶ Play replay");
    el.equationBox.classList.toggle("revealed", complete);
    el.equationResult.hidden = !complete;
    setText(el.equationPrompt, complete ? "The journeys reveal the equation." : state.stage === "detail" ? "Watch the distances accumulate. The equation appears when they meet." : "Replay the selected meeting to reveal its distance equation.");
  }

  function render() {
    const { model } = state;
    const event = selectedEvent();
    const detail = state.stage === "detail" && event;
    const time = detail ? event.t * state.detail : model.period * state.overview;
    const revealedTime = detail ? model.period : time;
    const unavailable = state.invalidSettings || state.invalidMeeting;
    const reached = model.events.filter(meeting => meeting.t <= time + 1e-10).length;
    const selectedComplete = detail && state.detail >= 1;
    const progress = detail ? state.detail : state.overview;
    const positions = model.ratio.map((speed, i) => M.positionAt(speed, model.starts[i], time));
    positions.forEach((position, i) => {
      el[`traveller${i + 1}`].setAttribute("transform", `translate(${65 + 930 * position} 0)`);
      const where = position < 1e-9 ? "at A" : position > 1 - 1e-9 ? "at B" : `${approximate(position)}S from A`;
      setText(el[`position${i + 1}`], where);
      attrs(graph.dots[i], { cx: plotX(time), cy: plotY(position) });
    });
    attrs(graph.cursor, { x1: plotX(time), x2: plotX(time) });
    graph.clip.setAttribute("width", 4 + (PLOT.right - PLOT.left) * revealedTime / model.period + (revealedTime >= model.period ? 4 : 0));
    model.events.forEach((meeting, i) => {
      const future = meeting.t > revealedTime + 1e-10;
      const selected = meeting.index === state.selected;
      graph.markers[i].classList.toggle("future", future);
      graph.markers[i].classList.toggle("selected", selected);
      graph.markers[i].setAttribute("tabindex", state.invalidSettings || (future && !selected) ? "-1" : "0");
      graph.markers[i].setAttribute("aria-pressed", String(selected));
      const button = meetingButtons[i];
      button.classList.toggle("selected", selected);
      button.classList.toggle("reached", meeting.t <= time + 1e-10);
      button.setAttribute("aria-pressed", String(selected));
      button.disabled = state.invalidSettings;
    });
    trackTicks.forEach(({ node, events }) => node.setAttribute("visibility", events.some(meeting => meeting.t <= revealedTime + 1e-10) ? "visible" : "hidden"));
    const atMeeting = model.continuous || selectedComplete || model.events.some(meeting => Math.abs(meeting.t - time) < 0.012);
    el.meetingHalo.setAttribute("visibility", atMeeting ? "visible" : "hidden");
    el.meetingHalo.setAttribute("transform", `translate(${65 + 930 * positions[0]} 0)`);
    setText(el.trackStatus, model.continuous ? "Moving together continuously" : selectedComplete ? `Meeting #${event.index} reached` : state.hold > 0 ? "Both are back at their starting ends" : `${reached} of ${model.events.length} meetings reached`);

    el.overviewTab.classList.toggle("active", !detail);
    el.detailTab.classList.toggle("active", Boolean(detail));
    el.overviewTab.setAttribute("aria-pressed", String(!detail));
    el.detailTab.setAttribute("aria-pressed", String(Boolean(detail)));
    setText(el.overviewTitle, detail ? `On the way to meeting #${event.index}` : "The whole journey");
    setText(el.graphNote, detail ? "Full period shown · cursor follows replay" : "A at the top · B at the bottom");
    setText(el.progressLabel, detail ? "Selected-meeting progress" : "Full-period progress");
    el.progressSlider.setAttribute("aria-label", detail ? "Selected meeting progress" : "Full period progress");
    el.progressSlider.value = progress;
    el.progressSlider.setAttribute("aria-valuetext", `${Math.round(progress * 100)} percent of ${detail ? "the selected meeting replay" : "the shared period"}`);
    setText(el.timeReadout, selectedComplete ? `${timeText(event.time)} / T` : `${approximate(time / model.period)}T / T`);
    const ready = !detail && state.overview === 0;
    setText(el.playLabel, state.playing ? "Pause" : progress >= 1 ? "Play again" : ready ? "Play lesson" : "Play");
    setText(el.playIcon, state.playing ? "Ⅱ" : "▶");
    el.playButton.disabled = unavailable;
    el.replayButton.disabled = unavailable || model.continuous;
    el.detailTab.disabled = unavailable || model.continuous;
    el.overviewTab.disabled = unavailable;
    el.progressSlider.disabled = unavailable;
    el.detailPlayButton.disabled = unavailable;
    el.detailProgressSlider.disabled = unavailable;
    el.detailProgressSlider.setAttribute("aria-valuetext", `${Math.round(state.detail * 100)} percent of the selected meeting replay`);
    el.meetingNumber.disabled = state.invalidSettings || model.continuous;
    setText(el.stageBadge, unavailable ? "CHECK YOUR INPUTS" : selectedComplete ? "MEETING REACHED" : state.hold > 0 ? "PERIOD COMPLETE" : state.playing ? `PLAYING ${detail ? "02" : "01"}` : ready ? "READY TO EXPLORE" : "PAUSED");
    let status;
    if (unavailable) status = "Correct the highlighted input to continue.";
    else if (selectedComplete) status = `Meeting #${event.index} reached. Compare the distances and equation below.`;
    else if (state.hold > 0) status = "One shared period complete. Next: trace the selected meeting.";
    else if (detail) status = state.playing ? `Replaying meeting #${event.index}. Each fold adds another full length S.` : "Play or scrub the replay to trace the two journeys.";
    else if (model.continuous && state.overview >= 1) status = "One shared period complete. They stayed together throughout.";
    else if (state.playing) status = model.continuous ? "The paths overlap. Both people return to their starting endpoint together." : "Every intersection is a meeting. The selected-meeting replay follows automatically.";
    else status = ready ? "Press Play lesson to watch one complete period, followed by the selected meeting." : "Paused. Scrub the timeline, or press Play to continue.";
    setText(el.playbackStatus, status);
    renderRoutes();
  }

  function stop() {
    state.playing = false;
    state.lastTimestamp = null;
    if (state.frame !== null) cancelAnimationFrame(state.frame);
    state.frame = null;
  }

  function scrollToDetail() {
    document.querySelector(".detail-panel").scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
  }

  function tick(timestamp) {
    state.frame = null;
    if (!state.playing) return;
    const elapsed = state.lastTimestamp === null ? 0 : Math.min((timestamp - state.lastTimestamp) / 1000, 0.1);
    state.lastTimestamp = timestamp;
    if (state.stage === "overview") {
      if (state.overview < 1) {
        state.overview = Math.min(1, state.overview + elapsed * state.rate / 16);
        if (state.overview >= 1) {
          if (state.model.continuous) stop();
          else state.hold = 0.75;
        }
      } else {
        state.hold -= elapsed;
        if (state.hold <= 0) {
          state.hold = 0;
          state.stage = "detail";
          state.detail = 0;
          scrollToDetail();
        }
      }
    } else {
      state.detail = Math.min(1, state.detail + elapsed * state.rate / 8);
      if (state.detail >= 1) stop();
    }
    render();
    if (state.playing) state.frame = requestAnimationFrame(tick);
  }

  function play() {
    if (state.invalidSettings || state.invalidMeeting) return;
    if (state[state.stage] >= 1 && state.hold <= 0) state[state.stage] = 0;
    state.playing = true;
    state.lastTimestamp = null;
    render();
    if (state.frame === null) state.frame = requestAnimationFrame(tick);
  }

  function togglePlay() { if (state.playing) { stop(); render(); } else play(); }

  function restart() {
    stop();
    state.stage = "overview";
    state.overview = 0;
    state.detail = 0;
    state.hold = 0;
    el.routeScroll.scrollTop = 0;
    render();
  }

  function selectMeeting(index) {
    if (state.invalidSettings) return;
    stop();
    state.selected = index;
    state.invalidMeeting = false;
    state.detail = 0;
    state.hold = 0;
    el.meetingNumber.value = index;
    el.meetingNumber.removeAttribute("aria-invalid");
    el.meetingError.hidden = true;
    buildRoutes();
    render();
  }

  function changeStage(stage, scroll = false) {
    if (state.invalidSettings || state.invalidMeeting || (stage === "detail" && state.model.continuous)) return;
    stop();
    state.stage = stage;
    state.hold = 0;
    render();
    if (scroll) scrollToDetail();
  }

  function replay() {
    if (state.model.continuous || state.invalidSettings || state.invalidMeeting) return;
    changeStage("detail");
    state.detail = 0;
    el.routeScroll.scrollTop = 0;
    play();
    scrollToDetail();
  }

  function rebuild() {
    stop();
    const ratio = [el.speed1.valueAsNumber, el.speed2.valueAsNumber];
    const invalid = ratio.map(speed => !Number.isInteger(speed) || speed < 1 || speed > 12);
    [el.speed1, el.speed2].forEach((input, i) => input.setAttribute("aria-invalid", String(invalid[i])));
    state.invalidSettings = invalid.some(Boolean);
    el.settingsError.hidden = !state.invalidSettings;
    if (state.invalidSettings) {
      setText(el.settingsError, "Use whole numbers from 1 to 12 for each speed. The last valid experiment is shown.");
      render();
      return;
    }
    state.model = M.analyzeMotion({ ratio, starts: [el.start1.value, el.start2.value] });
    state.invalidMeeting = false;
    state.selected = Math.min(state.selected, state.model.events.length) || 1;
    el.meetingNumber.value = state.model.continuous ? "" : state.selected;
    el.meetingNumber.max = Math.max(1, state.model.events.length);
    el.meetingNumber.removeAttribute("aria-invalid");
    el.meetingError.hidden = true;
    setText(el.meetingHint, state.model.continuous ? "No separate meetings to number." : `Choose any of the ${state.model.events.length} meetings.`);
    setText(el.ratioSummary, `Reduced ratio ${state.model.ratio[0]} : ${state.model.ratio[1]}`);
    setText(el.periodSummary, `Both return home after ${state.model.ratio[0]} and ${state.model.ratio[1]} round trips. T is this shared period.`);
    buildGraph();
    buildNotebook();
    buildTrackTicks();
    buildRoutes();
    restart();
  }

  el.settingsForm.addEventListener("submit", event => { event.preventDefault(); rebuild(); });
  [el.speed1, el.speed2, el.start1, el.start2].forEach(input => input.addEventListener("change", rebuild));
  // Pause as a ratio is edited; commit only complete changes, so typing '12' is natural.
  [el.speed1, el.speed2].forEach(input => input.addEventListener("input", () => {
    stop();
    render();
    if (!input.validity.valid || input.value === "") rebuild();
  }));
  el.meetingNumber.addEventListener("change", () => {
    const index = el.meetingNumber.valueAsNumber;
    if (!Number.isInteger(index) || index < 1 || index > state.model.events.length) {
      stop();
      state.invalidMeeting = true;
      el.meetingNumber.setAttribute("aria-invalid", "true");
      setText(el.meetingError, `Choose a whole-number meeting from 1 to ${state.model.events.length}.`);
      el.meetingError.hidden = false;
      render();
    } else selectMeeting(index);
  });
  el.playbackRate.addEventListener("change", () => { state.rate = Number(el.playbackRate.value); });
  el.playButton.addEventListener("click", togglePlay);
  el.restartButton.addEventListener("click", restart);
  el.replayButton.addEventListener("click", replay);
  el.overviewTab.addEventListener("click", () => changeStage("overview"));
  el.detailTab.addEventListener("click", () => changeStage("detail", true));
  el.progressSlider.addEventListener("input", () => { stop(); state.hold = 0; state[state.stage] = Number(el.progressSlider.value); render(); });
  el.detailProgressSlider.addEventListener("input", () => { stop(); state.stage = "detail"; state.hold = 0; state.detail = Number(el.detailProgressSlider.value); render(); });
  el.detailPlayButton.addEventListener("click", () => {
    if (state.stage !== "detail") { changeStage("detail"); play(); }
    else togglePlay();
  });
  // Avoid a time jump when a background tab becomes visible again.
  document.addEventListener("visibilitychange", () => { state.lastTimestamp = null; });
  rebuild();
})();
