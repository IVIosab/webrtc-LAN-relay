const express = require("express");
const https = require("https");
const fs = require("fs");
const socketIO = require("socket.io");

/**************/
/*** CONFIG ***/
/**************/
const PORT = 8080;
const credentials = {
  key: fs.readFileSync("ssl/server-key.pem", "utf8"),
  cert: fs.readFileSync("ssl/server-cert.pem", "utf8"),
};

/*************/
/*** SETUP ***/
/*************/
const app = express();
app.use(express.static(__dirname));
const server = https.createServer(credentials, app);
const io = socketIO.listen(server);

/***************/
/*** STORAGE ***/
/***************/
const CHANNEL = "global";
let channels = {};
let sockets = {};
let ipToDevices = {};
let ipToLeader = {};
let deviceToIp = {};
let connections = {};
let initID = "";

/***************/
/*** SERVER ***/
/***************/
server.listen(PORT, () =>
  console.log(
    `Listening on port ${PORT}
    Execute the following command in another terminal:
    \tngrok http https://127.0.0.1:${PORT}`
  )
);

io.sockets.on("connection", (socket) => {
  console.log(`[${socket.id}] connection accepted`);
  sockets[socket.id] = socket;
  socket.channels = {};

  socket.on("disconnect", () => handleDisconnect(socket));
  socket.on("join", () => handleJoin(socket));
  socket.on("relayICECandidate", (config) =>
    handleIceCandidate(socket, config)
  );
  socket.on("relaySessionDescription", (config) =>
    handleSessionDescription(socket, config)
  );
});

function handleDisconnect(socket) {
  Object.keys(socket.channels).forEach((channel) => {
    partChannel(channel, socket);
  });
  console.log(`[${socket.id}] disconnected`);
  delete sockets[socket.id];
}

function handleJoin(socket) {
  if (initID === "") {
    initID = socket.id;
  }

  console.log(`[${socket.id}] joined "${CHANNEL}" chat`);
  if (!(CHANNEL in channels)) {
    channels[CHANNEL] = {};
  }

  channels[CHANNEL][socket.id] = socket;
  socket.channels[CHANNEL] = CHANNEL;

  if (socket.id !== initID) {
    createPeerConnection(socket, initID, CHANNEL, true);
  }
}

function partChannel(channel, socket) {
  console.log(`[${socket.id}] part`);

  if (!(channel in socket.channels)) {
    console.log(`[${socket.id}] ERROR: not in ${channel}`);
    return;
  }

  delete socket.channels[channel];
  delete channels[channel][socket.id];
  updateIPMappingsOnPart(socket);
}

function handleIceCandidate(socket, config) {
  const { peer_id, ice_candidate } = config;
  console.log(`[${socket.id}] relaying ICE candidate to [${peer_id}]`);

  if (peer_id in sockets) {
    sockets[peer_id].emit("iceCandidate", {
      peer_id: socket.id,
      ice_candidate: ice_candidate,
    });
  }

  updateIPMappingsOnICECandidate(socket, ice_candidate);
}

function handleSessionDescription(socket, config) {
  const { peer_id, session_description } = config;
  console.log(`[${socket.id}] relaying session description to [${peer_id}]`);

  if (peer_id in sockets) {
    sockets[peer_id].emit("sessionDescription", {
      peer_id: socket.id,
      session_description: session_description,
    });
  }
}

function createPeerConnection(socket, peerId, channel, shouldCreateOffer) {
  console.log(`Connecting ${socket.id} with ${peerId}`);
  socket.emit("addPeer", {
    peer_id: peerId,
    should_create_offer: shouldCreateOffer,
  });
  console.log(channels);
  console.log(channel);
  console.log(peerId);
  channels[channel][peerId].emit("addPeer", {
    peer_id: socket.id,
    should_create_offer: !shouldCreateOffer,
  });

  if (!(socket.id in connections)) {
    connections[socket.id] = {};
  }
  if (!(peerId in connections)) {
    connections[peerId] = {};
  }
  connections[socket.id][peerId] = true;
  connections[peerId][socket.id] = true;
}

function updateIPMappingsOnICECandidate(socket, ice_candidate) {
  const ips = ice_candidate.candidate.match(/([0-9]{1,3}(\.[0-9]{1,3}){3})/g);
  if (ips && ips.length > 0) {
    const socketIp = ips[0];
    deviceToIp[socket.id] = socketIp;

    if (!(socketIp in ipToDevices)) {
      ipToDevices[socketIp] = [];
    }

    if (!ipToDevices[socketIp].includes(socket.id)) {
      ipToDevices[socketIp].push(socket.id);
    }

    if (!ipToLeader[socketIp]) {
      ipToLeader[socketIp] = socket.id;
    }

    checkAndConnectDevicesUnderSameIP(socketIp);
  }
}

function checkAndConnectDevicesUnderSameIP(ip) {
  if (ipToDevices[ip].length <= 1) {
    checkAndConnectLeaderDevices();
    return;
  }

  ipToDevices[ip].forEach((deviceId) => {
    ipToDevices[ip].forEach((otherDeviceId) => {
      if (deviceId !== otherDeviceId && !isConnected(deviceId, otherDeviceId)) {
        createPeerConnection(sockets[deviceId], otherDeviceId, CHANNEL, true);
      }
    });
  });
}

function checkAndConnectLeaderDevices() {
  Object.keys(ipToLeader).forEach((ip) => {
    const leaderId = ipToLeader[ip];
    Object.keys(ipToLeader).forEach((otherIp) => {
      const otherLeaderId = ipToLeader[otherIp];
      if (ip !== otherIp && !isConnected(leaderId, otherLeaderId)) {
        createPeerConnection(sockets[leaderId], otherLeaderId, CHANNEL, true);
      }
    });
  });
}

function isConnected(deviceId, otherDeviceId) {
  return connections[deviceId] && connections[deviceId][otherDeviceId];
}

function updateIPMappingsOnPart(socket) {
  const socketIp = deviceToIp[socket.id];
  if (!socketIp) return;

  const deviceIndex = ipToDevices[socketIp].indexOf(socket.id);
  if (deviceIndex > -1) {
    ipToDevices[socketIp].splice(deviceIndex, 1);
  }

  if (ipToDevices[socketIp].length === 0) {
    delete ipToDevices[socketIp];
    delete ipToLeader[socketIp];
  } else {
    if (ipToLeader[socketIp] === socket.id) {
      ipToLeader[socketIp] = ipToDevices[socketIp][0];
    }
  }

  delete deviceToIp[socket.id];
}
