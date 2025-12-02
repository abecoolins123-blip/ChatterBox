# Group Chat App

## Overview

A simple, client-side group chat application built with vanilla HTML, CSS, and JavaScript. This is a basic chat interface that allows users to enter their name and send messages that appear in a shared chat box. Currently operates as a single-user, local-only application without backend persistence or real-time synchronization across multiple clients.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack**: Pure vanilla JavaScript with no frameworks or libraries

**Design Pattern**: Simple DOM manipulation approach
- Direct DOM element selection and manipulation
- Event-driven architecture using native event listeners
- No state management library (messages exist only in the DOM)

**Key Components**:
- Single-page application with all functionality in one HTML file
- Modular JavaScript with separation of concerns (DOM selection, event handling, message rendering)
- CSS-based styling without preprocessors or CSS frameworks

**Security Considerations**:
- HTML escaping implemented via `escapeHTML()` function to prevent XSS attacks
- Input sanitization using `trim()` to remove whitespace
- Validation to ensure both name and message fields are populated

### Data Storage

**Current Implementation**: No data persistence
- Messages exist only in the browser's DOM during the current session
- Page refresh clears all chat history
- No localStorage, sessionStorage, or backend database integration

**Limitation**: This is a local, single-client application. Messages are not shared between users or persisted across sessions.

### User Interface Design

**Layout Approach**: Flexbox-based responsive design
- Centered container layout using flexbox
- Responsive width with `max-width: 90%` for mobile compatibility
- Fixed chat box height (300px) with scrolling overflow

**User Experience Features**:
- Auto-scroll to latest message on send
- Enter key support for sending messages
- Clear visual separation between input area and chat display
- Message input field auto-clears after sending

## External Dependencies

**None** - This application runs entirely in the browser without external dependencies:
- No JavaScript libraries or frameworks (React, Vue, jQuery, etc.)
- No CSS frameworks (Bootstrap, Tailwind, etc.)
- No backend server or API
- No database or cloud storage
- No third-party services or integrations

**Future Integration Opportunities**:
To evolve this into a true multi-user group chat, the following would be needed:
- Backend server (Node.js/Express, Python/Flask, etc.)
- Real-time communication (WebSockets, Socket.io, Server-Sent Events)
- Database for message persistence (PostgreSQL, MongoDB, etc.)
- User authentication system
- Message synchronization across clients