// VibePulse — serveur minimal de partage + signalisation WebRTC
// Node.js 18+
// Installation : npm init -y && npm i express socket.io cors
// Lancement   : node vibepulse-server.js

const express = require("express");
const http = require("http");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET","POST"] } });

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "vibepulse-catalog.json");

function readCatalog() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { videos: [], shorts: [], updatedAt: Date.now() };
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (e) {
    console.error("catalog read error", e);
    return { videos: [], shorts: [], updatedAt: Date.now() };
  }
}

function writeCatalog(data) {
  const temp = DATA_FILE + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(data));
  fs.renameSync(temp, DATA_FILE);
}

app.get("/api/health", (_req, res) => res.json({ ok: true, time: Date.now() }));

// Catalogue public partagé par tous les clients.
app.get("/api/catalog", (req, res) => {
  const data = readCatalog();
  const limit = Math.min(Math.max(parseInt(req.query.limit || "500", 10), 1), 2000);
  const offset = Math.max(parseInt(req.query.offset || "0", 10), 0);
  const videos = Array.isArray(data.videos) ? data.videos : [];
  const shorts = Array.isArray(data.shorts) ? data.shorts : [];

  res.json({
    videos: videos.slice(offset, offset + limit),
    shorts: offset === 0 ? shorts.slice(0, limit) : [],
    totalVideos: videos.length,
    totalShorts: shorts.length,
    offset,
    limit,
    updatedAt: data.updatedAt || 0
  });
});

// Publier/ajouter des contenus au catalogue public.
// En production, protège cette route par authentification.
app.post("/api/catalog/merge", (req, res) => {
  const incoming = req.body || {};
  const current = readCatalog();
  const videos = Array.isArray(current.videos) ? current.videos : [];
  const shorts = Array.isArray(current.shorts) ? current.shorts : [];

  const byVideoId = new Map(videos.map(v => [String(v.youtubeId || v.id), v]));
  for (const v of (incoming.videos || [])) {
    byVideoId.set(String(v.youtubeId || v.id), v);
  }

  const byShortId = new Map(shorts.map(v => [String(v.youtubeId || v.tiktokId || v.id), v]));
  for (const s of (incoming.shorts || [])) {
    byShortId.set(String(s.youtubeId || s.tiktokId || s.id), s);
  }

  const next = {
    videos: [...byVideoId.values()],
    shorts: [...byShortId.values()],
    updatedAt: Date.now()
  };
  writeCatalog(next);
  res.json({ ok: true, videos: next.videos.length, shorts: next.shorts.length });
});

// Socket.IO : messagerie + signalisation WebRTC.
const users = new Map(); // name -> socket.id

io.on("connection", socket => {
  socket.on("identify", data => {
    if (!data || !data.name) return;
    socket.data.name = data.name;
    socket.data.id = data.id || "";
    users.set(data.name, socket.id);
  });

  socket.on("send_message", data => {
    const target = users.get(data?.to);
    if (target) io.to(target).emit("receive_message", {
      sender: data?.sender || socket.data.name || "Contact",
      text: data?.text || ""
    });
  });

  socket.on("like_post", data => {
    // Le client actuel écoute update_likes.
    io.emit("update_likes", {
      post_id: data?.post_id,
      likes: Number(data?.likes || 0)
    });
  });

  socket.on("call_user", data => {
    const target = users.get(data?.to);
    if (target) io.to(target).emit("incoming_call", {
      from: data?.from || socket.data.name,
      fromId: data?.fromId || ""
    });
  });

  socket.on("call_response", data => {
    const target = users.get(data?.to);
    if (target) io.to(target).emit("call_response", {
      from: data?.from || socket.data.name,
      accepted: !!data?.accepted
    });
  });

  socket.on("webrtc_offer", data => {
    const target = users.get(data?.to);
    if (target) io.to(target).emit("webrtc_offer", {
      from: data?.from || socket.data.name,
      to: data?.to,
      offer: data?.offer
    });
  });

  socket.on("webrtc_answer", data => {
    const target = users.get(data?.to);
    if (target) io.to(target).emit("webrtc_answer", {
      from: data?.from || socket.data.name,
      to: data?.to,
      answer: data?.answer
    });
  });

  socket.on("webrtc_ice_candidate", data => {
    const target = users.get(data?.to);
    if (target) io.to(target).emit("webrtc_ice_candidate", {
      from: data?.from || socket.data.name,
      to: data?.to,
      candidate: data?.candidate
    });
  });

  socket.on("end_call", data => {
    const target = users.get(data?.to);
    if (target) io.to(target).emit("call_ended", {
      from: data?.from || socket.data.name
    });
  });

  socket.on("disconnect", () => {
    if (socket.data.name && users.get(socket.data.name) === socket.id) {
      users.delete(socket.data.name);
    }
  });
});

app.use(express.static(__dirname));

server.listen(PORT, () => {
  console.log(`VibePulse serveur: http://localhost:${PORT}`);
});
