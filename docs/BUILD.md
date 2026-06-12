# Guide de compilation et d'installation

VoxelCraft est une application web statique : une fois compilée, c'est un
dossier de fichiers HTML/JS/CSS que **n'importe quel navigateur moderne** peut
exécuter, sous **Windows, Linux ou macOS**. Aucune installation native.

## 1. Prérequis

| Outil | Version | Notes |
| --- | --- | --- |
| [Node.js](https://nodejs.org) | **≥ 18** (20+ recommandé) | inclut `npm` |
| Navigateur | récent | WebGL2 + Web Workers + IndexedDB requis |

Vérifier :

```bash
node --version
npm --version
```

## 2. Installation

Depuis la racine du projet :

```bash
npm install
```

## 3. Développement

```bash
npm run dev
```

Vite démarre un serveur avec rechargement à chaud. Ouvrez l'URL affichée
(par défaut `http://localhost:5173`). L'option `--host` est activée, donc le
serveur est aussi accessible depuis un autre appareil du réseau local.

## 4. Vérifications qualité

```bash
npm run typecheck   # vérification de types stricte (tsc --noEmit)
npm run smoke       # tests de fumée headless (génération, raycast, maillage)
npm run lint        # ESLint (optionnel)
```

## 5. Build de production

```bash
npm run build
```

Produit un dossier `dist/` optimisé et minifié (le worker de génération est
émis comme bundle séparé). Pour tester ce build localement :

```bash
npm run preview
```

## 6. Déploiement

`dist/` est entièrement statique et utilise des chemins relatifs (`base: './'`),
donc il peut être servi tel quel :

- **Hébergement statique** : GitHub Pages, Netlify, Vercel, Cloudflare Pages,
  S3 + CloudFront, etc. Glissez-déposez `dist/`.
- **Serveur local** : `npx serve dist` ou tout serveur HTTP statique.

> Remarque : ouvrir `dist/index.html` via `file://` peut être bloqué par les
> navigateurs (CORS sur les modules/Workers). Servez toujours le dossier via
> HTTP (les commandes ci-dessus le font).

## 7. Dépannage

| Symptôme | Cause probable / solution |
| --- | --- |
| Écran « WebGL non supporté » | Activez l'accélération matérielle du navigateur. |
| Page blanche en `file://` | Servez via HTTP (`npm run preview`). |
| Faible FPS | Réduisez la distance de rendu avec `[`, ou l'échelle de rendu. |
| Le monde « repart de zéro » | La sauvegarde est par graine : gardez la même `?seed=`. |

## 8. Réinitialiser le monde sauvegardé

Les données sont dans IndexedDB (base `voxelcraft`). Pour repartir de zéro :
videz le stockage du site dans les outils développeur du navigateur, ou changez
la graine via `?seed=...`.
