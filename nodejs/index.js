/**************/
/*** CONFIG ***/
/**************/
const SIGNALING_SERVER = `${location.protocol}//${location.hostname}${
  location.port ? `:${location.port}` : ""
}`;
const ICE_SERVERS = [
  { url: "stun:stun.l.google.com:19302" },
  { url: "stun:stun1.l.google.com:19302" },
  { url: "stun:stun2.l.google.com:19302" },
  { url: "stun:stun3.l.google.com:19302" },
  { url: "stun:stun4.l.google.com:19302" },
  { url: "stun:stun.ekiga.net" },
  { url: "stun:stun.ideasip.com" },
  { url: "stun:stun.rixtelecom.se" },
  { url: "stun:stun.schlund.de" },
];
const CHANNEL = "global";

/***************/
/*** STORAGE ***/
/***************/
let signalingSocket = null;

let myNetmask = "";
let myID = "";
let myIP = "";
let isLeader = false;
let localMediaStream = null;

let lanPeers = {};
let lanStreams = {};
let internetPeers = {};
let internetIPs = {};
let internetStreams = {};

let peersIPs = {};
let peers = {};
let peerMediaElements = {};
let peerToIP = {};

let connections = {};

/**************/
/*** CLIENT ***/
/**************/
// function getUserNetmask() {
//   let userNetmask = prompt("Please enter you netmask (e.g., 255.255.255.0)");
//   return userNetmask;
// }

function init() {
  // myNetmask = getUserNetmask();
  // logDebug(myNetmask, []);
  setupSignalingSocket();
  setupLocalMedia();
  getPeerIP();
}

function setupSignalingSocket() {
  signalingSocket = io(SIGNALING_SERVER);
  signalingSocket.on("connect", () => {
    console.log("Connected to signaling server");
  });
  signalingSocket.on("addPeer", handleAddPeer);
  signalingSocket.on("sessionDescription", handleSessionDescription);
  signalingSocket.on("iceCandidate", handleIceCandidate);
  signalingSocket.on("removePeer", handleRemovePeer);
  signalingSocket.on("disconnect", handleDisconnect);
  signalingSocket.on("leader", handleLeader);
  signalingSocket.on("sendIPInfo", handleIPInfo);
}

function handleAddPeer(config) {
  const { peer_id, should_create_offer, peer_ip } = config;
  if (peer_id in peers) return;
  logDebug("Adding peer", ["peer_id", peer_id]);
  logDebug("Intializing RTCPeerConnection", []);

  let peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peers[peer_id] = peerConnection;
  peersIPs[peer_id] = peer_ip;
  if (peer_ip === myIP) {
    lanPeers[peer_id] = peerConnection;
  } else {
    internetPeers[peer_id] = peerConnection;
  }

  logDebug("Adding local stream to peer connection", []);
  localMediaStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localMediaStream);
  });

  peerConnection.onnegotiationneeded = (event) => {
    handlePeerNegotiation(peer_id, peerConnection, should_create_offer);
  };

  peerConnection.onicecandidate = (event) => {
    handlePeerIceCandidate(peer_id, event.candidate);
  };

  peerConnection.onicegatheringstatechange = (event) => {
    handlePeerIceGathering(peer_id, event.target.iceGatheringState);
  };

  peerConnection.ontrack = (event) => {
    handlePeerTrack(peer_id, event);
  };
}

function handlePeerNegotiation(peer_id, peerConnection, shouldCreateOffer) {
  if (
    shouldCreateOffer ||
    (isLeader && myIP === peerToIP[peer_id] && peers[peer_id])
  ) {
    createAndSendOffer(peer_id, peerConnection);
  }
}

function createAndSendOffer(peer_id, peerConnection) {
  peerConnection.createOffer().then((local_description) => {
    peerConnection.setLocalDescription(local_description).then(() => {
      signalingSocket.emit("relaySessionDescription", {
        peer_id,
        session_description: local_description,
      });
    });
  });
}

function handlePeerIceCandidate(peer_id, candidate) {
  if (candidate) {
    signalingSocket.emit("relayICECandidate", {
      peer_id,
      ice_candidate: candidate,
    });
  } else {
    logDebug("Ice candidate - No candidate", []);
  }
}

function handlePeerIceGathering(peerId, iceGatheringState) {
  switch (iceGatheringState) {
    case "gathering":
      logDebug("Ice gather state change {GATHERING...}", []);
      break;
    case "complete":
      logDebug("Ice gather state change {COMPLETE}", []);
      signalingSocket.emit("logIpInfo");
      break;
  }
}

function handlePeerTrack(peer_id, event) {
  if (event.track.kind !== "video") return;
  let remote_media = createMediaElement();
  attachMediaStream(remote_media, event.streams[0]);
  peerMediaElements[peer_id] = remote_media;
  setTimeout(() => {
    logDebug("Recieved peer stream", ["peer_id", peer_id]);
    if (isLeader) {
      if (peersIPs[peer_id] !== myIP) {
        logDebug("Internet connection stream", [
          "incomingPeerIP",
          peersIPs[peer_id],
          "myIP",
          myIP,
        ]);
        if (!internetStreams[peer_id]) {
          internetStreams[peer_id] = [];
        }
        internetStreams[peer_id].push(event.streams[0]);

        addStreamToPeers(event.streams[0], "LAN");
      } else {
        lanStreams[peer_id] = event.streams[0];

        addStreamToPeers(event.streams[0], "INTERNET");
        addOldInternetStreamsToPeer(peer_id);
      }
    }
  }, 2000);
}

function createMediaElement() {
  let mediaElement = document.createElement("video");
  mediaElement.autoplay = true;
  mediaElement.muted = true;
  mediaElement.controls = true;
  document.body.appendChild(mediaElement);
  return mediaElement;
}

