# Cahier THE KING PIECES AUTOS - V7

Version V7 du logiciel Cahier THE KING PIECES AUTOS.

## Modifications V7

- Design du site plus professionnel avec touches noires, bleu et or.
- Accueil simplifié : aucune liste de demandes ni de devis affichée sur l’accueil.
- Nouvelle demande : suppression de la case statut.
- Nouvelle demande : dossier traité directement par défaut.
- Nouveau bouton “Mettre en attente” uniquement si le dossier doit être repris plus tard.
- Devis : nouveau bouton “Faire facture” pour transformer un devis en facture client.
- Impression devis : nouveau haut de page avec logo à gauche, nom du magasin centré à côté, slogan sous le nom, bloc DEVIS à droite.
- Impression devis : numéro et date en taille moyenne.
- Impression devis : blocs client et véhicule plus compacts.
- Impression devis : texte des conditions ajouté.
- Impression devis et facture : marges réduites pour éviter une deuxième page quand il y a peu d’articles.
- Impression devis et facture : CSS prévu pour supprimer les marges navigateur.

## Lancer le projet en local

```bash
npm install
npm run dev
```

## Build production

```bash
npm run build
```

## Supabase

Si tu avais déjà installé la V5 et collé le SQL, tu n’as pas besoin de refaire Supabase pour la V7.

## GitHub / Render

```bash
git add .
git commit -m "version v7 design pro devis facture"
git push
```

Sur Render :

- Build Command : `npm install && npm run build`
- Publish Directory : `dist`

## Important impression

Si Chrome affiche encore la date, l’heure ou l’adresse du site en haut/bas de la feuille, il faut décocher “En-têtes et pieds de page” dans la fenêtre d’impression de Chrome.


## V7
- Texte d’accueil simplifié.
- Phrase explicative inutile supprimée dans les factures clients.
- Conditions de vente reformulées en texte professionnel.


## V8
- Le bouton WhatsApp ne force plus l'envoi vers le téléphone du client.
- Au clic, le site demande le numéro destinataire. Si le champ est laissé vide, WhatsApp s'ouvre avec le message et l'utilisateur choisit lui-même le contact.
