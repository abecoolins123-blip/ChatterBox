const videoContainer = document.getElementById('videoContainer');
const videoStatus = document.getElementById('videoStatus');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const cameraBtn = document.getElementById('cameraBtn');
const micBtn = document.getElementById('micBtn');

let localStream;
let peerConnections = {}; // Map of participantId -> RTCPeerConnection
let remoteStreams = {}; // Map of participantId -> MediaStream
let localParticipantId;
let isCameraOn = false;
let isMicOn = false;

const peerConfig = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
  ]
};

// Create video element for participant
function createVideoElement(participantId, isLocal = false) {
  const wrapper = document.createElement('div');
  wrapper.classList.add('video-wrapper');
  wrapper.id = `video-${participantId}`;
  
  const video = document.createElement('video');
  video.autoplay = true;
  if (isLocal) video.muted = true;
  video.playsinline = true;
  
  const label = document.createElement('div');
  label.classList.add('video-label');
  label.textContent = isLocal ? 'You' : `User ${participantId}`;
  
  wrapper.appendChild(video);
  wrapper.appendChild(label);
  videoContainer.appendChild(wrapper);
  
  return video;
}

// Update grid layout based on participant count
function updateGridLayout() {
  const count = Object.keys(remoteStreams).length + 1; // +1 for local
  videoContainer.className = 'video-container participants-' + count;
}

// Store other participants we know about
let knownParticipants = new Set();

// Start local camera and microphone
async function startLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true
    });

    // Create local video element
    const localVideo = createVideoElement(localParticipantId, true);
    localVideo.srcObject = localStream;
    
    isCameraOn = true;
    isMicOn = true;

    cameraBtn.textContent = 'Camera On';
    cameraBtn.classList.remove('off');
    micBtn.textContent = 'Mic On';
    micBtn.classList.remove('off');

    startBtn.disabled = true;
    cameraBtn.disabled = false;
    micBtn.disabled = false;
    stopBtn.disabled = false;

    updateGridLayout();
    updateVideoStatus('Ready - Waiting for peers', true);
    
    // Create video tab
    if (typeof createVideoTab === 'function') {
      createVideoTab();
      setTimeout(() => {
        if (typeof switchToVideoTab === 'function') {
          switchToVideoTab();
        }
      }, 100);
    }
    
    // Send notification to server that we're in video chat with camera on
    sendSignalingMessage({
      type: 'camera-started',
      participantId: localParticipantId
    });
  } catch (error) {
    console.error('Error accessing media devices:', error);
    updateVideoStatus('Camera/Mic Error: ' + error.message, false);
    alert('Unable to access camera or microphone. Please check permissions.');
  }
}

// Create peer connection for a specific participant
function createPeerConnection(participantId) {
  if (peerConnections[participantId]) {
    peerConnections[participantId].close();
  }

  const peerConnection = new RTCPeerConnection(peerConfig);
  peerConnections[participantId] = peerConnection;

  // Add local tracks to peer connection
  if (localStream) {
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
  }

  // Handle remote stream
  peerConnection.ontrack = (event) => {
    console.log('Received track from participant', participantId);
    if (!remoteStreams[participantId]) {
      remoteStreams[participantId] = new MediaStream();
      
      // Create video element for this participant
      const video = createVideoElement(participantId, false);
      video.srcObject = remoteStreams[participantId];
      
      updateGridLayout();
      updateVideoStatus('Connected with ' + (Object.keys(remoteStreams).length + 1) + ' participants', true);
    }
    remoteStreams[participantId].addTrack(event.track);
  };

  // Handle ICE candidates
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      sendSignalingMessage({
        type: 'ice-candidate',
        candidate: event.candidate,
        to: participantId
      });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    console.log(`Connection state with ${participantId}:`, peerConnection.connectionState);
    if (peerConnection.connectionState === 'failed' || 
        peerConnection.connectionState === 'disconnected') {
      console.log(`Removing peer ${participantId}`);
    }
  };

  return peerConnection;
}

