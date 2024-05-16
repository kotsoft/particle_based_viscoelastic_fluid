// Options
let numParticles = 2000;

// Setup a simulation
const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let simulator = new Simulator(canvas.width, canvas.height, numParticles);
simulator.running = true;

const fpsMonitor = new FPSMonitor();

function loop() {
  simulator.update();
  fpsMonitor.update();

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  simulator.draw(ctx);

  requestAnimationFrame(loop);
}

loop();

// Event listeners
const materialSliders = ["restDensity", "stiffness", "nearStiffness", "springStiffness", "plasticity", "yieldRatio", "minDistRatio", "linViscosity", "quadViscosity", "kernelRadius", "pointSize", "gravX", "gravY", "dt"];

for (let sliderId of materialSliders) {
  let slider = document.getElementById(sliderId);

  if (slider) {
    slider.addEventListener("input", (e) => {
      simulator.material[sliderId] = e.target.value;
    });
  }
}

document.getElementById("startButton").addEventListener("click", () => {
  for (let sliderId of materialSliders) {
    let slider = document.getElementById(sliderId);

    if (slider) {
      simulator.material[sliderId] = slider.value;
    }
  }

  simulator.start();
});

document.getElementById("pauseButton").addEventListener("click", () => {
  simulator.pause();
});

document.getElementById("stepButton").addEventListener("click", () => {
  simulator.running = true;
  simulator.update();
  simulator.running = false;
});

document.getElementById("resetButton").addEventListener("click", () => {
  simulator = new Simulator(canvas.width, canvas.height, numParticles);
});

let collapseButton = document.getElementById("collapseButton");

if (collapseButton) {
  document.getElementById("collapseButton").addEventListener("click", () => {
    let controls = document.getElementById("controls");

    if (controls.style.display == "none") {
      controls.style.display = "block";
      collapseButton.innerText = "Collapse";
    } else {
      controls.style.display = "none";
      collapseButton.innerText = "Expand";
    }
  });
}

document.getElementById("numParticles").addEventListener("input", (e) => {
  if (e.target.value == numParticles) {
    return;
  }

  numParticles = e.target.value;
  simulator = new Simulator(canvas.width, canvas.height, numParticles);
});

{
  let useSpatialHash = document.getElementById("useSpatialHash")

  if (useSpatialHash) {
    useSpatialHash.addEventListener("change", (e) => {
      simulator.useSpatialHash = e.target.checked;
    });
  }
}

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  simulator.resize(canvas.width, canvas.height);
});

window.addEventListener("pointermove", (e) => {
  simulator.mouseX = e.clientX;
  simulator.mouseY = e.clientY;
});

window.addEventListener("pointerdown", (e) => {
  // Account for first-frame drags (mobile primarily)
  simulator.mouseX = e.clientX;
  simulator.mouseY = e.clientY;
  simulator.mousePrevX = e.clientX;
  simulator.mousePrevY = e.clientY;

  if (e.button == 0) {
    simulator.drag = true;
  }
});

window.addEventListener("pointerup", (e) => {
  if (e.button == 0) {
    simulator.drag = false;
  }
});

const actionKeys = { "e": "emit", "d": "drain", "a": "attract", "r": "repel" };

window.addEventListener("keydown", (e) => {
  if (actionKeys[e.key]) {
    simulator[actionKeys[e.key]] = true;
  }
});

window.addEventListener("keyup", (e) => {
  if (actionKeys[e.key]) {
    simulator[actionKeys[e.key]] = false;
  }
});

window.addEventListener("blur", () => {
  for (let key in actionKeys) {
    simulator[actionKeys[key]] = false;
  }

  simulator.drag = false;
});
