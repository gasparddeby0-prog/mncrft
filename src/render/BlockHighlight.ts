/**
 * A thin wireframe cube drawn around the block the player is looking at,
 * mirroring Minecraft's black block outline.
 */

import * as THREE from 'three';

export class BlockHighlight {
  readonly object: THREE.LineSegments;

  constructor() {
    // A unit cube slightly enlarged so the outline sits just outside the block.
    const box = new THREE.BoxGeometry(1.002, 1.002, 1.002);
    const edges = new THREE.EdgesGeometry(box);
    const material = new THREE.LineBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.4,
      depthTest: true,
    });
    this.object = new THREE.LineSegments(edges, material);
    this.object.visible = false;
    this.object.renderOrder = 2;
  }

  showAt(bx: number, by: number, bz: number): void {
    this.object.position.set(bx + 0.5, by + 0.5, bz + 0.5);
    this.object.visible = true;
  }

  hide(): void {
    this.object.visible = false;
  }

  dispose(): void {
    this.object.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
  }
}
