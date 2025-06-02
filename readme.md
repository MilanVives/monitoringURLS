# Node.js Deployment Monitoring Dashboard

![Dashboard Logo](public/img/logo.svg)

A real-time dashboard to monitor the status of Node.js project deployments from student submissions.

## Features

- 🟢 **Real-time status monitoring** (online/offline indicators)
- ⚡ **Instant updates** via WebSocket connection
- 📅 **Submission time tracking** (days/hours since deployed)
- 📈 **Uptime statistics** with historical data
- 🔢 **Submission count per user** (number of submissions shown next to each user's name)
- 🔗 **Direct links** to live deployments and GitHub repos
- 🛡️ **Dockerized** for easy deployment
- 📱 **Fully responsive** design

## Quick Start

### With Docker (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/MilanVives/monitoringURLS.git
cd monitoringURLS

# 2. Add your Node.csv file to the project root

# 3. Start the application
docker compose up -d --build

# 4. Access the dashboard at http://localhost:3000
```

### Manual Setup

```bash
# Install dependencies
npm install

# Start the server
node server.js
```

## CSV File Format

Place your Node.csv in the project root with these required columns:

| Column | Header                | Description                        |
|--------|----------------------|------------------------------------|
| 4      | Naam                 | Student name                       |
| 11     | Live_Deployment_URL  | URL to monitor                     |
| 3      | Tijd_van_voltooien   | Submission timestamp (DD-MM-YYYY HH:mm) |

Example row:

```
2;25-5-2025 19:08;25-5-2025 19:12;...;http://example.com:3000/;...
```

## Technical Overview

### Project Structure

```
.
├── Dockerfile
├── compose.yaml
├── Node.csv
├── public/
│   ├── index.html
│   ├── styles.css
│   └── img/
│       └── logo.svg
├── services/
│   ├── csvService.js
│   ├── uptimeService.js
│   └── wsService.js
├── utils/
│   └── dateUtils.js
├── server.js
└── readme.md
```

- **public/**: Frontend assets (HTML, CSS, logo)
- **services/**: Backend logic split into CSV, uptime, and WebSocket services
- **utils/**: Utility functions (date parsing, etc.)
- **server.js**: Main server entry point

### Monitoring Workflow

- Backend checks all URLs every 5 minutes (configurable)
- Status changes trigger WebSocket events
- Frontend updates specific tiles without refresh
- Uptime statistics recalculate automatically
- **Each user's tile shows the number of submissions (based on unique email) in parentheses next to their name. Only the latest submission is fully visible; earlier ones are grayed out.**

### Configuration

Environment variables (set in compose.yaml or Dockerfile):

| Variable        | Default | Description                        |
|----------------|---------|------------------------------------|
| PORT           | 3000    | Application port                   |
| CHECK_INTERVAL | 300000  | Status check interval in ms (5 min) |
| NODE_ENV       |         | Runtime environment                |

## Logo

The dashboard logo is located at `public/img/logo.svg` and appears in the top left of the dashboard.

## Troubleshooting

| Symptom                | Solution                                      |
|------------------------|-----------------------------------------------|
| Dashboard not loading  | Check Docker logs: `docker compose logs -f`   |
| CSV data not appearing | Verify file permissions: `chmod 644 Node.csv` |
| WebSocket disconnects  | Automatic reconnection every 5 seconds        |
| Status not updating    | Ensure port 3000 is open                      |

## License

MIT License - Free for academic and commercial use