// Handle new participant joined
async function onParticipantJoined(participantId) {
  console.log('Participant joined:', participantId);
  
  if (!localStream) return; // Wait until local stream is ready

  const peerConnection = createPeerConnection(participantId);
  
  // Create and send offer
  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    
    sendSignalingMessage({
      type: 'offer',
      offer: offer,
      to: participantId
    });
  } catch (error) {
    console.error('Error creating offer:', error);
  }
}

// Handle incoming offer
async function handleOfferForVideo(message) {
  const { offer, from } = message;
  
  try {
    if (!peerConnections[from]) {
      createPeerConnection(from);
    }

    const peerConnection = peerConnections[from];
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    sendSignalingMessage({
      type: 'answer',
      answer: answer,
      to: from
    });
  } catch (error) {
    console.error('Error handling offer:', error);
  }
}

// Handle incoming answer
async function handleAnswerForVideo(message) {
  const { answer, from } = message;
  
  try {
    const peerConnection = peerConnections[from];
    if (peerConnection) {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    }
  } catch (error) {
    console.error('Error handling answer:', error);
  }
}

// Handle incoming ICE candidate
async function handleIceCandidateForVideo(message) {
  const { candidate, from } = message;
  
  try {
    const peerConnection = peerConnections[from];
    if (peerConnection && candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (error) {
    console.error('Error adding ICE candidate:', error);
  }
}

// Handle participant left
function onParticipantLeft(participantId) {
  console.log('Participant left:', participantId);
  
  if (peerConnections[participantId]) {
    peerConnections[participantId].close();
    delete peerConnections[participantId];
  }

  if (remoteStreams[participantId]) {
    remoteStreams[participantId].getTracks().forEach(track => track.stop());
    delete remoteStreams[participantId];
  }

  const videoElement = document.getElementById(`video-${participantId}`);
  if (videoElement) {
    videoElement.remove();
  }

  updateGridLayout();
}

// Send signaling message via WebSocket
function sendSignalingMessage(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Toggle camera
function toggleCamera() {
  if (!localStream) return;

  const videoTrack = localStream.getVideoTracks()[0];
  if (videoTrack) {
    videoTrack.enabled = !videoTrack.enabled;
    isCameraOn = videoTrack.enabled;
    cameraBtn.textContent = isCameraOn ? 'Camera On' : 'Camera Off';
    cameraBtn.classList.toggle('off', !isCameraOn);
  }
}

// Toggle microphone
function toggleMic() {
  if (!localStream) return;

  const audioTrack = localStream.getAudioTracks()[0];
  if (audioTrack) {
    audioTrack.enabled = !audioTrack.enabled;
    isMicOn = audioTrack.enabled;
    micBtn.textContent = isMicOn ? 'Mic On' : 'Mic Off';
    micBtn.classList.toggle('off', !isMicOn);
  }
}

// Stop call
function stopCall() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  // Close all peer connections
  Object.values(peerConnections).forEach(pc => pc.close());
  peerConnections = {};

  // Stop all remote streams
  Object.values(remoteStreams).forEach(stream => {
    stream.getTracks().forEach(track => track.stop());
  });
  remoteStreams = {};

  // Clear video container
  videoContainer.innerHTML = '';

  startBtn.disabled = false;
  cameraBtn.disabled = true;
  micBtn.disabled = true;
  stopBtn.disabled = true;

  updateVideoStatus('Disconnected', false);
}

// Update status display
function updateVideoStatus(message, isConnected) {
  if (videoStatus) {
    videoStatus.textContent = message;
    videoStatus.style.color = isConnected ? '#4CAF50' : '#f44336';
  }
}

// Event listeners
startBtn.addEventListener('click', startLocalStream);
stopBtn.addEventListener('click', stopCall);
cameraBtn.addEventListener('click', toggleCamera);
micBtn.addEventListener('click', toggleMic);
