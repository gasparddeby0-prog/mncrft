/**
 * Materials used to render chunk geometry.
 *
 * All three share the same procedurally generated texture atlas and use vertex
 * colours (for baked ambient occlusion + directional face shading). They differ
 * only in how they treat transparency:
 *   - solid:       opaque blocks
 *   - cutout:      alpha-tested (leaves / cactus) — fully opaque or fully gone
 *   - translucent: alpha-blended (water / glass)
 */

import * as THREE from 'three';
import { RenderLayer } from './ChunkMesher';

export interface ChunkMaterials {
  [RenderLayer.SOLID]: THREE.Material;
  [RenderLayer.CUTOUT]: THREE.Material;
  [RenderLayer.TRANSLUCENT]: THREE.Material;
}

export function buildChunkMaterials(atlas: THREE.Texture): ChunkMaterials {
  const solid = new THREE.MeshLambertMaterial({
    map: atlas,
    vertexColors: true,
  });

  const cutout = new THREE.MeshLambertMaterial({
    map: atlas,
    vertexColors: true,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });

  const translucent = new THREE.MeshLambertMaterial({
    map: atlas,
    vertexColors: true,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  return {
    [RenderLayer.SOLID]: solid,
    [RenderLayer.CUTOUT]: cutout,
    [RenderLayer.TRANSLUCENT]: translucent,
  };
}
