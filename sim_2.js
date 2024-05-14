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

class Material {
  constructor(name, restDensity, stiffness, nearStiffness, kernelRadius) {
    this.name = name;
    this.restDensity = restDensity;
    this.stiffness = stiffness;
    this.nearStiffness = nearStiffness;
    this.kernelRadius = kernelRadius;

    this.maxPressure = 1;
  }
}

class Simulator {
  constructor(width, height, numParticles) {
    this.running = false;

    this.width = width;
    this.height = height;

    this.gravX = 0.0;
    this.gravY = 0.2;

    this.particles = [];
    this.addParticles(numParticles);

    this.screenX = window.screenX;
    this.screenY = window.screenY;

    this.useSpatialHash = true;
    this.numHashBuckets = 5000;
    this.particleListHeads = []; // Same size as numHashBuckets, each points to first particle in bucket list
    this.particleListNextIdx = []; // Same size as particles list, each points to next particle in bucket list

    this.material = new Material("water", 2, 0.5, 0.5, 40);
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

    this.populateHashGrid();

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
    const kernelRadius = this.material.kernelRadius; // h
    const kernelRadiusSq = kernelRadius * kernelRadius;
    const kernelRadiusInv = 1.0 / kernelRadius;

    const restDensity = this.material.restDensity;
    const stiffness = this.material.stiffness;
    const nearStiffness = this.material.nearStiffness;

    // Neighbor cache
    const neighborIndices = [];
    const neighborUnitX = [];
    const neighborUnitY = [];
    const neighborCloseness = [];
    const visitedBuckets = [];

    for (let i = 0; i < numParticles; i++) {
      let p0 = this.particles[i];

      let density = 0;
      let nearDensity = 0;

      let numNeighbors = 0;
      let numVisitedBuckets = 0;

      if (this.useSpatialHash) {
        // Compute density and near-density
        const bucketX = Math.floor(p0.posX * kernelRadiusInv);
        const bucketY = Math.floor(p0.posY * kernelRadiusInv);

        for (let bucketDX = -1; bucketDX <= 1; bucketDX++) {
          for (let bucketDY = -1; bucketDY <= 1; bucketDY++) {
            const bucketIdx = this.getHashBucketIdx(Math.floor(bucketX + bucketDX), Math.floor(bucketY + bucketDY));

            // Check hash collision
            let found = false;
            for (let k = 0; k < numVisitedBuckets; k++) {
              if (visitedBuckets[k] === bucketIdx) {
                found = true;
                break;
              }
            }

            if (found) {
              continue;
            }

            visitedBuckets[numVisitedBuckets] = bucketIdx;
            numVisitedBuckets++;

            let neighborIdx = this.particleListHeads[bucketIdx];

            while (neighborIdx != -1) {
              if (neighborIdx === i) {
                neighborIdx = this.particleListNextIdx[neighborIdx];
                continue;
              }

              let p1 = this.particles[neighborIdx];

              const diffX = p1.posX - p0.posX;

              if (diffX > kernelRadius || diffX < -kernelRadius) {
                neighborIdx = this.particleListNextIdx[neighborIdx];
                continue;
              }

              const diffY = p1.posY - p0.posY;

              if (diffY > kernelRadius || diffY < -kernelRadius) {
                neighborIdx = this.particleListNextIdx[neighborIdx];
                continue;
              }

              const rSq = diffX * diffX + diffY * diffY;

              if (rSq < kernelRadiusSq) {
                const r = Math.sqrt(rSq);
                const q = r * kernelRadiusInv;
                const closeness = 1 - q;
                const closenessSq = closeness * closeness;

                density += closeness * closeness;
                nearDensity += closeness * closenessSq;

                neighborIndices[numNeighbors] = neighborIdx;
                neighborUnitX[numNeighbors] = diffX / r;
                neighborUnitY[numNeighbors] = diffY / r;
                neighborCloseness[numNeighbors] = closeness;
                numNeighbors++;
              }

              neighborIdx = this.particleListNextIdx[neighborIdx];
            }
          }
        }
      } else {
        // The old n^2 way

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
      }

      // Compute pressure and near-pressure
      let pressure = stiffness * (density - restDensity);
      let nearPressure = nearStiffness * nearDensity;

      if (pressure > 1) {
        pressure = 1;
      }

      if (nearPressure > 1) {
        nearPressure = 1;
      }

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

        // p0.posX -= DX;
        // p0.posY -= DY;
      }

      p0.posX += dispX;
      p0.posY += dispY;
    }
  }

  // Mueller 10 minute physics
  getHashBucketIdx(bucketX, bucketY) {
    const h = ((bucketX * 92837111) ^ (bucketY * 689287499));
    return Math.abs(h) % this.numHashBuckets;
  }

  populateHashGrid() {
    // Clear the hash grid
    for (let i = 0; i < this.numHashBuckets; i++) {
      this.particleListHeads[i] = -1;
    }

    // Populate the hash grid
    const numParticles = this.particles.length;
    const bucketSize = this.material.kernelRadius; // Same as kernel radius
    const bucketSizeInv = 1.0 / bucketSize;

    for (let i = 0; i < numParticles; i++) {
      let p = this.particles[i];

      const bucketX = Math.floor(p.posX * bucketSizeInv);
      const bucketY = Math.floor(p.posY * bucketSizeInv);

      const bucketIdx = this.getHashBucketIdx(bucketX, bucketY);

      this.particleListNextIdx[i] = this.particleListHeads[bucketIdx];
      this.particleListHeads[bucketIdx] = i;
    }
  }

  applySpringDisplacements(dt) { }
  adjustSprings(dt) { }
  applyViscosity(dt) { }
  resolveCollisions(dt) {
    const boundaryMul = 0.5 * dt; // 1 is no bounce, 2 is full bounce
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
