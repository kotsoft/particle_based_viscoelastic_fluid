class Particle {
  constructor(posX, posY, velX, velY) {
    this.posX = posX;
    this.posY = posY;

    this.prevX = posX;
    this.prevY = posY;

    this.velX = velX;
    this.velY = velY;
  }
}

class Simulator {
  constructor(width, height, numParticles) {
    this.running = false;

    this.width = width;
    this.height = height;

    this.gravX = 0.0;
    this.gravY = 0.5;

    this.particles = [];
    this.addParticles(numParticles);

    this.screenX = window.screenX;
    this.screenY = window.screenY;
  }

  start() { this.running = true; }
  pause() { this.running = false; }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  addParticles(count) {
    for (let i = 0; i < count; i++) {
      const posX = Math.random() * this.width;
      const posY = Math.random() * this.height;
      const velX = Math.random() * 2 - 1;
      const velY = Math.random() * 2 - 1;

      this.particles.push(new Particle(posX, posY, velX, velY));
    }
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(-5, -5);

    ctx.fillStyle = "#0066FF";

    for (let p of this.particles) {
      ctx.fillRect(p.posX, p.posY, 10, 10);
    }

    ctx.restore();
  }

  // Algorithm 1: Simulation step
  update(dt = 1) {
    if (!this.running) {
      return;
    }

    const screenMoveX = window.screenX - this.screenX;
    const screenMoveY = window.screenY - this.screenY;

    this.screenX = window.screenX;
    this.screenY = window.screenY;

    for (let p of this.particles) {
      // apply gravity
      p.velX += this.gravX * dt;
      p.velY += this.gravY * dt;

      p.posX -= screenMoveX;
      p.posY -= screenMoveY;
    }

    this.applyViscosity(dt);

    for (let p of this.particles) {
      // save previous position
      p.prevX = p.posX;
      p.prevY = p.posY;

      // advance to predicted position
      p.posX += p.velX * dt;
      p.posY += p.velY * dt;
    }

    this.adjustSprings(dt);
    this.applySpringDisplacements(dt);
    this.doubleDensityRelaxation(dt);
    this.resolveCollisions(dt);

    for (let p of this.particles) {
      // use previous position to calculate new velocity
      p.velX = (p.posX - p.prevX) / dt;
      p.velY = (p.posY - p.prevY) / dt;
    }
  }

  doubleDensityRelaxation(dt) {
    const numParticles = this.particles.length;
    const kernelRadius = 40; // h
    const kernelRadiusSq = kernelRadius * kernelRadius;

    const restDensity = 2;
    const stiffness = 1.0;
    const nearStiffness = .5;

    // Neighbor cache
    const neighborIndices = [];
    const neighborUnitX = [];
    const neighborUnitY = [];
    const neighborCloseness = [];

    for (let i = 0; i < numParticles; i++) {
      let p0 = this.particles[i];

      let density = 0;
      let nearDensity = 0;

      let numNeighbors = 0;

      // Compute density and near-density
      for (let j = 0; j < numParticles; j++) {
        if (i === j) {
          continue;
        }

        let p1 = this.particles[j];

        const diffX = p1.posX - p0.posX;

        if (diffX > kernelRadius || diffX < -kernelRadius) {
          continue;
        }

        const diffY = p1.posY - p0.posY;

        if (diffY > kernelRadius || diffY < -kernelRadius) {
          continue;
        }

        const rSq = diffX * diffX + diffY * diffY;

        if (rSq < kernelRadiusSq) {
          const r = Math.sqrt(rSq);
          const q = r / kernelRadius;
          const closeness = 1 - q;
          const closenessSq = closeness * closeness;

          density += closeness * closeness;
          nearDensity += closeness * closenessSq;

          neighborIndices[numNeighbors] = j;
          neighborUnitX[numNeighbors] = diffX / r;
          neighborUnitY[numNeighbors] = diffY / r;
          neighborCloseness[numNeighbors] = closeness;
          numNeighbors++;
        }
      }

      // Add wall density
      const closestX = Math.min(p0.posX, this.width - p0.posX);
      const closestY = Math.min(p0.posY, this.height - p0.posY);

      if (closestX < kernelRadius) {
        const q = closestX / kernelRadius;
        const closeness = 1 - q;
        const closenessSq = closeness * closeness;

        density += closeness * closeness;
        nearDensity += closeness * closenessSq;
      }

      if (closestY < kernelRadius) {
        const q = closestY / kernelRadius;
        const closeness = 1 - q;
        const closenessSq = closeness * closeness;

        density += closeness * closeness;
        nearDensity += closeness * closenessSq;
      }

      // Compute pressure and near-pressure
      const pressure = stiffness * (density - restDensity);
      const nearPressure = nearStiffness * nearDensity;

      let dispX = 0;
      let dispY = 0;

      for (let j = 0; j < numNeighbors; j++) {
        let p1 = this.particles[neighborIndices[j]];

        const closeness = neighborCloseness[j];
        const D = dt * dt * (pressure * closeness + nearPressure * closeness * closeness) / 2;
        const DX = D * neighborUnitX[j];
        const DY = D * neighborUnitY[j];

        p1.posX += DX;
        p1.posY += DY;

        dispX -= DX;
        dispY -= DY;
      }

      p0.posX += dispX;
      p0.posY += dispY;
    }
  }

  applySpringDisplacements(dt) { }
  adjustSprings(dt) { }
  applyViscosity(dt) { }
  resolveCollisions(dt) {
    const boundaryMul = 1.5 * dt; // 1 is no bounce, 2 is full bounce
    const boundaryMinX = 5;
    const boundaryMaxX = this.width - 5;
    const boundaryMinY = 5;
    const boundaryMaxY = this.height - 5;


    for (let p of this.particles) {
      if (p.posX < boundaryMinX) {
        p.posX += boundaryMul * (boundaryMinX - p.posX);
      } else if (p.posX > boundaryMaxX) {
        p.posX += boundaryMul * (boundaryMaxX - p.posX);
      }

      if (p.posY < boundaryMinY) {
        p.posY += boundaryMul * (boundaryMinY - p.posY);
      } else if (p.posY > boundaryMaxY) {
        p.posY += boundaryMul * (boundaryMaxY - p.posY);
      }
    }
  }
}
