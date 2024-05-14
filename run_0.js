// Options
let numParticles = 1000;

// Setup a simulation
const canvas = document.getElementById("simCanvas");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let simulator = new Simulator(canvas.width, canvas.height, numParticles);

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
document.getElementById("startButton").addEventListener("click", () => {
  simulator.start();
});

document.getElementById("pauseButton").addEventListener("click", () => {
  simulator.pause();
});

document.getElementById("resetButton").addEventListener("click", () => {
  simulator = new Simulator(canvas.width, canvas.height, numParticles);
});

document.getElementById("numParticles").addEventListener("input", (e) => {
  if (e.target.value == numParticles) {
    return;
  }

  numParticles = e.target.value;
  simulator = new Simulator(canvas.width, canvas.height, numParticles);
});

document.getElementById("useSpatialHash").addEventListener("change", (e) => {
  simulator.useSpatialHash = e.target.checked;
});

window.addEventListener("resize", () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  simulator.resize(canvas.width, canvas.height);
});
