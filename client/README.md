# Admin RBAC — Frontend

Interface React (Vite + TypeScript + Tailwind) avec deux espaces distincts
selon le rôle, branchée sur l'API du dossier `server`.

## Démarrage

Assure-toi d'abord que le **backend tourne** (`cd server && npm run dev`).

```bash
cd client
npm install
npm run dev
```

→ http://localhost:5173

Le fichier `.env` pointe déjà vers `http://localhost:4000/api`. Si ton
backend tourne sur un autre port, modifie `VITE_API_URL`.

## Comment ça marche

- **`/login`** : page de connexion commune. Selon le rôle renvoyé par l'API,
  l'utilisateur est redirigé vers `/admin` ou `/membre`.
- **`/admin`** (accent indigo) : protégée par `AdminRoute`. Formulaire d'ajout
  de membre + tableau (liste / suppression). Un non-admin est renvoyé vers `/membre`.
- **`/membre`** (accent teal) : protégée par `ProtectedRoute`. Espace personnel
  épuré, sans aucun accès à la gestion.

Le token JWT est stocké dans le `localStorage` et renvoyé automatiquement dans
l'en-tête `Authorization` par le wrapper `src/lib/api.ts`.

## Tester les deux interfaces

1. Connecte-toi avec l'admin : `admin@example.com` / `Admin1234!`
   → tu arrives sur le dashboard **Admin** (indigo).
2. Crée un membre via le formulaire (rôle « Membre »).
3. Déconnecte-toi, puis reconnecte-toi avec ce membre
   → tu arrives sur l'espace **Membre** (teal), sans gestion.
4. Essaie d'aller manuellement sur `/admin` en tant que membre
   → tu es automatiquement renvoyé vers `/membre`. 🔒
