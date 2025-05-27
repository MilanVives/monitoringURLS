const WebSocket = require('ws');

function setupWebSocketServer(server) {
  const wss = new WebSocket.Server({ noServer: true });
  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });
  return wss;
}

function broadcastStatusUpdate(wss, url, status) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ url, status }));
    }
  });
}

module.exports = {
  setupWebSocketServer,
  broadcastStatusUpdate
}; 