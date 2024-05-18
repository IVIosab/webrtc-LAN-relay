const SIGNALING_SERVER = `${location.protocol}//${location.hostname}${
  location.port ? `:${location.port}` : ""
}`;
const PORT = 8080;
const ICE_SERVERS = [
  { url: "stun:stun.l.google.com:19302" },
  // { url: "stun:stun1.l.google.com:19302" },
  // { url: "stun:stun2.l.google.com:19302" },
  // { url: "stun:stun3.l.google.com:19302" },
  // { url: "stun:stun4.l.google.com:19302" },
];

/***************/
/*** STORAGE ***/
/***************/
let signalingSocket = null;

let localMediaStream = null;
let myID = "";
let myIP = "";

let peers = {};
let idToInfo;

/**************/
/*** CLIENT ***/
/**************/
document.addEventListener("DOMContentLoaded", () => {
  const getInfoButton = document.getElementById("GetInfo");
  getInfoButton.addEventListener("click", () => {
    console.group("Get Click");
    getInformation();
    console.groupEnd();
    getInfoButton.remove();
  });

  const startButton = document.querySelector('button[id="Start"]');
  startButton.addEventListener("click", () => {
    console.group("Start Click");
    startSimulation();
    console.groupEnd();
  });

  const stopButton = document.getElementById("Stop");
  stopButton.addEventListener("click", () => {
    console.group("Stop Click");
    stopSimulation();
    console.groupEnd();
  });
});

function startSimulation() {
  console.log("Emitting startSimulation...");
  signalingSocket.emit("startSimulation");
}

function stopSimulation() {
  console.log("Emitting stopSimulation...");
  signalingSocket.emit("stopSimulation");
}

function sendInformation() {
  console.log("Emitting sendInformation...", {
    ip: myIP,
  });
  signalingSocket.emit("sendInformation", {
    ip: myIP,
  });
}

function getInformation() {
  console.log("Emitting requestInfomration...");
  signalingSocket.emit("requestInformation");
}

async function init() {
  await getPeerIP();
  setupSignalingSocket();
}

function setupSignalingSocket() {
  signalingSocket = io(SIGNALING_SERVER);

  signalingSocket.on("connect", () => {
    console.group("connect Event!");
    console.log("Connected to signaling server");
    console.groupEnd();
  });

  signalingSocket.on("clientID", (config) => {
    console.group("clientID Event!");
    handleClientID(config);
    console.groupEnd();
    setupLocalMedia();
    sendInformation();
  });

  signalingSocket.on("information", (config) => {
    console.group("information Event!");
    handleInformation(config);
    console.groupEnd();
  });

  signalingSocket.on("connectToPeer", (config) => {
    console.group("connectToPeer Event!");
    connectToPeer(config);
    console.groupEnd();
  });

  signalingSocket.on("sessionDescription", (config) => {
    console.group("sessionDescription Event!");
    handleSessionDescription(config);
    console.groupEnd();
  });

  signalingSocket.on("iceCandidate", (config) => {
    console.group("iceCandidate Event!");
    handleIceCandidate(config);
    console.groupEnd();
  });

  signalingSocket.on("starting", () => {
    console.group("Starting Event!");
    const startButton = document.querySelector('button[id="Start"]');
    startButton.remove();
    console.groupEnd();
  });

  signalingSocket.on("stopping", () => {
    console.group("Stopping Event!");
    const stopButton = document.getElementById("Stop");
    stopButton.remove();
    console.groupEnd();
  });
}

function connectToPeer(config) {
  const { peer_id, should_create_offer, bi_connection } = config;
  if (peer_id in peers) return;

  let peerConnection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peers[peer_id] = peerConnection;

  if (bi_connection || (!bi_connection && should_create_offer)) {
    localMediaStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localMediaStream);
    });
  }

  peerConnection.onnegotiationneeded = (event) => {
    handlePeerNegotiation(peer_id, peerConnection, should_create_offer);
  };

  peerConnection.onicecandidate = (event) => {
    handlePeerIceCandidate(peer_id, event.candidate);
  };

  peerConnection.ontrack = (event) => {
    handlePeerTrack(peer_id, event);
  };
}

function handlePeerNegotiation(peer_id, peerConnection, shouldCreateOffer) {
  if (shouldCreateOffer) {
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
  }
}

function handlePeerTrack(peer_id, event) {
  if (event.track.kind !== "video") return;
  createStreamCard(peer_id, "...", false, event.streams[0]);
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

function handleClientID(config) {
  const { id } = config;
  myID = id;
}

function handleInformation(config) {
  idToInfo = config.idToInfo;
}

async function setupLocalMedia() {
  if (localMediaStream) return;
  await navigator.mediaDevices
    .getUserMedia({ audio: true, video: true })
    .then((stream) => {
      localMediaStream = stream;
      createStreamCard(myID, myIP, false, stream);
    });
}

function createStreamCard(cardID, cardIP, cardIsLeader, stream) {
  const container = document.getElementById("streamContainer");

  let StreamCard = document.createElement("div");
  StreamCard.classList.add("node-card"); // Add a class for potential styling

  let mediaElement = createMediaElement();
  attachMediaStream(mediaElement, stream);
  StreamCard.appendChild(mediaElement); // Append the media element to the StreamCard

  let idContent = document.createTextNode(`ID: ${cardID}`);
  let ipContent = document.createTextNode(`IP: ${cardIP}`);
  let leaderContent = document.createTextNode(`Leader: ${cardIsLeader}`);

  StreamCard.appendChild(document.createElement("br"));
  StreamCard.appendChild(idContent);
  StreamCard.appendChild(document.createElement("br"));
  StreamCard.appendChild(ipContent);
  StreamCard.appendChild(document.createElement("br"));
  StreamCard.appendChild(leaderContent);
  StreamCard.appendChild(document.createElement("br"));

  container.appendChild(StreamCard); // Append the StreamCard to the body
}

function attachMediaStream(element, stream) {
  element.srcObject = stream;
}

function createMediaElement() {
  let mediaElement = document.createElement("video");
  mediaElement.autoplay = true;
  mediaElement.muted = true; // You might not want to mute if you want to hear the audio
  mediaElement.controls = true;
  return mediaElement;
}

function handleRelay(id, stream) {
  let ids = Object.keys(idToInfo);

  for (let i = 0; i < ids.length; i++) {
    let info = idToInfo[ids[i]];
    if (info[1] == myIP && info[0] !== myID) {
      stream.getTracks().forEach((track) => {
        console.log(info);
        console.log(info[0]);
        console.log(peers);
        console.log(peers[info[0]]);
        console.log(peers[ids[i]]);
        peers[info[0]].addTrack(track, stream);
      });
    }
  }
}

/*************/
/*** UTILS ***/
/*************/

function getPeerIP() {
  return new Promise((resolve, reject) => {
    let externalIP = "";
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.createDataChannel("");
    pc.createOffer().then((offer) => pc.setLocalDescription(offer));
    pc.onicecandidate = (ice) => {
      if (
        !ice ||
        !ice.candidate ||
        !ice.candidate.candidate ||
        externalIP !== ""
      ) {
        pc.close();
        myIP = externalIP;
        console.log("My IP: ", myIP);
        resolve(externalIP); // Resolve the promise here
        return;
      }
      let split = ice.candidate.candidate.split(" ");
      if (split[7] !== "host") {
        externalIP = split[4];
      }
    };
  });
}

init(); // Start the initialization process
