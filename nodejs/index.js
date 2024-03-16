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

let localMediaStream = null;
// let localDisplayMediaStream = null;

let streams = {};

let peers = {};
let peerMediaElements = {};
let peerToIP = {};

let myId = "";
let myIp = "";
let isLeader = false;
let initialNegotiation = true;

/**************/
/*** Client ***/
/**************/
function init() {
  setupSignalingSocket();
  Init();
  setupLocalMedia(joinChannel);
}

function setupSignalingSocket() {
  signalingSocket = io(SIGNALING_SERVER);
  signalingSocket.on("connect", () => {
    console.log("Connected to signaling server");
  });
  signalingSocket.on("leader", handleLeader);
  signalingSocket.on("ipInfo", handleIpInfo);
  signalingSocket.on("addPeer", handleAddPeer);
  signalingSocket.on("sessionDescription", handleSessionDescription);
  signalingSocket.on("iceCandidate", handleIceCandidate);
  signalingSocket.on("removePeer", handleRemovePeer);
  signalingSocket.on("disconnect", handleDisconnect);
}

function handleIpInfo(config) {
  peerToIP = config.peerToIP;
  console.log(peerToIP);
}

function Init() {
  let externalIP = "";
  const pc = new RTCPeerConnection({
    iceServers: ICE_SERVERS,
  });
  pc.createDataChannel("");
  pc.createOffer().then((offer) => pc.setLocalDescription(offer));
  pc.onicecandidate = (ice) => {
    if (!ice || !ice.candidate || !ice.candidate.candidate) {
      pc.close();
      signalingSocket.emit("initialized", {
        external_ip: externalIP,
      });
      myIp = externalIP;
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
  let peer_id = config.peer_id;
  if (peer_id in peers) return;
  console.debug(`DEBUG: peer_id: ${peer_id}`);

  console.group("Logic: Initializing RTCPeerConnection");
  let peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peers[peer_id] = peerConnection;
  console.groupEnd();

  console.group("Logic: Adding my stream to peer connections");
  localMediaStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localMediaStream);
  });
  console.groupEnd();

  peerConnection.onnegotiationneeded = (event) => {
    console.group("Event: onnegotiationneeded");
    handlePeerNegotiation(peer_id, peerConnection, config.should_create_offer);
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
    (isLeader && myIp === peerToIP[peer_id] && peers[peer_id])
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
    if (peerToIP[peer_id] && peerToIP[peer_id] !== myIp && isLeader) {
      console.log(`${peerToIP[peer_id]} !== ${myIp}`);
      addStreamToPeers(event.streams[0], peer_id);
    }
  }, 1000);
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
  // await navigator.mediaDevices
  //   .getDisplayMedia({ audio: true, video: true })
  //   .then((stream) => {
  //     localDisplayMediaStream = stream;
  //   })
  //   .catch((err) => {
  //     console.log("Error getting display media");
  //     console.log(err);
  //   });
}

function joinChannel() {
  signalingSocket.emit("join", CHANNEL);
}

// this function is called with a stream and its job is to add it to all the peer connections and renegotiate
function addStreamToPeers(stream, peer_id) {
  console.log("Adding stream to peers");

  const peerIDs = Object.keys(peers);
  let myPeers = [];
  let otherPeers = [];
  for (let i = 0; i < peerIDs.length; i++) {
    if (peerToIP[peerIDs[i]] === myIp) {
      myPeers.push(peerIDs[i]);
      stream.getTracks().forEach((track) => {
        peers[peerIDs[i]].addTrack(track, stream);
      });
    }
    else{
      otherPeers.push(peerIDs[i]);
    }
  }

  for (let i = 0; i < otherPeers.length; i++) {
    // get tracks of my peers 
    // send it to other peers   
  }
}

init(); // Start the initialization process
