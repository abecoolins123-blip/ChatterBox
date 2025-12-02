# Group Chat App

A real-time group chat application with multiple chat rooms, video/audio calling, and friend system.

## Features

- **Real-time Messaging**: Send and receive messages instantly
- **Multiple Chat Rooms**: Create password-protected chat rooms
- **Video & Audio Calling**: Password-protected video chat (password-protected)
- **Profile Pictures**: Upload and display user profile pictures
- **Online Status**: See who's online in real-time
- **Friend System**: Add and manage friends
- **Dark Theme**: Green/red color scheme
- **Tab-based UI**: Manage multiple chat rooms and video calls in tabs

## Getting Started

### Run Locally
```bash
npm install
npm start
```

The app will run on `http://localhost:5000`

### Share Chat Across Remixes

If you remix this Replit and want all remixes to share the same chat server:

1. Choose one Replit instance to be your shared chat server
2. Get its URL (e.g., `your-repl-name.replit.dev`)
3. In each other remix, set the environment variable:
   - `CHAT_SERVER_URL=your-repl-name.replit.dev`
4. Redeploy each remix

Now all remixes will connect to the shared server and can chat together!


## Technologies

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js, Express, WebSocket
- **Real-time Communication**: WebSocket (ws)
- **Video/Audio**: WebRTC

## Architecture

- `server/index.js` - WebSocket server handling chat, video signaling, and state
- `public/script.js` - Main chat functionality and UI
- `public/video-chat.js` - Video/audio call handling
- `public/style.css` - Styling
