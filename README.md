# Docker 3-Tier App — FiftyFive Technologies
**DevOps Intern Assignment | Vishnu Jangid**

---

## What I Made

I built a 3-tier app using Docker. It has Nginx as frontend, Node.js as backend API, and MySQL as database. All 3 run in separate containers and talk to each other through a Docker network.

I also made a live dashboard to monitor everything — API hits, uptime, system info, and a messages feature that does real database operations.

---

## 1. How to Run

Make sure Docker Desktop is running, then:

```bash
git clone https://github.com/YOUR_USERNAME/fiftyfix-devops.git
cd fiftyfix-devops
cp .env.example .env
docker compose up --build
```

Then open `http://localhost` in browser. That's it.

---

## 2. Architecture

```
Browser
  |
  v
Nginx :80        → serves the HTML page
  |                 proxies /api/* to backend
  v
Node.js :3000    → handles API requests, talks to DB
  |
  v
MySQL :3306      → stores data in named volume
```

I used a custom Docker network called `app-network`. Because of this,
containers find each other by name — backend connects to `db:3306`
instead of an IP address. This is cleaner and works even if IPs change.

| Service  | Image        | Port | What it does            |
|----------|--------------|------|-------------------------|
| frontend | nginx:alpine | 80   | HTML page + proxy       |
| backend  | node:alpine  | 3000 | API + DB queries        |
| db       | mysql:8.0    | 3306 | Stores all the data     |

---

## 3. Key Implementation Details

**Backend waiting for MySQL**

I used `depends_on` with `condition: service_healthy` so backend only
starts after MySQL passes health check. But that alone wasn't enough —
MySQL passes the health check before it's fully ready for connections.
So I also wrote a `connectWithRetry()` function that keeps trying every
5 seconds until it connects successfully.

**Nginx getting backend URL dynamically**

I didn't hardcode the URL in nginx config. Instead I have a file
`nginx.conf.template` with `${BACKEND_URL}` in it. When container starts,
nginx:alpine runs `envsubst` automatically and replaces the variable with
actual value from `.env` file.

**Service communication**

All containers are on `app-network`. Docker handles DNS so they reach
each other by service name. No hardcoded IPs anywhere in the project.

---

## 4. Testing

```bash
# open dashboard
http://localhost

# test API through nginx
curl http://localhost/api/
curl http://localhost/api/health
curl http://localhost/api/visits
curl http://localhost/api/visits/log
curl http://localhost/api/messages

# post a message to MySQL
curl -X POST http://localhost/api/messages \
  -H "Content-Type: application/json" \
  -d '{"author":"Vishnu","content":"hello"}'

# see all logs
docker compose logs -f

# see container status
docker compose ps
```

---

## 5. What Happens When MySQL Restarts

```bash
docker restart fiftyfix-devops-db-1
```

Here's what I observed when I tested this:

- MySQL stops → backend immediately gets a connection error
- `/health` endpoint returns 500 for a few seconds
- My retry function kicks in, tries reconnecting every 5 seconds
- MySQL comes back up, backend reconnects on next attempt
- Everything back to normal in about 10-15 seconds

The key thing I learned — you can't reuse a dead connection object.
You have to create a completely new `mysql.createConnection()` on each
retry. That's why my `connectWithRetry()` calls `db.destroy()` first
and then creates a fresh connection.

---

## Project Structure

```
fiftyfix-devops/
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf.template
│   ├── .dockerignore
│   └── index.html
├── backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── app.js
│   └── package.json
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

---

## API Endpoints

| Method | Path            | What it returns                  |
|--------|-----------------|----------------------------------|
| GET    | /               | status and version               |
| GET    | /health         | DB connection status and uptime  |
| GET    | /visits         | total request count from MySQL   |
| GET    | /visits/log     | last N requests with details     |
| GET    | /visits/stats   | grouped hits per endpoint        |
| GET    | /messages       | all messages from DB             |
| POST   | /messages       | save new message to DB           |
| DELETE | /messages/:id   | delete message by id             |
| GET    | /metrics        | CPU and memory history           |
| GET    | /system         | live container system info       |

---

## Database Tables

I created 3 tables in MySQL:

- **visits** — logs every API request (method, endpoint, status, response time, IP)
- **messages** — stores messages posted through the UI (author, content)
- **metrics** — records CPU load and memory usage every 30 seconds automatically

---

## Bonus Features Done

**Multi-stage build** — backend Dockerfile has a builder stage that
installs npm packages, then a final stage that only copies what's needed.
Keeps the image smaller.

**Non-root user** — I created a user called `appuser` in the Dockerfile
and the container runs as that user. Running as root in containers is
a security risk so this is the right way to do it.

---

## Environment Setup

```bash
cp .env.example .env
```

Fill in `.env` with your passwords. Never commit `.env` — it's in `.gitignore`.

```
MYSQL_ROOT_PASSWORD=yourpassword
MYSQL_DATABASE=appdb
MYSQL_USER=appuser
MYSQL_PASSWORD=yourpassword
```