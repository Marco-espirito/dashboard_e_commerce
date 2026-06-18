# Admin RBAC — Backend

API Express + Prisma + PostgreSQL + JWT avec un système de rôles
(`ADMIN` / `MEMBER`). Un admin peut créer, lister et supprimer des membres.
Le rôle est embarqué dans le token JWT et vérifié par un middleware.

## 1. Installation

```bash
cd server
npm install
cp .env.example .env
```

Édite `.env` et renseigne au minimum `DATABASE_URL` (ta base Postgres)
et `JWT_SECRET` (une longue chaîne aléatoire).

## 2. Base de données

```bash
npm run prisma:migrate   # crée la table User (nom de migration : "init")
npm run seed:admin       # crée l'admin défini dans .env
```

L'admin par défaut : `admin@example.com` / `Admin1234!`

## 3. Lancer le serveur

```bash
npm run dev
```

→ http://localhost:4000 (vérifie avec `GET /api/health`)

---

## Routes disponibles

| Méthode | Route                | Accès        | Description                  |
|---------|----------------------|--------------|------------------------------|
| GET     | `/api/health`        | public       | Vérifie que le serveur tourne |
| POST    | `/api/auth/login`    | public       | Connexion → renvoie un token |
| GET     | `/api/auth/me`       | connecté     | Infos de l'utilisateur courant |
| GET     | `/api/members`       | admin only   | Liste tous les membres       |
| POST    | `/api/members`       | admin only   | Crée un membre               |
| DELETE  | `/api/members/:id`   | admin only   | Supprime un membre           |

---

## Tester en ligne de commande (curl)

### Connexion (récupère le token)

```bash
curl -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"Admin1234!"}'
```

Copie le `token` renvoyé, puis :

```bash
TOKEN="colle_le_token_ici"
```

### Créer un membre (admin)

```bash
curl -X POST http://localhost:4000/api/members \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"Awa Kone","email":"awa@example.com","password":"motdepasse","role":"MEMBER"}'
```

### Lister les membres (admin)

```bash
curl http://localhost:4000/api/members \
  -H "Authorization: Bearer $TOKEN"
```

### Vérifier le blocage côté membre

Connecte-toi avec le membre créé, récupère SON token, puis tente :

```bash
curl http://localhost:4000/api/members -H "Authorization: Bearer $TOKEN_MEMBRE"
# → 403 { "error": "Accès réservé à l'administrateur" }
```

C'est ce 403 qui prouve que la séparation des rôles fonctionne. 🎯
