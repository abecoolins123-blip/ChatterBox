# ChatterBox

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


### Share Chat Across Remixes WITHOUT PUBLISHING!!!


1. Remix it here: (https://replit.com/@abecoolins123/ChatterBox?v=1)
2. Get its Dev URL. (e.g., `your-repl-name.replit.dev` or maybe something like that)
3. Share the Dev URL to others you would like to chat with.

Now all remixes will connect to the shared server and can chat together!


## Technologies

- **Frontend**: JavaScript, HTML5, CSS3
- **Backend**: Node.js, Express, WebSocket
- **Real-time Communication**: WebSocket (ws)
- **Video/Audio**: WebRTC

## Architecture

- `server/index.js` - WebSocket server handling chat, video signaling, and state
- `public/script.js` - Main chat functionality and UI
- `public/video-chat.js` - Video/audio call handling
- `public/style.css` - Styling

