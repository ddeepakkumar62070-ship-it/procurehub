# Local development

ProcureHub runs locally with PostgreSQL, Node.js, and Vite. No container
orchestration or separate cache service is required.

1. Start PostgreSQL locally and create the `procurehub` database.
2. Copy `backend/.env.example` to `backend/.env` and set the database
   credentials and distinct development JWT secrets.
3. From the repository root, install dependencies and apply migrations:

   ```sh
   npm install
   npm run backend:migrate
   ```

4. Start the backend and frontend in separate terminals:

   ```sh
   npm run backend:dev
   npm run frontend:dev
   ```

The backend defaults to `http://localhost:4000`; Vite defaults to
`http://localhost:5173`. Set `VITE_API_URL` and `CORS_ORIGIN` when using
different local addresses.
