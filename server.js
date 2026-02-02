const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;

const server = http.createServer((req, res) => {
  const urlPath = req.url === "/" ? "/index.html" : req.url;
  const filePath = path.join(__dirname, "public", urlPath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found");
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html",
      ".css": "text/css",
      ".js": "application/javascript",
      ".json": "application/json",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".ico": "image/x-icon"
    };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

// Simple room support (optional)
const rooms = new Map(); // roomId -> Set(ws)

function joinRoom(ws, roomId) {
  if (!rooms.has(roomId)) rooms.set(roomId, new Set());
  rooms.get(roomId).add(ws);
  ws.roomId = roomId;
}
function leaveRoom(ws) {
  const roomId = ws.roomId;
  if (!roomId) return;
  const set = rooms.get(roomId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) rooms.delete(roomId);
  }
  ws.roomId = null;
}
function broadcast(roomId, obj) {
  const set = rooms.get(roomId);
  if (!set) return;
  const msg = JSON.stringify(obj);
  for (const client of set) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

wss.on("connection", (ws) => {
  ws.roomId = null;

  ws.on("message", (raw) => {
    let data;
    try { data = JSON.parse(raw); } catch { return; }

    if (data.type === "join") {
      leaveRoom(ws);
      const roomId = (data.roomId || "general").toLowerCase();
      joinRoom(ws, roomId);
      ws.user = data.user || { id: "anon", name: "Anon", glyph: "🙂" };
      ws.send(JSON.stringify({ type: "joined", roomId }));
      broadcast(roomId, { type: "presence", event: "join", user: ws.user, at: Date.now() });
      return;
    }

    if (!ws.roomId) return;

    if (data.type === "chat") {
      broadcast(ws.roomId, { type: "chat", message: data.message, at: Date.now() });
      return;
    }

    if (data.type === "typing") {
      broadcast(ws.roomId, {
        type: "typing",
        userId: data.userId,
        userName: data.userName,
        isTyping: !!data.isTyping,
        at: Date.now()
      });
      return;
    }

    if (data.type === "reaction") {
      broadcast(ws.roomId, { type: "reaction", payload: data.payload, at: Date.now() });
      return;
    }
  });

  ws.on("close", () => {
    if (ws.roomId) broadcast(ws.roomId, { type: "presence", event: "leave", user: ws.user, at: Date.now() });
    leaveRoom(ws);
  });
});

server.listen(PORT, () => console.log("Server listening on", PORT));
