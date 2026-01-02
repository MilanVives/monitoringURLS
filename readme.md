# Node.js Deployment Monitoring Dashboard

![Dashboard Logo](public/img/logo.svg)

A real-time dashboard to monitor the status of Node.js project deployments from student submissions with MongoDB persistence and admin controls.

## Features

- 🟢 **Real-time status monitoring** (online/offline indicators)
- ⚡ **Instant updates** via WebSocket connection
- 📅 **Submission time tracking** (days/hours since deployed)
- 📈 **Uptime statistics** with historical data
- 💾 **MongoDB persistence** - All servers and status history stored in database
- 📊 **Detailed server pages** - Click any tile to view full statistics and history
- 🔒 **Protected admin panel** - Manage servers, upload CSV files, clear database
- 👁️ **Hide/Show servers** - Hide servers from main dashboard without deleting
- 🗑️ **Manual server management** - Delete individual servers from the database
- 🔢 **Submission count per user** (number of submissions shown next to each user's name)
- 🔗 **Direct links** to live deployments and GitHub repos
- 🛡️ **Dockerized** for easy deployment
- 📱 **Fully responsive** design

## Quick Start

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or remote instance)

### With Docker (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/MilanVives/monitoringURLS.git
cd monitoringURLS

# 2. Create .env file from example
cp .env.example .env

# 3. Edit .env with your MongoDB URI and admin password
# MONGODB_URI=mongodb://localhost:27017/monitoring
# ADMIN_PASSWORD=your-secure-password

# 4. Add your Node.csv file to the project root

# 5. Start the application
docker compose up -d --build

# 6. Access the dashboard at http://localhost:3000
```

### Manual Setup

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Edit .env with your configuration
nano .env

# Start MongoDB (if running locally)
mongod

# Start the server
node server.js
```

## Environment Variables

Create a `.env` file in the project root:

| Variable                | Default                              | Description                                          |
| ----------------------- | ------------------------------------ | ---------------------------------------------------- |
| MONGODB_URI             | mongodb://localhost:27017/monitoring | MongoDB connection string                            |
| ADMIN_PASSWORD          | admin123                             | Password for admin panel                             |
| SESSION_SECRET          | (random)                             | Secret for session encryption                        |
| PORT                    | 3000                                 | Application port                                     |
| CLOUDFLARE_TUNNEL_TOKEN | (none)                               | Cloudflare Tunnel token for public access (optional) |

### Cloudflare Tunnel (Optional)

For production deployment with public HTTPS access:

1. Create a Cloudflare Tunnel at https://one.dash.cloudflare.com/
2. Copy your tunnel token
3. Add to `.env` file:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoixxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
4. Configure public hostname in Cloudflare dashboard
5. Deploy with `docker compose up -d`

See `CLOUDFLARE_TUNNEL_SETUP.md` for detailed instructions.

## Admin Panel

Access the admin panel at `http://localhost:3000/admin.html`

**Default password:** `admin123` (change this in .env)

### Admin Features:

- **Upload CSV** - Import new servers from CSV file
- **Clear Database** - Remove all servers and history (with confirmation)
- **Hide/Unhide Servers** - Hide servers from public dashboard without deleting
- **Delete Servers** - Permanently remove servers from database
- **View All Servers** - See hidden and visible servers

## Server Details Page

Click any server tile on the dashboard to view:

- Current status and latency
- Uptime percentage
- Total checks performed
- Online/Offline counts
- Average latency over time
- Visual history chart (last 100 checks)
- Detailed history table (last 50 checks)
- Links to GitHub and documentation

## CSV File Format

Place your Node.csv in the project root with these required columns:

