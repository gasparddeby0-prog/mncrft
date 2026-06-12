/**
 * Helpers for building blocky, Minecraft-style mob models out of boxes.
 *
 * Everything is modelled in *block units* (1 = one block) so models line up
 * naturally with the voxel world. Limbs are built as pivot groups whose box
 * hangs below the pivot, so the animator can swing them around the hip/shoulder
 * simply by rotating the group on the X axis.
 */

import * as THREE from 'three';

/** A simple solid-coloured box mesh centred on its own origin. */
export function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(w, h, d);
  const material = new THREE.MeshLambertMaterial({ color });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * A limb: a group whose pivot sits at the top (hip/shoulder), with the limb box
 * hanging below it. Rotating the returned group on X swings the limb.
 */
export function limb(w: number, h: number, d: number, color: number): THREE.Group {
  const group = new THREE.Group();
  const mesh = box(w, h, d, color);
  mesh.position.y = -h / 2;
  group.add(mesh);
  return group;
}

/** Dispose every geometry/material under a model group (called on despawn). */
export function disposeModel(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) mat.dispose();
  });
}
