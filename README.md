# Cahier THE KING PIECES AUTOS - V10

Application React + Vite + Supabase pour gérer :

- Cahier des demandes clients
- Dossiers en attente
- Devis
- Factures clients
- Comptes administrateur

## Nouveautés V10

- Modifier un compte admin depuis l’interface : nom affiché, identifiant et mot de passe.
- Supprimer un compte admin depuis l’interface.
- Protection : impossible de supprimer le dernier compte admin.
- Protection : impossible de supprimer le compte actuellement connecté.
- Fichier `.npmrc` ajouté pour fiabiliser l’installation sur Render.
- `package-lock.json` retiré pour forcer Render à refaire une installation propre.

## Installation locale

```bash
npm install
npm run dev
```

## Supabase

Colle le fichier suivant dans Supabase > SQL Editor > Run :

```text
supabase/schema.sql
```

Important : pour activer la modification/suppression des comptes admin, il faut coller le SQL V10.

Dans Supabase > Authentication > Sign In / Providers > Email :

- Email provider : activé
- Confirm email : désactivé

## Render

Build Command :

```bash
npm install && npm run build
```

Publish Directory :

```text
dist
```

Environment Variables :

```env
NODE_VERSION=20.20.0
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
