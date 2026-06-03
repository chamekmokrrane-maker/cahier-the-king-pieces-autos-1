# Cahier THE KING PIECES AUTOS - V11

Version V11 :

- demandes clients et devis classés automatiquement par jour dans **Archives** ;
- page **Cahier du jour** : uniquement les demandes du jour ;
- page **Devis du jour** : uniquement les devis du jour ;
- comptes **Admin** et **Salarié** ;
- accès limités par salarié : demandes, devis, factures, archives ;
- modification et suppression des comptes depuis l'interface ;
- modèle devis, factures clients, WhatsApp et email conservés.

## Lancer en local

```bash
npm install
npm run dev
```

## Supabase

Colle le fichier suivant dans Supabase > SQL Editor > Run :

```text
supabase/schema.sql
```

Puis vérifie :

- Authentication > Providers > Email : activé
- Confirm email : désactivé

## Render

Variables d'environnement Render :

```text
NODE_VERSION=20.20.0
VITE_SUPABASE_URL=ton_url_supabase
VITE_SUPABASE_ANON_KEY=ta_cle_anon_ou_publishable
```

Réglages :

```text
Build Command: npm install && npm run build
Publish Directory: dist
```

## V13
- Correction du chargement : l'interface reste sur “Chargement des données Supabase” jusqu'à la fin de la synchronisation, pour éviter l'affichage à zéro après actualisation.
- Correction des archives journalières : la date du jour est calculée en heure française (Europe/Paris), donc après minuit les demandes et devis de la veille passent dans Archives.
