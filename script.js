// Select DOM elements
const chatBox = document.getElementById('chat-box');
const nameInput = document.getElementById('name');
const messageInput = document.getElementById('message');
const sendBtn = document.getElementById('sendBtn');
const clearChatBtn = document.getElementById('clearChatBtn');
const profilePicInput = document.getElementById('profilePic');
const profilePreview = document.getElementById('profilePreview');

let ws;
let currentProfilePic = null;
let onlineCount = 1;
let typingUsers = new Set();
let typingTimeout;
let onlineUsers = new Map(); // userName -> participantId
let currentUserName = null;
let reconnectAttempts = 0;
let reconnectTimeout = null;
const MAX_RECONNECT_DELAY = 30000; // Max 30 seconds

// Initialize WebSocket connection
async function initializeWebSocket() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return; // Already connecting or connected
  }
  
  let chatServerHost = window.location.host;
  
  try {
    const configResponse = await fetch('/api/config');
    if (configResponse.ok) {
      const config = await configResponse.json();
      if (config.chatServerHost) {
        chatServerHost = config.chatServerHost;
      }
    }
  } catch (e) {
    console.log('Using local server');
  }
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${chatServerHost}/ws`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('Connected to chat server');
    reconnectAttempts = 0; // Reset on successful connection
  };
  
  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      
      // Handle chat messages
      if ((message.type === 'chat' || (!message.type && message.name && message.text)) && message.name && message.text) {
        displayMessage(message);
      }
      // Handle online count update
      else if (message.type === 'online-count') {
        onlineCount = message.count;
        document.getElementById('onlineCount').textContent = onlineCount;
      }
      // Handle user joined
      else if (message.type === 'user-joined') {
        onlineUsers.set(message.userName, message.participantId);
        updateUsersList();
      }
      // Handle user left
      else if (message.type === 'user-left') {
        onlineUsers.delete(message.userName);
        updateUsersList();
      }
      // Handle chatbox found
      else if (message.type === 'chatbox-found') {
        const chatboxId = message.chatboxId;
        const roomName = message.roomName;
        currentChatboxId = chatboxId;
        chatboxTitle.textContent = roomName;
        chatBox.innerHTML = '';
        typingUsers.clear();
        updateTypingIndicator();
        findChatModal.classList.remove('active');
        findChatPasswordInput.value = '';
        findChatError.textContent = '';
        // Create tab for found chatbox
        if (chatboxData && typeof createTab === 'function') {
          chatboxData.set(chatboxId, { name: roomName, password: '' });
          createTab(chatboxId, roomName);
          switchTab(chatboxId);
        }
      }
      // Handle chatbox not found
      else if (message.type === 'chatbox-not-found') {
        findChatError.textContent = 'Room not found. Wrong password?';
        findChatPasswordInput.value = '';
      }
      // Handle typing indicator
      else if (message.type === 'user-typing') {
        typingUsers.add(message.userName);
        updateTypingIndicator();
      }
      else if (message.type === 'user-stopped-typing') {
        typingUsers.delete(message.userName);
        updateTypingIndicator();
      }
      // Handle video chat messages - pass to video-chat.js functions
      else if (message.type === 'participant-id') {
        localParticipantId = message.participantId;
        console.log('Your participant ID:', localParticipantId);
      }
      else if (message.type === 'participant-joined') {
        if (typeof onParticipantJoined === 'function') {
          onParticipantJoined(message.participantId);
        }
      }
      else if (message.type === 'participant-left') {
        if (typeof onParticipantLeft === 'function') {
          onParticipantLeft(message.participantId);
        }
      }
      else if (message.type === 'camera-started') {
        if (typeof knownParticipants !== 'undefined' && typeof localStream !== 'undefined') {
          const otherId = message.participantId;
          if (otherId !== localParticipantId && localStream) {
            if (!knownParticipants.has(otherId)) {
              knownParticipants.add(otherId);
              if (typeof onParticipantJoined === 'function') {
                onParticipantJoined(otherId);
              }
            }
          } else if (otherId !== localParticipantId) {
            if (typeof knownParticipants !== 'undefined') {
              knownParticipants.add(otherId);
            }
          }
        }
      }
      else if (message.type === 'offer' && typeof handleOfferForVideo === 'function') {
        handleOfferForVideo(message);
      }
      else if (message.type === 'answer' && typeof handleAnswerForVideo === 'function') {
        handleAnswerForVideo(message);
      }
      else if (message.type === 'ice-candidate' && typeof handleIceCandidateForVideo === 'function') {
        handleIceCandidateForVideo(message);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  };
  
  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
  
  ws.onclose = () => {
    console.log('Disconnected from server');
    reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), MAX_RECONNECT_DELAY);
    console.log(`Reconnect attempt ${reconnectAttempts} in ${delay}ms`);
    
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    reconnectTimeout = setTimeout(initializeWebSocket, delay);
  };
}

// Display message in chat box
function displayMessage(messageObj) {
  // Only display if message has valid name and text
  if (!messageObj || !messageObj.name || !messageObj.text) {
    return;
  }
  
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message');
  
  const profileContainer = document.createElement('div');
  profileContainer.classList.add('message-profile-container');
  
  if (messageObj.profilePic) {
    const profileImg = document.createElement('img');
    profileImg.src = messageObj.profilePic;
    profileImg.classList.add('message-profile-pic');
    profileImg.alt = 'Profile';
    profileContainer.appendChild(profileImg);
  } else {
    const profileIcon = document.createElement('div');
    profileIcon.classList.add('message-profile-icon');
    profileIcon.textContent = '👤';
    profileContainer.appendChild(profileIcon);
  }
  
  const contentDiv = document.createElement('div');
  contentDiv.classList.add('message-content');
  contentDiv.innerHTML = `<strong>${escapeHTML(messageObj.name)}:</strong> ${escapeHTML(messageObj.text)}`;
  
  messageDiv.appendChild(profileContainer);
  messageDiv.appendChild(contentDiv);
  chatBox.appendChild(messageDiv);
  
  // Scroll to latest message
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Send message
function sendMessage() {
  const name = nameInput.value.trim();
  const messageText = messageInput.value.trim();

  if (name === '' || messageText === '') {
    alert('Please enter both your name and message.');
    return;
  }

  const messageObj = {
    name: name,
    text: messageText,
    timestamp: new Date().toISOString()
  };

  if (currentProfilePic) {
    messageObj.profilePic = currentProfilePic;
  }

  // Add chatbox info to message
  messageObj.chatboxId = currentChatboxId;

  // Send to server
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(messageObj));
  } else {
    alert('Not connected to chat server. Please wait...');
  }

  // Clear message input
  messageInput.value = '';
}

// Clear chat - show password modal
function clearChat() {
  const clearChatPasswordModal = document.getElementById('clearChatPasswordModal');
  const clearChatPasswordInput = document.getElementById('clearChatPasswordInput');
  const clearChatPasswordError = document.getElementById('clearChatPasswordError');
  
  clearChatPasswordModal.classList.add('active');
  clearChatPasswordInput.value = '';
  clearChatPasswordError.textContent = '';
  clearChatPasswordInput.focus();
}

// Perform actual clear
function performClearChat() {
  chatBox.innerHTML = '';
}

// Add event listeners
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    sendMessage();
  }
  // Send typing indicator
  sendTypingIndicator();
});

messageInput.addEventListener('blur', () => {
  // Stop typing when input loses focus
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'stopped-typing' }));
  }
});
clearChatBtn.addEventListener('click', clearChat);

// Helper function to escape HTML to prevent injection
function escapeHTML(str) {
  const div = document.createElement('div');
  div.innerText = str;
  return div.innerHTML;
}

// Password protection
const VIDEO_CHAT_PASSWORD = '411952';
const CLEAR_CHAT_PASSWORD = '411952';
const videoBtn = document.getElementById('videoBtn');
const passwordModal = document.getElementById('passwordModal');
const passwordSubmitBtn = document.getElementById('passwordSubmitBtn');
const passwordCancelBtn = document.getElementById('passwordCancelBtn');
const passwordInput = document.getElementById('passwordInput');
const passwordError = document.getElementById('passwordError');

// Clear chat password elements
const clearChatPasswordModal = document.getElementById('clearChatPasswordModal');
const clearChatPasswordInput = document.getElementById('clearChatPasswordInput');
const clearChatPasswordError = document.getElementById('clearChatPasswordError');
const clearChatPasswordSubmitBtn = document.getElementById('clearChatPasswordSubmitBtn');
const clearChatPasswordCancelBtn = document.getElementById('clearChatPasswordCancelBtn');

videoBtn.addEventListener('click', () => {
  passwordModal.classList.add('active');
  passwordInput.value = '';
  passwordError.textContent = '';
  passwordInput.focus();
});

passwordSubmitBtn.addEventListener('click', () => {
  const enteredPassword = passwordInput.value;
  
  if (enteredPassword === VIDEO_CHAT_PASSWORD) {
    passwordModal.classList.remove('active');
    // Create video tab and switch to it
    if (typeof createVideoTab === 'function') {
      createVideoTab();
      setTimeout(() => {
        if (typeof switchToVideoTab === 'function') {
          switchToVideoTab();
        }
      }, 100);
    }
  } else {
    passwordError.textContent = 'Incorrect password. Try again.';
    passwordInput.value = '';
    passwordInput.focus();
  }
});

passwordCancelBtn.addEventListener('click', () => {
  passwordModal.classList.remove('active');
  passwordInput.value = '';
  passwordError.textContent = '';
});

// Allow Enter key to submit password
passwordInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    passwordSubmitBtn.click();
  }
});

// Close password modal when clicking outside
passwordModal.addEventListener('click', (e) => {
  if (e.target === passwordModal) {
    passwordModal.classList.remove('active');
    passwordInput.value = '';
    passwordError.textContent = '';
  }
});

// Clear chat password handlers
clearChatPasswordSubmitBtn.addEventListener('click', () => {
  const enteredPassword = clearChatPasswordInput.value;
  
  if (enteredPassword === CLEAR_CHAT_PASSWORD) {
    clearChatPasswordModal.classList.remove('active');
    performClearChat();
  } else {
    clearChatPasswordError.textContent = 'Incorrect password. Try again.';
    clearChatPasswordInput.value = '';
    clearChatPasswordInput.focus();
  }
});

clearChatPasswordCancelBtn.addEventListener('click', () => {
  clearChatPasswordModal.classList.remove('active');
  clearChatPasswordInput.value = '';
  clearChatPasswordError.textContent = '';
});

// Allow Enter key to submit clear chat password
clearChatPasswordInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    clearChatPasswordSubmitBtn.click();
  }
});

// Close clear chat password modal when clicking outside
clearChatPasswordModal.addEventListener('click', (e) => {
  if (e.target === clearChatPasswordModal) {
    clearChatPasswordModal.classList.remove('active');
    clearChatPasswordInput.value = '';
    clearChatPasswordError.textContent = '';
  }
});

function stopCallFromModal() {
  // Stop video chat if active
  const stopBtn = document.getElementById('stopBtn');
  if (stopBtn && !stopBtn.disabled) {
    stopBtn.click();
  }
}

// Initialize connection when page loads
window.addEventListener('load', initializeWebSocket);
// Handle profile picture selection
profilePicInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      currentProfilePic = event.target.result;
      profilePreview.innerHTML = `<img src="${currentProfilePic}" alt="Profile" />`;
    };
    reader.readAsDataURL(file);
  }
});

// Send typing indicator
function sendTypingIndicator() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    clearTimeout(typingTimeout);
    ws.send(JSON.stringify({ type: 'typing' }));
    typingTimeout = setTimeout(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'stopped-typing' }));
      }
    }, 2000);
  }
}

// Update typing indicator display
function updateTypingIndicator() {
  const indicator = document.getElementById('typingIndicator');
  if (typingUsers.size > 0) {
    const names = Array.from(typingUsers).slice(0, 2).join(', ');
    const more = typingUsers.size > 2 ? ` +${typingUsers.size - 2} more` : '';
    indicator.textContent = `${names}${more} is typing...`;
    indicator.classList.add('active');
  } else {
    indicator.textContent = '';
    indicator.classList.remove('active');
  }
}

// Update users list in sidebar
function updateUsersList() {
  const usersList = document.getElementById('usersList');
  usersList.innerHTML = '';
  
  onlineUsers.forEach((participantId, userName) => {
    const userItem = document.createElement('div');
    userItem.classList.add('user-item');
    const status = document.createElement('div');
    status.classList.add('user-status');
    userItem.appendChild(status);
    const nameSpan = document.createElement('span');
    nameSpan.textContent = userName;
    nameSpan.style.overflow = 'hidden';
    nameSpan.style.textOverflow = 'ellipsis';
    nameSpan.style.whiteSpace = 'nowrap';
    userItem.appendChild(nameSpan);
    usersList.appendChild(userItem);
  });
}

// Override sendMessage to track current user's name
const originalSendMessage = sendMessage;
sendMessage = function() {
  const name = nameInput.value.trim();
  if (name && !currentUserName) {
    currentUserName = name;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'user-first-message', name: name }));
    }
  }
  originalSendMessage.call(this);
};

// New Chatbox functionality
let currentChatboxId = 'default';
let chatboxes = new Map(); // chatboxId -> { name, password }
let chatboxPasswords = new Map(); // chatboxId -> password for verification

const newChatboxBtn = document.getElementById('newChatboxBtn');
const newChatboxModal = document.getElementById('newChatboxModal');
const newChatboxNameInput = document.getElementById('chatboxNameInput');
const newChatboxPasswordInput = document.getElementById('newChatboxPasswordInput');
const newChatboxSubmitBtn = document.getElementById('newChatboxSubmitBtn');
const newChatboxCancelBtn = document.getElementById('newChatboxCancelBtn');
const newChatboxError = document.getElementById('newChatboxError');
const chatboxTitle = document.getElementById('chatboxTitle');

newChatboxBtn.addEventListener('click', () => {
  newChatboxModal.classList.add('active');
  newChatboxNameInput.value = '';
  newChatboxPasswordInput.value = '';
  newChatboxError.textContent = '';
  newChatboxNameInput.focus();
});

newChatboxSubmitBtn.addEventListener('click', () => {
  const roomName = newChatboxNameInput.value.trim() || 'Chat Room ' + (chatboxes.size + 1);
  const password = newChatboxPasswordInput.value;
  
  if (!password) {
    newChatboxError.textContent = 'Please enter a password';
    return;
  }
  
  const chatboxId = 'room-' + Date.now();
  chatboxes.set(chatboxId, { name: roomName, password: password });
  chatboxPasswords.set(chatboxId, password);
  
  currentChatboxId = chatboxId;
  chatboxTitle.textContent = roomName;
  chatBox.innerHTML = '';
  typingUsers.clear();
  updateTypingIndicator();
  
  newChatboxModal.classList.remove('active');
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ 
      type: 'create-chatbox', 
      chatboxId: chatboxId, 
      name: roomName, 
      password: password 
    }));
  }
});

newChatboxCancelBtn.addEventListener('click', () => {
  newChatboxModal.classList.remove('active');
});

newChatboxModal.addEventListener('click', (e) => {
  if (e.target === newChatboxModal) {
    newChatboxModal.classList.remove('active');
  }
});

newChatboxPasswordInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    newChatboxSubmitBtn.click();
  }
});

// Find Chat functionality
const findChatBtn = document.getElementById('findChatBtn');
const findChatModal = document.getElementById('findChatModal');
const findChatNameInput = document.getElementById('findChatNameInput');
const findChatPasswordInput = document.getElementById('findChatPasswordInput');
const findChatSubmitBtn = document.getElementById('findChatSubmitBtn');
const findChatCancelBtn = document.getElementById('findChatCancelBtn');
const findChatError = document.getElementById('findChatError');

findChatBtn.addEventListener('click', () => {
  findChatModal.classList.add('active');
  findChatNameInput.value = '';
  findChatPasswordInput.value = '';
  findChatError.textContent = '';
  findChatNameInput.focus();
});

findChatSubmitBtn.addEventListener('click', () => {
  const password = findChatPasswordInput.value;
  const name = findChatNameInput.value.trim() || null;
  
  if (!password) {
    findChatError.textContent = 'Please enter a password';
    return;
  }
  
  // Send request to server to find chatroom with this password
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'find-chatbox', password: password, searchName: name }));
  }
});

findChatCancelBtn.addEventListener('click', () => {
  findChatModal.classList.remove('active');
});

findChatModal.addEventListener('click', (e) => {
  if (e.target === findChatModal) {
    findChatModal.classList.remove('active');
  }
});

findChatPasswordInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    findChatSubmitBtn.click();
  }
});

// Make profile preview clickable to open file picker
profilePreview.addEventListener('click', () => {
  profilePicInput.click();
});

// User search functionality
const usersSearchInput = document.getElementById('usersSearchInput');
const usersList = document.getElementById('usersList');
let allUsers = new Map();

// Store all users for filtering
const originalUpdateUsersList = updateUsersList;
updateUsersList = function() {
  // Store the current users
  allUsers = new Map(onlineUsers);
  
  // Call the original update
  originalUpdateUsersList.call(this);
  
  // Apply search filter if there's text
  filterUsers();
};

function filterUsers() {
  const searchTerm = usersSearchInput.value.trim().toLowerCase();
  
  if (!searchTerm) {
    // Show all users
    document.querySelectorAll('.user-item').forEach(item => {
      item.style.display = '';
    });
    return;
  }
  
  // Filter users
  document.querySelectorAll('.user-item').forEach(item => {
    const userName = item.textContent.toLowerCase();
    if (userName.includes(searchTerm)) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
}

usersSearchInput.addEventListener('input', filterUsers);

// Tab system for multiple chatrooms
const tabsContainer = document.querySelector('.tabs-container');
let chatboxMessages = new Map(); // chatboxId -> array of messages
let chatboxData = new Map(); // chatboxId -> { name, password }
chatboxData.set('default', { name: 'Group Chat', password: null });

// localStorage helper functions
function saveRoomToLocalStorage(chatboxId, roomName, password) {
  const rooms = JSON.parse(localStorage.getItem('savedChatrooms') || '{}');
  rooms[chatboxId] = { name: roomName, password: password };
  localStorage.setItem('savedChatrooms', JSON.stringify(rooms));
}

function removeRoomFromLocalStorage(chatboxId) {
  const rooms = JSON.parse(localStorage.getItem('savedChatrooms') || '{}');
  delete rooms[chatboxId];
  localStorage.setItem('savedChatrooms', JSON.stringify(rooms));
}

function getSavedRooms() {
  return JSON.parse(localStorage.getItem('savedChatrooms') || '{}');
}

function createTab(chatboxId, roomName) {
  const tab = document.createElement('div');
  tab.className = 'tab';
  if (chatboxId === currentChatboxId) {
    tab.classList.add('active');
  }
  tab.setAttribute('data-chatbox-id', chatboxId);
  tab.innerHTML = `<span class="tab-title">${roomName}</span>`;
  
  if (chatboxId !== 'default') {
    const closeBtn = document.createElement('button');
    closeBtn.className = 'tab-close';
    closeBtn.innerHTML = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(chatboxId);
    });
    tab.appendChild(closeBtn);
  }
  
  tab.addEventListener('click', () => switchTab(chatboxId));
  tabsContainer.appendChild(tab);
}

function switchTab(chatboxId) {
  if (currentChatboxId === chatboxId) return;
  
  // Hide all content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  // Save current messages for chat tabs
  if (chatboxId !== 'video' && currentChatboxId !== 'video') {
    const currentMessages = Array.from(chatBox.querySelectorAll('.message'));
    if (currentMessages.length > 0) {
      chatboxMessages.set(currentChatboxId, currentMessages.map(m => m.outerHTML));
    }
  }
  
  // Update active tab
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelector(`[data-chatbox-id="${chatboxId}"]`).classList.add('active');
  
  if (chatboxId === 'video') {
    // Show video content
    document.getElementById('video-content').classList.add('active');
    document.getElementById('chatboxTitle').textContent = 'Video Chat';
  } else {
    // Show chat content
    document.getElementById('chat-content').classList.add('active');
    
    // Switch chatbox
    currentChatboxId = chatboxId;
    const data = chatboxData.get(chatboxId);
    chatboxTitle.textContent = data.name;
    
    // Load messages for this chatbox
    chatBox.innerHTML = '';
    if (chatboxMessages.has(chatboxId)) {
      chatBox.innerHTML = chatboxMessages.get(chatboxId).join('');
    }
    
    typingUsers.clear();
    updateTypingIndicator();
  }
}

function closeTab(chatboxId) {
  if (chatboxId === 'default') return; // Can't close main tab
  
  // Remove tab
  const tab = document.querySelector(`[data-chatbox-id="${chatboxId}"]`);
  tab.remove();
  
  // Remove data
  chatboxMessages.delete(chatboxId);
  chatboxData.delete(chatboxId);
  chatboxes.delete(chatboxId);
  
  // Remove from localStorage
  removeRoomFromLocalStorage(chatboxId);
  
  // Switch to default if this was active
  if (currentChatboxId === chatboxId) {
    switchTab('default');
  }
}

// Override displayMessage to store in current chatbox
const originalDisplayMessage = displayMessage;
displayMessage = function(msg) {
  originalDisplayMessage.call(this, msg);
  
  // Store message in current chatbox
  if (!chatboxMessages.has(currentChatboxId)) {
    chatboxMessages.set(currentChatboxId, []);
  }
};

// Override newChatboxSubmitBtn to create tab
const originalNewChatboxCreate = () => {
  const roomName = newChatboxNameInput.value.trim() || 'Chat Room ' + (chatboxes.size + 1);
  const password = newChatboxPasswordInput.value;
  
  if (!password) {
    newChatboxError.textContent = 'Please enter a password';
    return;
  }
  
  const chatboxId = 'room-' + Date.now();
  chatboxes.set(chatboxId, { name: roomName, password: password });
  chatboxPasswords.set(chatboxId, password);
  chatboxData.set(chatboxId, { name: roomName, password: password });
  
  // Save to localStorage
  saveRoomToLocalStorage(chatboxId, roomName, password);
  
  createTab(chatboxId, roomName);
  switchTab(chatboxId);
  
  newChatboxModal.classList.remove('active');
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ 
      type: 'create-chatbox', 
      chatboxId: chatboxId, 
      name: roomName, 
      password: password 
    }));
  }
};

newChatboxSubmitBtn.addEventListener('click', originalNewChatboxCreate);

// Load saved rooms on page load
window.addEventListener('load', () => {
  const savedRooms = getSavedRooms();
  Object.entries(savedRooms).forEach(([chatboxId, roomData]) => {
    chatboxes.set(chatboxId, { name: roomData.name, password: roomData.password });
    chatboxPasswords.set(chatboxId, roomData.password);
    chatboxData.set(chatboxId, { name: roomData.name, password: roomData.password });
    createTab(chatboxId, roomData.name);
  });
});



// User profile modal
let userChatrooms = new Map(); // userName -> array of {id, name}
const userProfileModal = document.getElementById('userProfileModal');
const closeProfileBtn = document.getElementById('closeProfileBtn');

// Make user items clickable to show profile
function attachUserClickListeners() {
  document.querySelectorAll('.user-item').forEach(item => {
    item.style.cursor = 'pointer';
    const userName = item.querySelector('span').textContent;
    item.addEventListener('click', () => {
      showUserProfile(userName);
    });
  });
}

function showUserProfile(userName) {
  document.getElementById('userProfileName').textContent = userName;
  document.getElementById('userStatusText').textContent = 'Online';
  
  const chatroomsList = document.getElementById('userChatroomsList');
  chatroomsList.innerHTML = '';
  
  if (userChatrooms.has(userName)) {
    const rooms = userChatrooms.get(userName);
    if (rooms.length === 0) {
      chatroomsList.innerHTML = '<div class="no-chatrooms">No chat rooms created</div>';
    } else {
      rooms.forEach(room => {
        const roomItem = document.createElement('div');
        roomItem.className = 'user-chatroom-item';
        roomItem.innerHTML = `📌 ${room.name}`;
        roomItem.addEventListener('click', () => {
          // Switch to this room using the password
          switchTab(room.id);
          userProfileModal.classList.remove('active');
        });
        chatroomsList.appendChild(roomItem);
      });
    }
  } else {
    chatroomsList.innerHTML = '<div class="no-chatrooms">No chat rooms created</div>';
  }
  
  userProfileModal.classList.add('active');
}

closeProfileBtn.addEventListener('click', () => {
  userProfileModal.classList.remove('active');
});

userProfileModal.addEventListener('click', (e) => {
  if (e.target === userProfileModal) {
    userProfileModal.classList.remove('active');
  }
});

// Override updateUsersList to attach click listeners
const originalUpdateUsersListFunc = updateUsersList;
updateUsersList = function() {
  originalUpdateUsersListFunc.call(this);
  setTimeout(() => attachUserClickListeners(), 0);
};

// Friends system
let myFriends = new Set(); // Set of friend userNames
let currentViewingUser = null;
const addFriendBtn = document.getElementById('addFriendBtn');
const friendStatus = document.getElementById('friendStatus');

addFriendBtn.addEventListener('click', () => {
  if (!currentViewingUser) return;
  
  if (myFriends.has(currentViewingUser)) {
    // Remove friend
    myFriends.delete(currentViewingUser);
    addFriendBtn.classList.remove('added');
    friendStatus.classList.remove('show');
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'remove-friend',
        friendName: currentViewingUser
      }));
    }
  } else {
    // Add friend
    myFriends.add(currentViewingUser);
    addFriendBtn.classList.add('added');
    friendStatus.classList.add('show');
    friendStatus.textContent = '✓ Added as friend';
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'add-friend',
        friendName: currentViewingUser
      }));
    }
  }
});

// Override showUserProfile to handle friend button
const originalShowUserProfile = showUserProfile;
showUserProfile = function(userName) {
  currentViewingUser = userName;
  
  // Update friend button state
  if (myFriends.has(userName)) {
    addFriendBtn.classList.add('added');
    friendStatus.classList.add('show');
    friendStatus.textContent = '✓ Already a friend';
  } else {
    addFriendBtn.classList.remove('added');
    friendStatus.classList.remove('show');
  }
  
  originalShowUserProfile.call(this, userName);
};

// Dark theme - applied by default
document.documentElement.setAttribute('data-theme', 'dark');

// Tab management for video chat
function createVideoTab() {
  const tabsContainer = document.querySelector('.tabs-container');
  const existingVideoTab = tabsContainer.querySelector('[data-chatbox-id="video"]');
  
  if (!existingVideoTab) {
    const videoTab = document.createElement('div');
    videoTab.className = 'tab';
    videoTab.setAttribute('data-chatbox-id', 'video');
    videoTab.innerHTML = '<span class="tab-title">📹 Video Chat</span><button class="tab-close-btn">×</button>';
    
    tabsContainer.appendChild(videoTab);
    
    // Add event listeners
    videoTab.addEventListener('click', () => switchToVideoTab());
    videoTab.querySelector('.tab-close-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      closeVideoTab();
    });
  }
}

function switchToVideoTab() {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  // Remove active from all tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
  });
  
  // Show video content
  document.getElementById('video-content').classList.add('active');
  
  // Mark video tab as active
  document.querySelector('[data-chatbox-id="video"]').classList.add('active');
  
  // Update header
  document.getElementById('chatboxTitle').textContent = 'Video Chat';
}

function closeVideoTab() {
  const videoTab = document.querySelector('[data-chatbox-id="video"]');
  if (videoTab) {
    videoTab.remove();
  }
  
  // Hide video content
  document.getElementById('video-content').classList.remove('active');
  
  // Show chat content and make first tab active
  const defaultTab = document.querySelector('[data-chatbox-id="default"]');
  if (defaultTab) {
    document.getElementById('chat-content').classList.add('active');
    defaultTab.classList.add('active');
    document.getElementById('chatboxTitle').textContent = defaultTab.querySelector('.tab-title').textContent;
  }
  
  // Stop video call
  if (typeof stopCall === 'function') {
    stopCall();
  }
}
