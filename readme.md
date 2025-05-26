markdown

# Node.js Deployment Monitoring Dashboard

![Dashboard Logo](./img/logo.svg)

A real-time dashboard to monitor the status of Node.js project deployments from student submissions.

## Features

- 🟢 **Real-time status monitoring** (online/offline indicators)
- ⚡ **Instant updates** via WebSocket connection
- 📅 **Submission time tracking** (days/hours since deployed)
- 📈 **Uptime statistics** with historical data
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
docker-compose up -d --build

# 4. Access the dashboard at http://localhost:3000
Manual Setup

bash
# Install dependencies
npm install

# Start the server
node server.js
CSV File Format

Place your Node.csv in the project root with these required columns:

Column	Header	Description
4	Naam	Student name
11	Live_Deployment_URL	URL to monitor
3	Tijd_van_voltooien	Submission timestamp (DD-MM-YYYY HH:mm)
Example row:

2;25-5-2025 19:08;25-5-2025 19:12;...;http://example.com:3000/;...
Technical Overview

Architecture

Diagram
Code
Monitoring Workflow

Backend checks all URLs every 5 minutes (configurable)
Status changes trigger WebSocket events
Frontend updates specific tiles without refresh
Uptime statistics recalculate automatically
Configuration

Environment variables (set in docker-compose.yml):

Variable	Default	Description
PORT	3000	Application port
CHECK_INTERVAL	300000	Status check interval in ms (5 mins)
NODE_ENV	production	Runtime environment
Troubleshooting

Symptom	Solution
Dashboard not loading	Check Docker logs: docker-compose logs -f
CSV data not appearing	Verify file permissions: chmod 644 Node.csv
WebSocket disconnects	Automatic reconnection every 5 seconds
Status not updating	Ensure ports 3000 (HTTP) and 3001 (WS) are open
Project Structure

.
├── docker-compose.yml    # Container orchestration
├── Dockerfile           # Container configuration
├── Node.csv             # Student submission data
├── public/
│   └── index.html       # Dashboard frontend
├── img/
│   └── logo.svg         # Application logo
└── server.js            # Backend server
License

MIT License - Free for academic and commercial use
```
