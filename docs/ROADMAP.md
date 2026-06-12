# Feuille de route — état face au cahier des charges

Ce document met en regard **chaque** fonctionnalité demandée et son état réel
dans ce dépôt. Honnêteté avant tout : `✅ fait`, `🟡 partiel`, `⬜ à venir`.

## Fonctionnalités « obligatoires »

| Fonctionnalité demandée | État | Détail |
| --- | --- | --- |
| Génération procédurale infinie + biomes | ✅ | 7 biomes, streaming infini. |
| Chunks chargés/déchargés dynamiquement | ✅ | `ChunkManager`. |
| Terrain par bruit (Perlin/Simplex) | ✅ | Simplex original + FBM. |
| Cycle jour/nuit + éclairage dynamique | ✅ | `Environment`. |
| Système météo (pluie, orages, neige) | ✅ | Particules + éclairs. |
| Moteur voxel performant | 🟡 | Face culling + frustum culling + AO. **Occlusion culling** (HZB) et **greedy meshing** : non encore — voir notes. |
| Inventaire complet | 🟡 | Hotbar 10 emplacements. Inventaire/coffres à grille : ⬜. |
| Crafting identique à Minecraft | ⬜ | Système d'objets/recettes à implémenter. |
| Fourneaux, coffres, enclumes, tables d'enchantement | ⬜ | Nécessite blocs à entité + UI dédiées. |
| Survie : faim, vie, régénération, dégâts de chute | 🟡 | Vie ✅, régénération ✅, dégâts de chute ✅. Faim/nourriture ⬜. |
| IA des créatures (passives/hostiles) | 🟡 | Errance/fuite (passifs) + poursuite/attaque (zombie). Pathfinding A* ⬜. |
| Zombies, squelettes, creepers, araignées, animaux | 🟡 | Vache/cochon/poule + zombie ✅. Squelettes/creepers/araignées ⬜. |
| Villages, grottes, ravins, donjons, structures | 🟡 | Grottes ✅. Ravins/villages/donjons/structures ⬜. |
| Minéraux selon la profondeur | ✅ | Charbon/fer/or/diamant par paliers. |
| Redstone + logique électrique | ⬜ | Simulation de signal à concevoir. |
| Multijoueur client/serveur | ⬜ | Architecture prête (monde sans rendu) ; netcode à écrire. |
| Sauvegarde automatique | ✅ | IndexedDB, joueur + blocs modifiés. |
| Son 3D | ⬜ | À faire avec la Web Audio API (PannerNode). |
| Interface utilisateur moderne | ✅ | HUD, hotbar, debug, toasts. |
| Paramètres graphiques avancés | 🟡 | Distance de rendu, FOV, échelle de rendu, vitesse du temps. Menu d'options dédié ⬜. |
| Support des shaders | ⬜ | Pipeline `ShaderMaterial`/post-process à exposer. |
| Support des packs de textures | 🟡 | Atlas généré procéduralement ; chargement de packs externes ⬜. |
| Physique des fluides (eau et lave) | 🟡 | Rendu + nage dans l'eau ✅. Écoulement/propagation ⬜. |
| Arbres générés procéduralement | ✅ | Arbres + cactus, continus entre chunks. |
| Agriculture et élevage | ⬜ | Dépend des cultures + entités animales. |
| Système d'expérience et d'enchantements | ⬜ | XP + table d'enchantement à venir. |

## Exigences techniques

| Exigence | État | Détail |
| --- | --- | --- |
| Architecture modulaire et évolutive | ✅ | Modules par domaine, donnée séparée du rendu. |
| Code optimisé pour grands mondes | ✅ | `Uint8Array`, transfert zéro-copie, streaming. |
| Multithreading pour la génération | ✅ | Pool de Web Workers. |
| Consommation mémoire minimale | ✅ | 32 Ko/chunk, déchargement + libération GPU. |
| Compatible Windows/Linux/macOS | ✅ | Via navigateur (build statique). |
| Aucun placeholder | ✅ | Tout ce qui est marqué « fait » fonctionne réellement. |
| Code source intégral | ✅ | Fourni dans `src/`. |
| Documentation technique | ✅ | `README` + `docs/`. |
| Guide de compilation/installation | ✅ | `docs/BUILD.md`. |
| Assets libres de droits | ✅ | Textures générées à l'exécution, zéro asset externe. |

## Bonus

| Bonus | État |
| --- | --- |
| Support des mods | ⬜ |
| Dimensions alternatives | ⬜ |
| Commandes administrateur | ⬜ |
| Optimisations type « mods de performance » | 🟡 (face culling, AO, frustum, workers ; greedy meshing/occlusion à venir) |
| Outils de débogage intégrés | ✅ (overlay F3 : fps, position, biome, chunks, file de maillage, météo…) |

## Prochaines étapes recommandées (par ordre d'impact)

1. **Greedy meshing** + déplacement du maillage dans des workers (perf).
2. **Propagation de lumière** (skylight/blocklight) pour un éclairage type
   Minecraft, en plus de l'AO actuel.
3. **Inventaire + crafting** (modèle d'items, recettes, conteneurs) — prochain lot.
4. ~~Système d'entités~~ ✅ fait (base `Entity` + mobs animés). Étendre : autres
   mobs (squelette, creeper, araignée), drops, pathfinding A*.
5. **Structures** (villages, donjons, ravins) via un générateur de features.
6. **Multijoueur** : extraire la simulation `world/` côté serveur (Node + WS),
   diffuser les deltas de blocs et les positions.
7. **Fluides dynamiques**, **redstone**, **sons 3D**, **shaders/packs**.

Chaque étape s'appuie sur les abstractions déjà en place (registre de blocs,
chunks, streaming, persistance) sans réécriture du cœur.