| Column | Header              | Description                             |
| ------ | ------------------- | --------------------------------------- |
| 4      | Naam                | Student name                            |
| 11     | Live_Deployment_URL | URL to monitor                          |
| 3      | Tijd_van_voltooien  | Submission timestamp (DD-MM-YYYY HH:mm) |

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
├── .env (create from .env.example)
├── config/
│   └── database.js         # MongoDB connection
├── models/
│   └── Server.js           # Server schema
├── middleware/
│   └── auth.js             # Authentication middleware
├── public/
│   ├── index.html          # Main dashboard
│   ├── admin.html          # Admin panel
│   ├── server.html         # Server details page
│   ├── styles.css
│   └── img/
│       └── logo.svg
├── services/
│   ├── csvService.js       # CSV parsing
│   ├── databaseService.js  # MongoDB operations
│   ├── uptimeService.js    # Status checking
│   └── wsService.js        # WebSocket updates
├── utils/
│   └── dateUtils.js
├── uploads/                # Temporary CSV upload folder
├── server.js
└── readme.md
```

- **config/**: Database configuration
- **models/**: MongoDB schemas
- **middleware/**: Authentication and authorization
- **public/**: Frontend assets (HTML, CSS, logo)
- **services/**: Backend logic split into CSV, database, uptime, and WebSocket services
- **utils/**: Utility functions (date parsing, etc.)
- **server.js**: Main server entry point

### Database Schema

**Server Model:**

- `name`: Student name
- `url`: Deployment URL (indexed)
- `email`: Student email (indexed)
- `github`: GitHub repository URL
- `documentation`: Documentation URL
- `submissionTime`: Original submission timestamp
- `currentStatus`: Current status (online/offline/error/unknown)
- `currentLatency`: Latest latency in milliseconds
- `statusHistory`: Array of status checks with timestamps
- `hidden`: Boolean flag for admin visibility control
- `createdAt`: First import date
- `updatedAt`: Last update date

### Monitoring Workflow

- Backend checks all visible servers every 5 minutes (configurable)
- Each check is stored in MongoDB with timestamp and latency
- Status changes trigger WebSocket events for real-time updates
- Frontend updates specific tiles without refresh
- Uptime statistics calculate from full history in database
- History is limited to last 1000 checks per server to prevent excessive growth

### API Endpoints

**Public Endpoints:**

- `GET /api/urls` - Get all visible servers
- `GET /api/server/:id` - Get server details with statistics
- `GET /api/check-url?url=...` - Check single URL status
- `POST /api/reload-csv` - Reload servers from CSV

**Admin Endpoints (Protected):**

- `POST /api/admin/login` - Authenticate admin
- `POST /api/admin/logout` - Clear session
- `GET /api/admin/check-auth` - Check authentication status
- `GET /api/admin/servers` - Get all servers (including hidden)
- `POST /api/admin/servers/:id/hide` - Hide server
- `POST /api/admin/servers/:id/unhide` - Unhide server
- `DELETE /api/admin/servers/:id` - Delete server
- `POST /api/admin/clear-database` - Clear all servers
- `POST /api/admin/upload-csv` - Upload and import new CSV

### Configuration

Environment variables (set in .env or compose.yaml):

| Variable       | Default                              | Description                         |
| -------------- | ------------------------------------ | ----------------------------------- |
| MONGODB_URI    | mongodb://localhost:27017/monitoring | MongoDB connection string           |
| ADMIN_PASSWORD | admin123                             | Admin panel password                |
| SESSION_SECRET | (random)                             | Session encryption secret           |
| PORT           | 3000                                 | Application port                    |
| CHECK_INTERVAL | 300000                               | Status check interval in ms (5 min) |

## Build

Every time you push to main, GitHub automatically builds a new image.

On production server:

     cd ~/monitoringurls
     git pull && docker compose -f compose.prod.yaml pull && docker compose -f compose.prod.yaml up

-d

## Logo

The dashboard logo is located at `public/img/logo.svg` and appears in the top left of the dashboard.

## Troubleshooting

| Symptom                | Solution                                      |
| ---------------------- | --------------------------------------------- |
| Dashboard not loading  | Check Docker logs: `docker compose logs -f`   |
| CSV data not appearing | Verify file permissions: `chmod 644 Node.csv` |
| WebSocket disconnects  | Automatic reconnection every 5 seconds        |
| Status not updating    | Ensure port 3000 is open                      |

## License

MIT License - Free for academic and commercial use
