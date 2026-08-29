# Minkowski Spacetime Explorer

A dependency-free interactive visualization of Lorentz transformations and the relativity of simultaneity in one space dimension. Earth and rocket coordinates can be selected independently from the frame whose axes are displayed upright.

## Run

Open `index.html` directly in a modern browser. No build step, package installation, or local server is required.

## Interact

- Set the rocket velocity with the slider or exact beta field.
- Choose Earth or rocket coordinates to animate the grid and projection readouts into that observer's frame while the events remain fixed on screen.
- Choose Earth or rocket perspective to make that frame's axes horizontal and vertical.
- Scroll over the graph to zoom uniformly around the pointer, or use the zoom and Fit events buttons below the graph.
- Select Event A or B, then click the diagram or enter exact coordinates to move it.
- Drag either event directly, or focus its handle and use the arrow keys. Hold Shift for one-unit keyboard steps.
- Read each event's position and time at its labeled projection feet on the selected frame's axes.
- Compare the events' selected-frame time difference. When it is within 0.01 seconds, the explorer acknowledges simultaneity and highlights their shared line of simultaneity.

Positions use light-seconds and times use seconds, so `c = 1` numerically and light always follows a 45-degree path.

## Test

Run the Lorentz geometry checks with:

```sh
node --test geometry.test.js
```
