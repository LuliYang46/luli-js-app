# Two People, One Path

A dependency-free JavaScript lesson about two people moving at constant speeds between A and B. Open **index.html** directly in a modern browser. No server, build, or installation is needed.

## Explore

- Enter a whole-number speed ratio from 1–12 for each person. Equivalent ratios reduce automatically; changing a motion setting resets playback.
- Independently choose A or B as each person's start. They depart towards the other end and reverse immediately on arrival.
- Press **Play lesson** to watch one complete shared period, followed automatically by a replay to the selected meeting. At 1×, the animations last 16 and 8 seconds, with a short pause between them.
- Pause, restart, change playback speed, or scrub either animation. Choose a meeting with its number field, graph marker, or notebook entry. **Replay selected meeting** jumps straight to its explanation.
- The replay draws each travelled leg on a separate row. The turns connect rows visually and add no distance. Scroll within the route panel for longer journeys.
- When the replay reaches the meeting, exact travelled distances and the relevant sum/difference equations appear. Scrubbing to the end also reveals them.

All distances are multiples of the symbolic length **S**. Endpoints A and B are places; **d₁** and **d₂** are accumulated travelled distances.

## Mathematics

For a reduced speed ratio p:q, use speeds pS and qS per normalized time unit. Each person's round trip takes 2/p or 2/q units. Because p and q are coprime, the earliest shared return to their respective starting endpoints is T = 2 units. The graph labels time as a fraction of T; playback speed changes only the presentation.

Reflected positions are triangular waves. Their unfolded coordinates must be equal or opposite modulo 2S at a meeting. `motion.js` solves both linear integer families using reduced rational numbers, merges identical times, excludes t = 0, and includes t = T when it is a meeting. This avoids missed intersections or duplicate endpoint meetings at any animation frame rate.

At a meeting, either d₁ + d₂ or |d₁ − d₂| is an integer multiple of S. That integer is odd for opposite starts and even for a shared start. Both relations can hold at an endpoint meeting. The same location can be visited at several distinct numbered meetings.

The default 5:3 example starts at opposite endpoints. Its third meeting is at t = T/4 and halfway between A and B:

    d₁ = 2.5S, d₂ = 1.5S
    |d₁ − d₂| = S

Equal speeds with a shared start produce continuous overlap rather than separately numbered meetings. Equal speeds with opposite starts produce two midpoint meetings per period.

## Files and tests

- `motion.js`: pure calculations; exposes `MotionMath` in the browser and CommonJS exports in Node.
- `app.js`: SVG rendering, controls, and animation.
- `styles.css`: responsive presentation, using local system fonts.

Run the math checks with Node:

```sh
node --test motion.test.js
```

The tests cover all 576 allowed ratio/start combinations, independently checking completeness with piecewise-linear intersections, as well as period minimality, exact distances, equations, folded routes, and special cases.
