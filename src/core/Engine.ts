/**
 * Engine — thin wrapper around the three.js renderer, scene and camera.
 *
 * Owns the WebGL context and the perspective camera, handles canvas resizing
 * and exposes a couple of graphics-quality knobs (render scale, FOV, fog far)
 * that the settings UI / game can tweak at runtime.
 */

import * as THREE from 'three';

export interface GraphicsOptions {
  fov: number;
  renderScale: number;
  antialias: boolean;
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  constructor(
    canvas: HTMLCanvasElement,
    options: Partial<GraphicsOptions> = {},
  ) {
    const opts: GraphicsOptions = {
      fov: 70,
      renderScale: 1,
      antialias: true,
      ...options,
    };

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: opts.antialias,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.setRenderScale(opts.renderScale);

    this.camera = new THREE.PerspectiveCamera(opts.fov, 1, 0.1, 1000);
    this.camera.rotation.order = 'YXZ';

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  setFov(fov: number): void {
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  /** Internal render resolution multiplier (lower = faster). */
  setRenderScale(scale: number): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2) * scale;
    this.renderer.setPixelRatio(ratio);
  }

  /** Far clip plane — keep just beyond the fog so nothing pops at the edge. */
  setViewDistance(blocks: number): void {
    this.camera.far = blocks + 64;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.renderer.dispose();
  }
}
