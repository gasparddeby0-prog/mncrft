# Architecture

VoxelCraft est organisé en modules à responsabilité unique, regroupés par
domaine. Une règle structurante traverse tout le code :

> **La donnée du monde est séparée du rendu.** Tout ce qui décrit le monde
> (`world/`, `Block`, `Chunk`, `World`, `TerrainGenerator`, le bruit) n'importe
> *jamais* Three.js. C'est ce qui permet (a) d'exécuter la génération dans des
> Web Workers, et (b) d'envisager un serveur multijoueur réutilisant exactement
> le même code de simulation.

## Vue d'ensemble des couches

```
                 ┌─────────────────────────────────────────────┐
                 │                  core/Game                   │
                 │  boucle: input → joueur → interaction →       │
                 │  streaming → environnement → rendu → HUD      │
                 └───────────────┬───────────────┬──────────────┘
                                 │               │
        ┌────────────────────────┘               └───────────────────────┐
        ▼                                                                 ▼
  ┌───────────┐   ┌──────────────┐   ┌──────────────┐            ┌────────────────┐
  │  player/  │   │   world/     │   │   render/    │            │  persistence/  │
  │ Player    │   │ World        │   │ ChunkMesher  │            │  WorldStore    │
  │ Raycaster │   │ Chunk        │   │ Materials    │            │  (IndexedDB)   │
  │ Interaction│  │ ChunkManager │   │ TextureAtlas │            └────────────────┘
  └───────────┘   │ TerrainGen   │   │ Environment  │
                  │ Biome / noise│   │ BlockHighlight│
                  └──────┬───────┘   └──────────────┘
                         │
                  ┌──────▼────────┐
                  │   workers/    │   pool de Web Workers
                  │ WorkerPool    │   (génération parallèle)
                  │ chunkWorker   │
                  └───────────────┘
```

## Le cycle de vie d'un chunk

1. **Demande** — `ChunkManager.update(x, z)` calcule l'ensemble des chunks dans
   la distance de rendu et, pour chaque chunk manquant, soit le charge depuis la
   sauvegarde (`WorldStore.load`), soit le demande au `WorkerPool`.
2. **Génération (thread d'arrière-plan)** — un `chunkWorker` exécute
   `TerrainGenerator.generateChunk` et **transfère** (zéro-copie) le tableau de
   voxels au thread principal.
3. **Enregistrement** — le chunk est inséré dans `World` ; lui et ses voisins
   sont mis en file de maillage (les bordures partagées doivent être recalculées).
4. **Maillage (thread principal, throttlé)** — `ChunkMesher` construit jusqu'à
   `MAX_MESH_PER_FRAME` chunks par image, les plus proches du joueur d'abord,
   pour éviter les à-coups.
5. **Rendu** — chaque chunk possède jusqu'à trois `Mesh` (opaque / découpe /
   translucide) ; Three.js applique le **frustum culling** par mesh.
6. **Déchargement** — au-delà de la distance de conservation, les chunks
   modifiés sont persistés puis leurs géométries libérées (mémoire GPU).

## Modèle de données voxel

- Un **chunk** = colonne `16 × 128 × 16` stockée dans un `Uint8Array`
  (1 octet/bloc, soit 32 Ko/chunk). Index : `x + 16·(z + 16·y)`.
- Le **registre de blocs** (`Block.ts`) décrit propriétés physiques (solide,
  opaque, transparent, liquide, lumière) et tuiles de texture par face. Il est
  volontairement sans dépendance de rendu.

## Génération procédurale

`TerrainGenerator` combine plusieurs champs de bruit Simplex indépendants
(élévation, détail, montagnes, température, humidité, deux champs de grottes,
minerais). Pour chaque colonne : hauteur → biome → remplissage
(socle/pierre/sous-sol/surface/eau) → creusement de grottes 3D → minerais selon
la profondeur → décoration (arbres/cactus) avec une **marge de 3 blocs** pour que
les structures débordent proprement entre chunks.

## Maillage et performance

- **Face culling** : une face n'est émise que si son voisin ne la cache pas.
  Les faces internes entre blocs pleins ne sont jamais générées.
- **Ambient occlusion** : assombrissement par sommet calculé à partir des blocs
  voisins, *cuit* dans les couleurs de sommet (coût nul au rendu). La diagonale
  du quad est retournée quand l'AO est anisotrope pour éviter l'artéfact de
  couture.
- **Ombrage directionnel** : dessus plus clair, dessous plus sombre.
- **Tri par couches** : opaque / découpe (alphaTest) / translucide
  (alpha-blend) pour une transparence correcte (eau, verre, feuilles).
- **Brouillard** assorti au ciel pour masquer l'apparition des chunks au loin.

## Multithreading

`WorkerPool` instancie un worker par cœur (plafonné à 8), déduplique les
requêtes en vol, met les demandes en file et les distribue aux workers libres.
La génération est ainsi totalement parallèle ; seul le maillage reste sur le
thread principal (throttlé), point d'optimisation identifié dans la *roadmap*.

## Conventions

- TypeScript strict, pas de variables inutilisées.
- Modules sans état global mutable partagé (hors registre de blocs en lecture).
- Les coordonnées suivent trois espaces explicites (monde / chunk / local),
  centralisés dans `world/coords.ts`.
