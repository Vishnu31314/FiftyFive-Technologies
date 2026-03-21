# FiftyFive Technologies -- Docker 3-Tier Application
**DevOps Intern Assignment**

--- 
## What I Made 

I used Docker to create a three-tier application. It uses MySQL as the database, Node.js as the backend API, and Nginx as the frontend. Each of the three operates in a different container and communicates with the others via a Docker network. 

In order to keep an eye on everything, including API hits, uptime, system information, and a messaging feature that does actual database transactions, I also created a live dashboard. 

---

## 1. Setup Instruction

First make sure Docker Desktop is open and running on system.

Then run this commands:

```bash
git clone https://github.com/Vishnu31314/FiftyFive-Technologies.git
cd FiftyFive-Technologies
cp .env.example .env
docker compose up --build
```

Then open browser and go to http://localhost.

---

## 2. Architecture

```
  [ Browser ] 
       |
       v
  [Nginx :80]  →  #serves the HTML page to browser &
       |           forwards /api/* request to backend
       v
 [Node.js :3000]  →  #handles all API requests & read and write to db
       |
       v 
  [MySQL :3306]  →  #stores all data in named volume
                     (data stay after restart)
```
All 3 services are on same Docker network called 'app-network'.
They talk each other using service names instead IP addresses.


| Tier     | Image        | Port | Role                                 |
|----------|--------------|------|--------------------------------------|
| Frontend | nginx:alpine | 80   | Static HTML + proxy /api → backend   |
| Backend  | node:alpine  | 3000 | REST API, DB queries, health endpoint|
| Database | mysql:8.0    | 3306 | stores all data in name volumes      |

---

## 3. Explanation

**How backend waits for MySql**

I used 'depends_on' with 'condition: service_healthy' in 'Docker-compose.yml'. This makes backend wait until MySQL passes its health check before starting.
But just 'depends_on' is not enough because MySQL can pass health check before it fully accepts connections. So I also wrote a 'connectWithRetry()' function that tries to connect every 5 seconds until it connects successfully.
This way backend never crashes permanently even if MySQL takes time.

**How Nginx gets backend URL dynamically**

I did not hardcode the backend URL in nginx config file. Instead I made a file 'nginx.conf.template' that has '${BACKEND_URL}' written in it.
When the container starts nginx automatically runs envsubst command which reads the '.env' files and replaces '${BACKEND_URL}' with actual value. So the URL always  comes from environment variable not from the code.

**How services communicate**

All containers are connected to a custom bridge network on 'app-network'. Docker has build-in DNS for this so containers find each other by name.
Backend connects to database & Frontend connects to backend using hostname db backend not an IP address.

---

## 4.Testing Steps

**How to access Frontend**

Open any browser and type:
```bash
http://loacalhost
```
You will see the live dashboard with all features and stats.

**How to hit API via Nginx proxy**

```bash
# check if backend is running
curl http://localhost/api/

# check database connection
curl http://localhost/api/health

# see total visits stored in MySQL
curl http://localhost/api/visits

# see recent request history
curl http://localhost/api/visits/log

# get all messages from database
curl http://localhost/api/messages

# add a new message to database
curl -X POST http://localhost/api/messages \
  -H "Content-Type: application/json" \
  -d '{"author":"Vishnu","content":"Hello FiftyFive"}'

# watch live logs of all 3 services
docker compose logs -f
```

---

## 5. Failure Scenario

**How to test MySQL restart**
```bash
docker restart fiftyfix-devops-db-1
```

**What happens to backend**

When MySQL container stops the backend immediatily loses its db connection. The /health endpoint returning error 500 with msg db unreachable. Backend does not crash but just cannot talk to database temporarily.

**How it recovers**

I wrote a 'connectWithRetry' function in app.js that handles this. When connention is lost the error handler catches it automatically.
Then it waits 5 seconds and tries to reconnection. It keeps retrying every 5 seconds until MySQL comes back online.

**Recovery time**

In my testing recovery takes around 10 to 15 seconds after MySQL restarts.

**How I handled it**

-connectWithRetry() creates fresh connection on every retry attempt
-db.on('error') catches PROTOCOL_CONNECTION_LOST automatically
-restart: unless-stopped in docker-compose.yml recovers crashed containers
-/health endpoint returns proper error message during downtime

---

## 6. Bonus Features

**Multi-stage Docker build**

Backend Dockerfile has two stages. First stage installs all npm packages.
Second stage copies only the application files and node_modules.
This keeps final image size smaller and cleaner.

**Non-root user**

In backend Dockerfile I created a user called appuser.
The Node.js process runs as appuser not as root.
Running containers as root is a security risk so this is better practice.

---

## 7. Project Structure

```
FiftyFive-Technologies/
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

## 8. Environment Setup
 
```bash
cp .env.example .env
```

Copy .env.example to .env and fill your values:

```
MYSQL_ROOT_PASSWORD=yourpassword
MYSQL_DATABASE=appdb
MYSQL_USER=appuser
MYSQL_PASSWORD=yourpassword
```
Never commit .env file. It is already added to .gitignore.

---