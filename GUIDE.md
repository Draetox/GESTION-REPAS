# 🍽 Déploiement — Repas Famille (Cloudflare)

## Structure
```
repas-famille-cf/
├── public/           ← Hébergé sur Cloudflare Pages
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── _redirects    ← Route /api/* vers le Worker
└── worker/           ← Cloudflare Worker (clés sécurisées)
    └── index.js
```

---

## ÉTAPE 1 — GitHub

1. Créez un repo GitHub appelé `repas-famille`
2. Uploadez tous les fichiers (glisser-déposer sur github.com)

---

## ÉTAPE 2 — Cloudflare Worker (clés sécurisées)

1. Allez sur **dash.cloudflare.com** → Workers & Pages → Create
2. Choisissez **Worker** → copiez le contenu de `worker/index.js`
3. Nommez-le `repas-famille-worker`
4. Allez dans **Settings > Variables** et ajoutez :
   - `SUPABASE_URL` = votre URL Supabase
   - `SUPABASE_ANON_KEY` = votre clé anon
   - `ANTHROPIC_API_KEY` = votre clé Anthropic
5. Notez l'URL du worker : `repas-famille-worker.VOTRE_SOUS_DOMAINE.workers.dev`

---

## ÉTAPE 3 — Cloudflare Pages

1. Workers & Pages → Create → **Pages** → Connect to Git
2. Sélectionnez votre repo GitHub `repas-famille`
3. Configuration :
   - **Build command** : (laisser vide)
   - **Build output directory** : `public`
4. Cliquez **Save and Deploy**

---

## ÉTAPE 4 — Connecter Pages → Worker

1. Dans le fichier `public/_redirects`, remplacez `YOUR_SUBDOMAIN` par votre sous-domaine Cloudflare
2. Committez sur GitHub → redéployement automatique

---

## ÉTAPE 5 — Tester

Ouvrez votre URL Pages (ex: `repas-famille.pages.dev`) sur vos deux téléphones.
Ajoutez-la à l'écran d'accueil → Partager > Ajouter à l'écran d'accueil.

---

## Fonctionnalités

- ✅ Planning semaine (navigation semaines)
- ✅ 10 recettes de base avec ingrédients
- ✅ Ajout de recettes manuelles (emoji, nom, temps, ingrédients)
- ✅ Lien Cookidoo par recette + recherche directe
- ✅ Suggestions IA de nouvelles recettes
- ✅ Liste de courses bio générée par IA
- ✅ Sync temps réel entre les deux téléphones (Supabase)
- ✅ Clés API sécurisées côté serveur (Worker)
