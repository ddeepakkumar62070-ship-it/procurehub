# Docker

## Local development

Docker Compose uses local development defaults, so the full stack can be started from the repository root with:

```sh
docker compose up --build
```

Open the Vite frontend at <http://localhost:5173>; the API and health endpoint are at <http://localhost:4000> and <http://localhost:4000/api/health>. The Compose stack waits for PostgreSQL and Redis health checks, applies pending migrations, then starts the backend and frontend. PostgreSQL and Redis data persist in named volumes.

To override local settings, copy `.env.example` to `.env` before starting Compose. The example secrets and database credentials are for local development only.

## Production configuration

Set production values in `.env` and start the production image targets with:

```sh
docker compose -f docker-compose.prod.yml up --build -d
```

Set `DB_PASSWORD`, distinct strong random `JWT_SECRET` and `JWT_REFRESH_SECRET` values, an HTTPS `CORS_ORIGIN`, and `FRONTEND_API_URL` to the browser-reachable API origin. The frontend is served by Nginx on port 8080 by default; the API is on port 4000. Production images omit development dependencies, run the backend as the unprivileged Node user, and do not publish PostgreSQL or Redis ports.

Stop the stack with `docker compose down`. Named data volumes are retained; remove them only when intentionally deleting local database and Redis data.
