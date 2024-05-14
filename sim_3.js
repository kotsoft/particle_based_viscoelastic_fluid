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
    this.numActiveBuckets = 0;
    this.activeBuckets = [];
    this.particleListHeads = []; // Same size as numHashBuckets, each points to first particle in bucket list

    for (let i = 0; i < this.numHashBuckets; i++) {
      this.particleListHeads.push(-1);
      this.activeBuckets.push(0);
    }

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

    const numActiveBuckets = this.numActiveBuckets;

    const wallCloseness = [0, 0]; // x, y
    const wallDirection = [0, 0]; // x, y

    const boundaryMinX = 5;
    const boundaryMaxX = this.width - 5;
    const boundaryMinY = 5;
    const boundaryMaxY = this.height - 5;

    const softMinX = boundaryMinX + kernelRadius;
    const softMaxX = boundaryMaxX - kernelRadius;
    const softMinY = boundaryMinY + kernelRadius;
    const softMaxY = boundaryMaxY - kernelRadius;


    for (let abIdx = 0; abIdx < numActiveBuckets; abIdx++) {
      let selfIdx = this.particleListHeads[this.activeBuckets[abIdx]];

      while (selfIdx != -1) {
        let p0 = this.particles[selfIdx];

        let density = 0;
        let nearDensity = 0;

        let numNeighbors = 0;
        let numVisitedBuckets = 0;

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
              if (neighborIdx === selfIdx) {
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

        // Add wall density
        if (p0.posX < softMinX) {
          wallCloseness[0] = 1 - (softMinX - Math.max(boundaryMinX, p0.posX)) * kernelRadiusInv;
          wallDirection[0] = 1;
        } else if (p0.posX > softMaxX) {
          wallCloseness[0] = 1 - (Math.min(boundaryMaxX, p0.posX) - softMaxX) * kernelRadiusInv;
          wallDirection[0] = -1;
        } else {
          wallCloseness[0] = 0;
        }

        if (p0.posY < softMinY) {
          wallCloseness[1] = 1 - (softMinY - Math.max(boundaryMinY, p0.posY)) * kernelRadiusInv;
          wallDirection[1] = 1;
        } else if (p0.posY > softMaxY) {
          wallCloseness[1] = 1 - (Math.min(boundaryMaxY, p0.posY) - softMaxY) * kernelRadiusInv;
          wallDirection[1] = -1;
        } else {
          wallCloseness[1] = 0;
        }

        if (wallCloseness[0] > 0) {
          density += wallCloseness[0] * wallCloseness[0];
          nearDensity += wallCloseness[0] * wallCloseness[0] * wallCloseness[0];
        }

        if (wallCloseness[1] > 0) {
          density += wallCloseness[1] * wallCloseness[1];
          nearDensity += wallCloseness[1] * wallCloseness[1] * wallCloseness[1];
        }

        // Compute pressure and near-pressure
        let pressure = stiffness * (density - restDensity);
        let nearPressure = nearStiffness * nearDensity;
        let immisciblePressure = stiffness * (density - 1);

        // Clamp pressure for stability
        const pressureSum = pressure + nearPressure;

        if (pressureSum > 1) {
          const pressureMul = 1 / pressureSum;
          pressure *= pressureMul;
          nearPressure *= pressureMul;
        }


        // if (pressure > 1) {
        //   pressure = 1;
        // }

        // if (nearPressure > 1) {
        //   nearPressure = 1;
        // }

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

        if (wallCloseness[0] > 0) {
          const D = dt * dt * (0 * wallCloseness[0] + nearPressure * wallCloseness[0] * wallCloseness[0]) / 2;
          p0.posX += D * wallDirection[0];
        }

        if (wallCloseness[1] > 0) {
          const D = dt * dt * (0 * wallCloseness[1] + nearPressure * wallCloseness[1] * wallCloseness[1]) / 2;
          p0.posY += D * wallDirection[1];
        }


        p0.posX += dispX;
        p0.posY += dispY;

        selfIdx = this.particleListNextIdx[selfIdx];
      }
    }
  }

  // Mueller 10 minute physics
  getHashBucketIdx(bucketX, bucketY) {
    const h = ((bucketX * 92837111) ^ (bucketY * 689287499));
    return Math.abs(h) % this.numHashBuckets;
  }

  populateHashGrid() {
    // Clear the hash grid
    for (let i = 0; i < this.numActiveBuckets; i++) {
      this.particleListHeads[this.activeBuckets[i]] = -1;
    }

    for (let i = 0; i < this.numHashBuckets; i++) {
      this.particleListHeads[i] = -1;
    }

    this.numActiveBuckets = 0;

    // Populate the hash grid
    const numParticles = this.particles.length;
    const bucketSize = this.material.kernelRadius; // Same as kernel radius
    const bucketSizeInv = 1.0 / bucketSize;

    for (let i = 0; i < numParticles; i++) {
      let p = this.particles[i];

      const bucketX = Math.floor(p.posX * bucketSizeInv);
      const bucketY = Math.floor(p.posY * bucketSizeInv);

      const bucketIdx = this.getHashBucketIdx(bucketX, bucketY);

      const headIdx = this.particleListHeads[bucketIdx];

      if (headIdx === -1) {
        this.activeBuckets[this.numActiveBuckets] = bucketIdx;
        this.numActiveBuckets++;
      }

      this.particleListNextIdx[i] = headIdx;
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
