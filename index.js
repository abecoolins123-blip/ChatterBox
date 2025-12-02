import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Config endpoint - returns the chat server host (for shared chat across remixes)
app.get('/api/config', (req, res) => {
  const chatServerHost = process.env.CHAT_SERVER_URL || null;
  res.json({
    chatServerHost: chatServerHost,
    version: '1.0.0'
  });
});

// Store active connections and messages
const clients = new Set();
const participantMap = new Map(); // participantId -> ws
const messages = [];
let participantId = 0;
const nameCounter = new Map(); // name -> count of users with that name
const userNames = new Map(); // participantId -> assigned name with number suffix
const participantNames = new Map(); // assigned name -> participantId
const typingUsers = new Set(); // Set of user names currently typing
const chatboxMessages = new Map(); // chatboxId -> array of messages
const chatboxData = new Map(); // chatboxId -> { name, password, createdBy }
const userChatrooms = new Map(); // userName -> array of chatboxIds they created

// Handle WebSocket connections
wss.on('connection', (ws) => {
  const currentParticipantId = participantId++;
  ws.participantId = currentParticipantId;
  clients.add(ws);
  participantMap.set(currentParticipantId, ws);
  console.log(`Client connected. Total clients: ${clients.size}. Participant ID: ${currentParticipantId}`);
  
  // Notify new client of their ID
  ws.send(JSON.stringify({
    type: 'participant-id',
    participantId: currentParticipantId
  }));
  
  // Notify all other clients that a new participant joined
  clients.forEach(client => {
    if (client !== ws && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'participant-joined',
        participantId: currentParticipantId
      }));
    }
  });

  // Broadcast updated online count
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        type: 'online-count',
        count: clients.size
      }));
    }
  });

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      // Handle first message to assign name
      if (message.type === 'user-first-message') {
        const baseName = message.name;
        const count = (nameCounter.get(baseName) || 0) + 1;
        nameCounter.set(baseName, count);
        const assignedName = count === 1 ? baseName : `${baseName} ${count}`;
        userNames.set(currentParticipantId, assignedName);
        
        // Track participant name mapping
        participantNames.set(assignedName, currentParticipantId);
        
        // Notify all clients about new user
        clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'user-joined',
              userName: assignedName,
              participantId: currentParticipantId,
              chatrooms: userChatrooms.get(assignedName) || []
            }));
          }
        });
      }
      // Handle create chatbox
      else if (message.type === 'create-chatbox') {
        const chatboxId = message.chatboxId;
        const name = message.name;
        const password = message.password;
        const createdBy = userNames.get(currentParticipantId);
        chatboxData.set(chatboxId, { name: name, password: password, createdBy: createdBy });
        
        // Track which rooms this user created
        if (!userChatrooms.has(createdBy)) {
          userChatrooms.set(createdBy, []);
        }
        userChatrooms.get(createdBy).push(chatboxId);
        
        // Broadcast user's chatrooms update to all clients
        clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'user-chatrooms-update',
              userName: createdBy,
              chatrooms: userChatrooms.get(createdBy).map(id => ({
                id: id,
                name: chatboxData.get(id).name
              }))
            }));
          }
        });
      }
      // Handle find chatbox by password
      else if (message.type === 'find-chatbox') {
        const password = message.password;
        let found = false;
        
        chatboxData.forEach((data, chatboxId) => {
          if (data.password === password && !found) {
            found = true;
            ws.send(JSON.stringify({
              type: 'chatbox-found',
              chatboxId: chatboxId,
              roomName: data.name
            }));
          }
        });
        
        if (!found) {
          ws.send(JSON.stringify({
            type: 'chatbox-not-found'
          }));
        }
      }
      // Handle switch chatbox
      else if (message.type === 'switch-chatbox') {
        // Just acknowledge - client already knows
      }
      // Handle chat messages - broadcast to all
      else if (message.type === 'chat' || (!message.type && message.name)) {
        // Check if this is a new name or reassign existing name
        let assignedName = userNames.get(currentParticipantId);
        if (!assignedName) {
          // First message from this user - assign name with number if needed
          const baseName = message.name;
          const count = (nameCounter.get(baseName) || 0) + 1;
          nameCounter.set(baseName, count);
          assignedName = count === 1 ? baseName : `${baseName} ${count}`;
          userNames.set(currentParticipantId, assignedName);
          
          // Track participant name mapping
          participantNames.set(assignedName, currentParticipantId);
          
          // Notify all clients about new user
          clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'user-joined',
                userName: assignedName,
                participantId: currentParticipantId,
                chatrooms: userChatrooms.get(assignedName) || []
              }));
            }
          });
        }
        
        // Replace the name in the message with the assigned name
        message.name = assignedName;
        const chatboxId = message.chatboxId || 'default';
        
        // Store chatbox data if not already stored
        if (!chatboxData.has(chatboxId) && chatboxId !== 'default') {
          // This shouldn't happen normally but just in case
        }
        
        // Store message for this chatbox
        if (!chatboxMessages.has(chatboxId)) {
          chatboxMessages.set(chatboxId, []);
        }
        chatboxMessages.get(chatboxId).push(message);
        messages.push(message);
        
        // Broadcast to all clients
        clients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        });
      }
      // Handle typing indicator
      else if (message.type === 'typing') {
        const userName = userNames.get(currentParticipantId);
        if (userName && !typingUsers.has(userName)) {
          typingUsers.add(userName);
          clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'user-typing',
                userName: userName
              }));
            }
          });
        }
      }
      // Handle stopped typing
      else if (message.type === 'stopped-typing') {
        const userName = userNames.get(currentParticipantId);
        if (userName && typingUsers.has(userName)) {
          typingUsers.delete(userName);
          clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'user-stopped-typing',
                userName: userName
              }));
            }
          });
        }
      }
      // Handle camera started - broadcast to all other participants
      else if (message.type === 'camera-started') {
        message.participantId = currentParticipantId;
        clients.forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        });
      }
      // Handle WebRTC signaling - route to specific recipient
      else if (message.type === 'offer' || message.type === 'answer' || message.type === 'ice-candidate') {
        message.from = currentParticipantId;
        
        // Send to specific recipient if 'to' field exists
        if (message.to !== undefined) {
          const recipientWs = participantMap.get(message.to);
          if (recipientWs && recipientWs.readyState === WebSocket.OPEN) {
            recipientWs.send(JSON.stringify(message));
          } else {
            console.log(`Recipient ${message.to} not found or not connected`);
          }
        }
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  // Handle disconnections
  ws.on('close', () => {
    clients.delete(ws);
    participantMap.delete(currentParticipantId);
    
    // Clean up name tracking
    const userName = userNames.get(currentParticipantId);
    if (userName) {
      userNames.delete(currentParticipantId);
      typingUsers.delete(userName);
      // Optionally reset name counter when all users with that name disconnect
      const baseName = userName.split(' ').slice(0, -1).join(' ') || userName;
      const cleanName = baseName.replace(/ \d+$/, '');
      // Reset counter if no users with this base name exist
      let hasBaseNameUser = false;
      for (let name of userNames.values()) {
        if (name.startsWith(cleanName + ' ') || name === cleanName) {
          hasBaseNameUser = true;
          break;
        }
      }
      if (!hasBaseNameUser) {
        nameCounter.delete(cleanName);
      }
    }
    
    console.log(`Client disconnected. Total clients: ${clients.size}`);
    
    // Notify all clients that participant left and send updated online count
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        if (userName) {
          client.send(JSON.stringify({
            type: 'user-left',
            userName: userName
          }));
        }
        client.send(JSON.stringify({
          type: 'participant-left',
          participantId: currentParticipantId
        }));
        client.send(JSON.stringify({
          type: 'online-count',
          count: clients.size
        }));
      }
    });
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
});
