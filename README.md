# VoxelCraft

Un **moteur de jeu voxel original**, inspiré de Minecraft Java Edition, développé
de zéro en **TypeScript + Three.js (WebGL)** avec génération de monde
**procédurale, infinie et multithreadée**.

> ⚠️ **Honnêteté sur le périmètre.** Reproduire *l'intégralité* de Minecraft
> (redstone complète, multijoueur, IA de mobs, enchantements, villages, mods,
> dimensions…) représente des années de travail d'équipe. Ce dépôt fournit une
> **fondation jouable, réelle et sans placeholder** : tout ce qui est listé dans
> « Fonctionnalités implémentées » fonctionne vraiment. Les fonctionnalités
> restantes sont décrites, avec leur état, dans [`docs/ROADMAP.md`](docs/ROADMAP.md).

Le code est 100 % original et tous les assets (textures) sont **générés
procéduralement à l'exécution** : aucun fichier graphique externe, donc aucun
problème de licence.

---

## Fonctionnalités implémentées

- 🌍 **Monde procédural infini** streamé en continu autour du joueur.
- 🗺️ **Biomes** : plaines, forêts, déserts, montagnes (avec sommets enneigés),
  océans, marécages et zones neigeuses.
- 🧱 **Système de chunks** chargés/déchargés dynamiquement selon la distance.
- 🌫️ **Bruit Simplex** original (2D/3D + FBM) pour le terrain, les grottes,
  les minerais et le climat.
- ⛏️ **Grottes** en « spaghetti » et **minerais** répartis par profondeur
  (charbon, fer, or, diamant).
- 🌳 **Arbres et cactus** générés procéduralement, **continus entre les chunks**.
- 🧵 **Multithreading** : génération du terrain dans un *pool* de Web Workers
  (un par cœur CPU).
- 🎨 **Maillage optimisé** : face culling, ambient occlusion cuite par sommet,
  ombrage directionnel ; **frustum culling** par chunk via Three.js.
- 🕹️ **Contrôleur première personne** : marche, course, accroupissement, saut,
  **vol**, **nage**, collisions AABB par axe, **dégâts de chute** et régénération.
- 🔨 **Casser / poser** des blocs avec ray casting voxel (DDA) et surbrillance.
- ☀️🌙 **Cycle jour/nuit complet** avec soleil/lune, ciel et brouillard dynamiques.
- 🌧️ **Météo** : pluie, **orages** (éclairs), neige — système de particules réel.
- 💾 **Sauvegarde automatique** (IndexedDB) du joueur et des blocs modifiés.
- 🖥️ **Interface moderne** : hotbar avec icônes, barre de vie, réticule,
  overlay de debug (F3), notifications.
- ⚙️ **Réglages** : distance de rendu, FOV, échelle de rendu, vitesse du temps.
- 💻 **Multiplateforme** : tourne dans n'importe quel navigateur moderne sous
  Windows, Linux et macOS.

Voir [`docs/ROADMAP.md`](docs/ROADMAP.md) pour le détail point par point face au
cahier des charges complet.

---

## Démarrage rapide

Prérequis : **Node.js ≥ 18**.

```bash
npm install      # installe les dépendances
npm run dev      # serveur de dev (http://localhost:5173)
```

Ouvrez l'URL affichée, cliquez sur **Click to Play** (verrouillage de la souris),
et explorez.

Build de production :

```bash
npm run build    # vérifie les types puis génère dist/
npm run preview  # sert le build de production
```

Tests de fumée (logique pure, sans navigateur) :

```bash
npm run smoke
```

Guide détaillé : [`docs/BUILD.md`](docs/BUILD.md).

---

## Contrôles

| Action | Touche |
| --- | --- |
| Se déplacer | `Z/Q/S/D` ou `W/A/S/D` |
| Regarder | Souris |
| Sauter / monter (vol) | `Espace` |
| S'accroupir / descendre (vol) | `Shift` |
| Courir | `Ctrl` |
| Activer/désactiver le vol | `F` |
| Casser un bloc | Clic gauche |
| Poser un bloc | Clic droit |
| Sélectionner un bloc | `1`–`0` ou molette |
| Météo suivante | `R` |
| Temps normal / rapide | `T` |
| Distance de rendu −/+ | `[` / `]` |
| Overlay de debug | `F3` |
| Libérer la souris | `Échap` |

Astuce : ajoutez `?seed=monmonde` à l'URL pour fixer la graine du monde.

---

## Structure du projet

```
src/
  constants.ts          Constantes globales (tailles de chunk, gravité…)
  main.ts               Point d'entrée
  core/                 Boucle de jeu, moteur de rendu, entrées
  world/                Données voxel, génération, streaming des chunks
    noise/              Bruit Simplex
  render/               Maillage, matériaux, textures, ciel/météo, surbrillance
  player/               Contrôleur, ray casting, interaction
  ui/                   HUD + styles
  persistence/          Sauvegarde IndexedDB
  workers/              Web Workers + pool de génération
docs/                   Documentation technique
scripts/                Tests de fumée headless
```

Architecture détaillée : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Licence

Code et assets sous licence **MIT** (voir en-tête `package.json`). Projet non
affilié à Mojang/Microsoft ; « Minecraft » est cité uniquement comme référence
d'inspiration de gameplay.
