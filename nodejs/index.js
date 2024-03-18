/**************/
/*** CONFIG ***/
/**************/
const SIGNALING_SERVER = `${location.protocol}//${location.hostname}${
  location.port ? `:${location.port}` : ""
}`;
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
const CHANNEL = "global";

/***************/
/*** STORAGE ***/
/***************/
let signalingSocket = null;

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
/*** Client ***/
/**************/
function init() {
  setupSignalingSocket();
  getPeerIP();
}

function setupSignalingSocket() {
  signalingSocket = io(SIGNALING_SERVER);
  signalingSocket.on("connect", () => {
    console.log("Connected to signaling server");
  });
  signalingSocket.on("leader", handleLeader);
  signalingSocket.on("sendIPInfo", handleIPInfo);
  signalingSocket.on("addPeer", handleAddPeer);
  signalingSocket.on("sessionDescription", handleSessionDescription);
  signalingSocket.on("iceCandidate", handleIceCandidate);
  signalingSocket.on("removePeer", handleRemovePeer);
  signalingSocket.on("disconnect", handleDisconnect);
}

function handleIPInfo(config) {
  peerToIP = config.peerToIP;
  console.log(peerToIP);
}

/**
 * This starts a simple DataChannel to be able to use ice candidates
 * to get the peer's IP which is then relayed to the server.
 */
