class FPSMonitor {
  constructor(measureInterval = 1000) {
    this.measureInterval = measureInterval;
    this.lastMeasure = performance.now();
    this.frames = 0;
    this.fps = 0;

    this.fpsDisplay = document.getElementById("fps");
  }

  update() {
    this.frames++;
    const now = performance.now();
    if (now - this.lastMeasure >= this.measureInterval) {
      this.fps = this.frames / (now - this.lastMeasure) * 1000;
      this.lastMeasure = now;
      this.frames = 0;

      this.fpsDisplay.innerText = `FPS: ${this.fps.toFixed(2)}`;
    }
  }
}
