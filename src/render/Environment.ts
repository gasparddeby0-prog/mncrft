/**
 * Sky, lighting, day/night cycle and weather.
 *
 * Drives a full day/night cycle: the sun (a directional light) sweeps across
 * the sky while ambient, hemisphere and sky colours interpolate between day,
 * sunset and night palettes. Distance fog matched to the sky colour hides
 * chunk pop-in at the render-distance edge.
 *
 * Weather is a real particle system (THREE.Points) that follows the camera:
 *  - rain  : fast translucent streaks
 *  - storm : rain + random lightning flashes that briefly light the world
 *  - snow  : slow drifting flakes
 */

import * as THREE from 'three';
import { DAY_LENGTH_SECONDS } from '../constants';

export type Weather = 'clear' | 'rain' | 'storm' | 'snow';

const COLOR_DAY = new THREE.Color(0x88bbff);
const COLOR_SUNSET = new THREE.Color(0xffa459);
const COLOR_NIGHT = new THREE.Color(0x05070f);
const COLOR_OVERCAST = new THREE.Color(0x6b7280);

const PARTICLE_RANGE = 28;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class Environment {
  /** 0 = sunrise, 0.25 = noon, 0.5 = sunset, 0.75 = midnight. */
  timeOfDay = 0.05;
  weather: Weather = 'clear';

  /** Multiplies the rate of time. 1 = real time over DAY_LENGTH_SECONDS. */
  timeScale = 1;

  private readonly sun = new THREE.DirectionalLight(0xffffff, 1);
  private readonly moon = new THREE.DirectionalLight(0x8899bb, 0.0);
  private readonly ambient = new THREE.AmbientLight(0xffffff, 0.4);
  private readonly hemisphere = new THREE.HemisphereLight(0x88bbff, 0x554433, 0.5);

  private readonly skyColor = new THREE.Color();
  private readonly fog: THREE.Fog;

  private rain: THREE.Points;
  private snow: THREE.Points;
  private rainVel: Float32Array;
  private snowPhase: Float32Array;

  private flash = 0;
  private nextStrike = 4;

  constructor(private readonly scene: THREE.Scene) {
    this.sun.position.set(50, 100, 30);
    scene.add(this.sun);
    scene.add(this.sun.target);
    scene.add(this.moon);
    scene.add(this.moon.target);
    scene.add(this.ambient);
    scene.add(this.hemisphere);

    this.fog = new THREE.Fog(COLOR_DAY.getHex(), 32, 220);
    scene.fog = this.fog;
    scene.background = this.skyColor;

    const rainBuilt = this.buildRain();
    this.rain = rainBuilt.points;
    this.rainVel = rainBuilt.velocities;
    scene.add(this.rain);

    const snowBuilt = this.buildSnow();
    this.snow = snowBuilt.points;
    this.snowPhase = snowBuilt.phases;
    scene.add(this.snow);

    this.applyWeatherVisibility();
  }

  /** Distance at which fog fully hides geometry (tied to render distance). */
  setFogFar(far: number): void {
    this.fog.far = far;
    this.fog.near = far * 0.35;
  }

  setWeather(weather: Weather): void {
    this.weather = weather;
    this.applyWeatherVisibility();
  }

  cycleWeather(): Weather {
    const order: Weather[] = ['clear', 'rain', 'storm', 'snow'];
    const next = order[(order.indexOf(this.weather) + 1) % order.length];
    this.setWeather(next);
    return next;
  }

  private applyWeatherVisibility(): void {
    this.rain.visible = this.weather === 'rain' || this.weather === 'storm';
    this.snow.visible = this.weather === 'snow';
  }

  /** Human-readable clock for the debug HUD (24h based on timeOfDay). */
  get clock(): string {
    // timeOfDay 0 -> 06:00 (sunrise), 0.25 -> 12:00, 0.5 -> 18:00, 0.75 -> 00:00.
    const hours = (this.timeOfDay * 24 + 6) % 24;
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  update(dt: number, cameraPos: THREE.Vector3): void {
    this.timeOfDay = (this.timeOfDay + (dt * this.timeScale) / DAY_LENGTH_SECONDS) % 1;

    // Sun travels a full circle; angle 0 at sunrise (east horizon).
    const angle = this.timeOfDay * Math.PI * 2;
    const sunHeight = Math.sin(angle); // -1 (midnight) .. 1 (noon)
    const sunX = Math.cos(angle);

    // Position lights relative to the camera so directional lighting stays consistent as the player moves.
    this.sun.position.set(cameraPos.x + sunX * 100, cameraPos.y + sunHeight * 100, cameraPos.z + 40);
    this.sun.target.position.copy(cameraPos);
    this.moon.position.set(cameraPos.x - sunX * 100, cameraPos.y - sunHeight * 100, cameraPos.z + 40);
    this.moon.target.position.copy(cameraPos);

    const day = clamp01(sunHeight * 1.5 + 0.35);
    const sunsetT = clamp01(1 - Math.abs(sunHeight) / 0.25) * clamp01(0.6 - Math.abs(sunHeight) + 0.4);
    const overcast = this.weather === 'rain' || this.weather === 'storm' ? 0.75 : this.weather === 'snow' ? 0.5 : 0;

    // --- Sky colour: night -> day, tinted toward sunset near the horizon. ---
    this.skyColor.copy(COLOR_NIGHT).lerp(COLOR_DAY, day);
    this.skyColor.lerp(COLOR_SUNSET, sunsetT * 0.6);
    this.skyColor.lerp(COLOR_OVERCAST, overcast * day);

    // Lightning flash brightens everything briefly.
    if (this.flash > 0) {
      this.skyColor.lerp(new THREE.Color(0xdfe6ff), this.flash);
    }

    this.fog.color.copy(this.skyColor);

    // --- Light intensities. ---
    const weatherDim = 1 - overcast * 0.55;
    this.sun.intensity = (0.15 + day * 1.0) * weatherDim + this.flash * 1.5;
    this.sun.visible = sunHeight > -0.1;
    this.moon.intensity = clamp01(-sunHeight * 1.2) * 0.25;
    this.ambient.intensity = (0.25 + day * 0.4) * weatherDim + this.flash;
    this.hemisphere.intensity = (0.2 + day * 0.35) * weatherDim;
    this.hemisphere.color.copy(this.skyColor);

    // Warmer sun toward sunset.
    this.sun.color.setHex(0xffffff).lerp(COLOR_SUNSET, sunsetT * 0.5);

    this.updateWeather(dt, cameraPos);
  }

  private updateWeather(dt: number, cameraPos: THREE.Vector3): void {
    // Decay any active lightning flash.
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 4);

    if (this.weather === 'storm') {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.flash = 1;
        this.nextStrike = 3 + Math.random() * 9;
      }
    }

    if (this.rain.visible) {
      this.rain.position.set(Math.floor(cameraPos.x), Math.floor(cameraPos.y), Math.floor(cameraPos.z));
      const pos = this.rain.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= this.rainVel[i / 3] * dt;
        arr[i] -= 6 * dt; // slight wind slant
        if (arr[i + 1] < -PARTICLE_RANGE) {
          arr[i + 1] += PARTICLE_RANGE * 2;
          arr[i] = (Math.random() * 2 - 1) * PARTICLE_RANGE;
        }
      }
      pos.needsUpdate = true;
    }

    if (this.snow.visible) {
      this.snow.position.set(Math.floor(cameraPos.x), Math.floor(cameraPos.y), Math.floor(cameraPos.z));
      const pos = this.snow.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        const idx = i / 3;
        arr[i + 1] -= 1.6 * dt;
        arr[i] += Math.sin(this.snowPhase[idx] + performance.now() * 0.001) * dt * 0.6;
        if (arr[i + 1] < -PARTICLE_RANGE) {
          arr[i + 1] += PARTICLE_RANGE * 2;
        }
      }
      pos.needsUpdate = true;
    }
  }

  private buildRain(): { points: THREE.Points; velocities: Float32Array } {
    const count = 3500;
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * PARTICLE_RANGE;
      positions[i * 3 + 1] = (Math.random() * 2 - 1) * PARTICLE_RANGE;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * PARTICLE_RANGE;
      velocities[i] = 28 + Math.random() * 14;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x9fb8ff,
      size: 0.12,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return { points, velocities };
  }

  private buildSnow(): { points: THREE.Points; phases: Float32Array } {
    const count = 2200;
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * PARTICLE_RANGE;
      positions[i * 3 + 1] = (Math.random() * 2 - 1) * PARTICLE_RANGE;
      positions[i * 3 + 2] = (Math.random() * 2 - 1) * PARTICLE_RANGE;
      phases[i] = Math.random() * Math.PI * 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.22,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    return { points, phases };
  }

  dispose(): void {
    for (const p of [this.rain, this.snow]) {
      this.scene.remove(p);
      p.geometry.dispose();
      (p.material as THREE.Material).dispose();
    }
  }
}
