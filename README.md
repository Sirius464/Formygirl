# ASCII Lily Bouquet

Un bouquet de lys qui pousse puis éclot, entièrement dessiné en caractères ASCII colorés, sur fond noir étoilé.

- Les tiges poussent (0–1 s), les feuilles se déploient, les boutons gonflent et se colorent (1–2,2 s), les lys s'ouvrent (2,1–3,9 s), puis les étoiles apparaissent et scintillent.
- **Clic / tap / Espace / R** : rejouer l'animation.
- `?t=3` dans l'URL fige l'animation à 3 s (pratique pour une capture) ; `?speed=0.5` la ralentit.

C'est un site 100 % statique : `index.html` + `bouquet.js`, sans dépendance ni étape de build.

## Lancer en local

Ouvre simplement `index.html` dans un navigateur, ou lance un petit serveur :

```bash
python3 -m http.server 5500
# puis http://127.0.0.1:5500
```

## Héberger sur Vercel

**Option 1 – depuis GitHub (recommandé)**

1. Va sur [vercel.com/new](https://vercel.com/new) et importe le dépôt `formygirl`.
2. Framework Preset : **Other**. Laisse *Build Command* et *Output Directory* vides.
3. Clique sur **Deploy**. Chaque push sur la branche de production redéploie le site.

**Option 2 – en ligne de commande**

```bash
npm i -g vercel
vercel          # première fois : répondre aux questions, tout laisser par défaut
vercel --prod   # mise en production
```

## Comment ça marche

La scène (tiges, feuilles, boutons, pétales, étamines, étoiles) est dessinée avec l'API Canvas 2D sur une toute petite toile où **1 pixel = 1 caractère**. À chaque image, un shader WebGL transforme cette toile en texte : la couverture de chaque cellule choisit le caractère dans la rampe ` .:-=+*#%@`, et sa couleur teinte le glyphe. Si WebGL n'est pas disponible, un rendu Canvas 2D (`fillText`) prend le relais.