function attachMediaStream(element, stream) {
  element.srcObject = stream;
}
function addStreamToPeers(stream, to) {
  const peersIDs =
    to === "LAN" ? Object.keys(lanPeers) : Object.keys(internetPeers);
  for (let i = 0; i < peersIDs.length; i++) {
    console.log(peersIDs[i]);
    addStreamToPeer(stream, peersIDs[i]);
  }
}

function addStreamToPeer(stream, peer_id) {
  console.log(peer_id);
  console.log(peers[peer_id]);

  stream.getTracks().forEach((track) => {
    peers[peer_id].addTrack(track, stream);
  });
}

function addOldInternetStreamsToPeer(peer_id) {
  const IPs = Object.keys(internetStreams);
  for (let i = 0; i < IPs.length; i++) {
    for (let j = 0; j < internetStreams[IPs].length; j++) {
      addStreamToPeer(internetStreams[IPs[i]][j], peer_id);
    }
  }
}

function addOldLanStreamsToPeer(peer_id) {
  const IPs = Object.keys(lanStreams);
  for (let i = 0; i < IPs.length; i++)
    addStreamToPeer(lanStreams[IPs[i]], peer_id);
}

function handleSessionDescription(config) {
  let peer_id = config.peer_id;
  let desc = new RTCSessionDescription(config.session_description);

  peers[peer_id].setRemoteDescription(desc).then(() => {
    if (desc.type == "offer") {
      peers[peer_id].createAnswer().then((local_description) => {
        peers[peer_id].setLocalDescription(local_description).then(() => {
          signalingSocket.emit("relaySessionDescription", {
            peer_id,
            session_description: local_description,
          });
        });
      });
    }
  });
}

function handleIceCandidate(config) {
  peers[config.peer_id].addIceCandidate(
    new RTCIceCandidate(config.ice_candidate)
  );
}

function handleRemovePeer(config) {
  removePeer(config.peer_id);
}

function removePeer(peer_id) {
  if (peerMediaElements[peer_id]) {
    document.body.removeChild(peerMediaElements[peer_id]);
    delete peerMediaElements[peer_id];
  }
  if (peers[peer_id]) {
    peers[peer_id].close();
    delete peers[peer_id];
  }
}

function handleDisconnect() {
  removeAllPeers();
}

function removeAllPeers() {
  //TODO: consider using a set for IDs
  let IDs = extractPeers();
  for (let i = 0; i < IDs.length; i++) {
    removePeer(IDs[i]);
  }
}

function extractPeers() {
  const mediaIDs = Object.keys(peerMediaElements);
  const peerIDs = Object.keys(peers);
  let IDs = [];
  for (let i = 0; i < mediaIDs.length; i++) {
    if (!IDs.includes(mediaIDs[i])) {
      IDs.push(mediaIDs[i]);
    }
  }
  for (let i = 0; i < peerIDs.length; i++) {
    if (!IDs.includes(peerIDs[i])) {
      IDs.push(peerIDs[i]);
    }
  }
  return IDs;
}

function handleLeader() {
  isLeader = true;
  logDebug("Leader declaration", []);
}

function handleIPInfo(config) {
  peerToIP = config.peerToIP;
  // logDebug("Recieved IP info", ["peerToIP", peerToIP]);
}

function getPeerIP() {
  let externalIP = "";
  const pc = new RTCPeerConnection({
    iceServers: ICE_SERVERS,
  });
  logDebug("Test1", []);
  pc.createDataChannel("");
  logDebug("Test2", []);
  pc.createOffer().then((offer) => pc.setLocalDescription(offer));
  logDebug("Test3", []);
  pc.onicecandidate = (ice) => {
    logDebug("Test4", []);
    // at the end of ice candidates stream (empty candidate) set the external IP and send it to the server
    if (
      !ice ||
      !ice.candidate ||
      !ice.candidate.candidate ||
      externalIP !== ""
    ) {
      logDebug("Test5", []);
      pc.close();
      signalingSocket.emit(
        "sendPeerIP",
        {
          peer_ip: externalIP,
        },
        (response) => {
          logDebug(response, []);
          joinChannel();
        }
      );
      myIP = externalIP;
      return;
    }
    let split = ice.candidate.candidate.split(" ");
    if (!(split[7] === "host")) {
      externalIP = split[4];
    }
  };
}

async function setupLocalMedia() {
  if (localMediaStream) return;
  await navigator.mediaDevices
    .getUserMedia({ audio: true, video: true })
    .then((stream) => {
      localMediaStream = stream;
      let local_media = createMediaElement();
      attachMediaStream(local_media, stream);
    })
    .catch((err) => {
      logError(`Error getting local media {${err}}`, []);
    });
}

function joinChannel() {
  signalingSocket.emit("join", CHANNEL);
}

/*************/
/*** UTILS ***/
/*************/

function logError(error, ...args) {
  console.group(`ERROR: ${error}`);
  for (let i = 0; i < args[0].length - 1; i = i + 2)
    console.error(`\t\t${args[0][i]}: ${args[0][i + 1]}`);
  console.groupEnd();
  throw new Error("Stopping execution...");
}

function logWarning(warning, ...args) {
  console.group(`WARNING: ${warning}`);
  for (let i = 0; i < args[0].length - 1; i = i + 2)
    console.warn(`\t\t${args[0][i]}: ${args[0][i + 1]}`);
  console.groupEnd();
}

function logDebug(debug, ...args) {
  console.group(`DEBUG: ${debug}`);
  for (let i = 0; i < args[0].length; i = i + 2)
    console.debug(`\t\t${args[0][i]}: ${args[0][i + 1]}`);
  console.groupEnd();
}

init(); // Start the initialization process
