/** CONFIG **/
const SIGNALING_SERVER = `${location.protocol}//${location.hostname}${location.port ? `:${location.port}` : ''}`;
const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

let signalingSocket = null;
let localMediaStream = null;
let localDisplayMediaStream = null;
let peers = {};
let peerMediaElements = {};
let t = 0;

function init() {
    setupLocalMedia(joinGlobalChat);
    setupSignalingSocket();
}

function setupSignalingSocket() {
    signalingSocket = io(SIGNALING_SERVER);

    signalingSocket.on('connect', () => {
        console.log("Connected to signaling server");
    });

    signalingSocket.on('disconnect', clearPeers);

    signalingSocket.on('addPeer', configurePeerConnection);
    signalingSocket.on('sessionDescription', handleSessionDescription);
    signalingSocket.on('iceCandidate', handleIceCandidate);
    signalingSocket.on('removePeer', removePeer);
}

function joinGlobalChat() {
    joinChatChannel('some-global-channel-name', {});
}

function joinChatChannel(channel, userdata) {
    signalingSocket.emit('join', { channel, userdata });
}

function configurePeerConnection(config) {
    let peer_id = config.peer_id;
    if (peer_id in peers) return;

    let peer_connection = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers[peer_id] = peer_connection;

    peer_connection.onicecandidate = event => {
        console.log("EVENT: Ice candidate");
        if (event.candidate) {
            signalingSocket.emit('relayICECandidate', {
                peer_id,
                ice_candidate: event.candidate
            });
        }
    };

    peer_connection.onicegatheringstatechange = event => {
        let connection = event.target;
        switch (connection.iceGatheringState) {
          case "gathering":
            console.log("EVENT: ICE gathering state changed: gathering");
            break;
          case "complete":
            console.log("EVENT: ICE gathering state changed: complete");
            if(localDisplayMediaStream){
                addStreamToPeers(localDisplayMediaStream);
            }
            break;
        }
      };

    peer_connection.onnegotiationneeded = event => {
        console.log("EVENT: Negotiation needed");
        console.log(event);
        if(t===0){
            t=1;
        }
        else{
            createAndSendOffer(peer_id, peer_connection);
        }
    };
    

    peer_connection.ontrack = event => {
        console.log("EVENT: Ontrack");
        handleTrackEvent(peer_id, event);
    };

    localMediaStream.getTracks().forEach(track => {
        peer_connection.addTrack(track, localMediaStream);
    });

    if (config.should_create_offer) {
        createAndSendOffer(peer_id, peer_connection);
    }
}

function handleTrackEvent(peer_id, event) {
    console.log("[handleTrackEvent] - IN");
    if (event.track.kind !== "video") return;
    console.log("[handleTrackEvent] - Video Track");

    let remote_media = createMediaElement();
    attachMediaStream(remote_media, event.streams[0]);
    peerMediaElements[peer_id] = remote_media;
    console.log("Got Track for " + peer_id);
}

function createAndSendOffer(peer_id, peer_connection) {
    peer_connection.createOffer().then(local_description => {
        peer_connection.setLocalDescription(local_description).then(() => {
            signalingSocket.emit('relaySessionDescription', {
                peer_id,
                session_description: local_description
            });
        });
    });
}

function handleSessionDescription(config) {
    let peer_id = config.peer_id;
    let desc = new RTCSessionDescription(config.session_description);

    peers[peer_id].setRemoteDescription(desc).then(() => {
        if (desc.type == "offer") {
            peers[peer_id].createAnswer().then(local_description => {
                peers[peer_id].setLocalDescription(local_description).then(() => {
                    signalingSocket.emit('relaySessionDescription', {
                        peer_id,
                        session_description: local_description
                    });
                });
            });
        }
    });
}

function handleIceCandidate(config) {
    peers[config.peer_id].addIceCandidate(new RTCIceCandidate(config.ice_candidate));
}

function removePeer(config) {
    let peer_id = config.peer_id;
    if (peerMediaElements[peer_id]) {
        document.body.removeChild(peerMediaElements[peer_id]);
        delete peerMediaElements[peer_id];
    }
    if (peers[peer_id]) {
        peers[peer_id].close();
        delete peers[peer_id];
    }
}

function clearPeers() {
    Object.values(peerMediaElements).forEach(media => document.body.removeChild(media));
    Object.values(peers).forEach(peer => peer.close());
    peers = {};
    peerMediaElements = {};
}

async function setupLocalMedia(callback) {
    if (localMediaStream) return callback();
    await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
        .then(stream => {
            localMediaStream = stream;
            let local_media = createMediaElement();
            attachMediaStream(local_media, stream);
            callback();
        }).catch(err => {
            console.log("Error getting user media");
            console.log(err);
        });        
    await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true })
        .then(stream => {
            localDisplayMediaStream = stream;
        }).catch(err => {
            console.log("Error getting display media");
            console.log(err);
        });
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

// this function is called with a stream and its job is to add it to all the peer connections and renegotiate
function addStreamToPeers(stream) {
    console.log("Adding stream to peers");
    Object.keys(peers).forEach(peer_id => {
        let peer_connection = peers[peer_id];
        stream.getTracks().forEach(track => {
            peer_connection.addTrack(track, stream);
        });
    });
}




init(); // Start the initialization process