function getPeerIP() {
  let externalIP = "";
  const pc = new RTCPeerConnection({
    iceServers: ICE_SERVERS,
  });
  pc.createDataChannel("");
  pc.createOffer().then((offer) => pc.setLocalDescription(offer));
  pc.onicecandidate = (ice) => {
    // at the end of ice candidates stream (empty candidate) set the external IP and send it to the server
    if (!ice || !ice.candidate || !ice.candidate.candidate) {
      pc.close();
      signalingSocket.emit(
        "sendPeerIP",
        {
          peer_ip: externalIP,
        },
        (response) => {
          console.log(response);
          setupLocalMedia(joinChannel);
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

function handleLeader() {
  isLeader = true;
  console.log("LEADER");
}

function handleAddPeer(config) {
  const { peer_id, should_create_offer, peer_ip } = config;
  if (peer_id in peers) return;
  console.debug(`DEBUG: peer_id: ${peer_id}`);

  console.group("Logic: Initializing RTCPeerConnection");
  let peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peers[peer_id] = peerConnection;
  peersIPs[peer_id] = peer_ip;
  if (peer_ip === myIP) {
    lanPeers[peer_id] = peerConnection;
  } else {
    internetPeers[peer_id] = peerConnection;
  }
  console.groupEnd();

  console.group("Logic: Adding my stream to peer connections");
  localMediaStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localMediaStream);
  });
  console.groupEnd();

  peerConnection.onnegotiationneeded = (event) => {
    console.group("Event: onnegotiationneeded");
    handlePeerNegotiation(peer_id, peerConnection, should_create_offer);
    console.groupEnd();
  };

  peerConnection.onicecandidate = (event) => {
    // console.group("Event: onicecandidate");
    handlePeerIceCandidate(peer_id, event.candidate);
    // console.groupEnd();
  };

  peerConnection.onicegatheringstatechange = (event) => {
    console.group("Event: onicegatheringstatechange");
    handlePeerIceGathering(peer_id, event.target.iceGatheringState);
    console.groupEnd();
  };

  peerConnection.ontrack = (event) => {
    console.group("Event: ontrack");
    handlePeerTrack(peer_id, event);
    console.groupEnd();
  };
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

function handlePeerNegotiation(peer_id, peerConnection, shouldCreateOffer) {
  if (
    shouldCreateOffer ||
    (isLeader && myIP === peerToIP[peer_id] && peers[peer_id])
  ) {
    createAndSendOffer(peer_id, peerConnection);
  }
}

function handlePeerIceCandidate(peer_id, candidate) {
  if (candidate) {
    signalingSocket.emit("relayICECandidate", {
      peer_id,
      ice_candidate: candidate,
    });
  } else {
    // console.log("EVENT: Ice candidate - No candidate");
  }
}

/**
 * should be used in relaying streams
 */
function handlePeerIceGathering(peerId, iceGatheringState) {
  switch (iceGatheringState) {
    case "gathering":
      console.debug("Gathering");
      break;
    case "complete":
      console.debug("Complete");
      signalingSocket.emit("logIpInfo");
      break;
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

function handlePeerTrack(peer_id, event) {
  if (event.track.kind !== "video") return;
  let remote_media = createMediaElement();
  attachMediaStream(remote_media, event.streams[0]);
  peerMediaElements[peer_id] = remote_media;
  setTimeout(() => {
    console.log("Got Track for " + peer_id);
    console.log(peerToIP[peer_id]);
    if (isLeader) {
      if (peersIPs[peer_id] !== myIP) {
        console.log(`${peersIPs[peer_id]} !== ${myIP}`);
        internetStreams[peer_id] = event.streams[0];
        // console.log(connections);
        addInternetStreamsToLanPeers();
        addLanStreamsToInternetPeers();
      } else {
        lanStreams[peer_id] = event.streams[0];
        addLanStreamsToInternetPeers();
        addInternetStreamsToLanPeers();
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

async function setupLocalMedia(callback) {
  if (localMediaStream) return callback();
  await navigator.mediaDevices
    .getUserMedia({ audio: true, video: true })
    .then((stream) => {
      localMediaStream = stream;
      let local_media = createMediaElement();
      attachMediaStream(local_media, stream);
      callback();
    })
    .catch((err) => {
      console.log("Error getting local media");
      console.log(err);
    });
}

function joinChannel() {
  signalingSocket.emit("join", CHANNEL);
}

function addInternetStreamsToLanPeers() {
  const internetStreamsIDs = Object.keys(internetStreams);
  // console.log(`internetStreamsIDs: ${internetStreamsIDs.length}`);

  for (let i = 0; i < internetStreamsIDs.length; i++) {
    addInternetStreamToLanPeers(
      internetStreams[internetStreamsIDs[i]],
      internetStreamsIDs[i]
    );
  }
}

function addInternetStreamToLanPeers(stream, peer_id) {
  const lanPeersIDs = Object.keys(lanPeers);

  for (let i = 0; i < lanPeersIDs.length; i++) {
    if (!isConnected(peer_id, lanPeersIDs[i])) {
      stream.getTracks().forEach((track) => {
        peers[lanPeersIDs[i]].addTrack(track, stream);
      });
      lanStreams[lanPeersIDs[i]].getTracks().forEach((track) => {
        peers[peer_id].addTrack(track, lanStreams[lanPeersIDs[i]]);
      });
      connections[lanPeersIDs[i]][peer_id] = true;
      connections[peer_id][lanPeersIDs[i]] = true;
    }
  }
}

function addLanStreamsToInternetPeers() {
  const lanStreamsIDs = Object.keys(lanStreams);
  // console.log(`lanStreamsIDs: ${lanStreamsIDs.length}`);
  // console.log(connections);
  for (let i = 0; i < lanStreamsIDs.length; i++) {
    addLanStreamToInternetPeers(lanStreams[lanStreamsIDs[i]], lanStreamsIDs[i]);
  }
}

function addLanStreamToInternetPeers(stream, peer_id) {
  const internetPeersIDs = Object.keys(internetPeers);

  for (let i = 0; i < internetPeersIDs.length; i++) {
    // console.log(`addLanStreamToInternetPeers --- ${i}`);
    if (!isConnected(peer_id, internetPeersIDs[i])) {
      // console.log(`addLanStreamToInternetPeers ---CONNECTING...--- ${i}`);
      // console.log(`internet add lan ${peer_id} ${internetPeersIDs[i]}`);
      stream.getTracks().forEach((track) => {
        peers[internetPeersIDs[i]].addTrack(track, stream);
      });
      internetStreams[internetPeersIDs[i]].getTracks().forEach((track) => {
        peers[peer_id].addTrack(track, internetStreams[internetPeersIDs[i]]);
      });
      connections[internetPeersIDs[i]][peer_id] = true;
      connections[peer_id][internetPeersIDs[i]] = true;
    }
  }
}

function isConnected(peer1, peer2) {
  // console.log(connections);
  if (!peer1 || !peer2) {
    console.group(`Unexpected undefined:`);
    console.error(`\tpeer1: ${peer1}`);
    console.error(`\tpeer2: ${peer2}`);
    console.groupEnd();
    return false;
  }

  if (!connections[peer1]) {
    connections[peer1] = {};
  }
  if (!connections[peer2]) {
    connections[peer2] = {};
  }

  if (!connections[peer1][peer2]) {
    return false;
  }
  return true;
}

init(); // Start the initialization process
