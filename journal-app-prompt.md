# Journal App Development Prompt

Build a secure, personal journaling web application with the following specifications:

## Core Features

### Authentication & Security
- **Password Protection**: Single-user authentication with a password gate
- **Session Management**: Secure session handling with httpOnly cookies (24-hour expiry)
- **Rate Limiting**: Protect authentication endpoints (5 attempts per 15 minutes)
- **Encryption**: All journal entries and sensitive data encrypted at rest using AES-256-GCM
- **Key Derivation**: Use PBKDF2 with 100k iterations for password-based key derivation
- **HTTPS Enforcement**: Redirect HTTP to HTTPS in production

### Journaling Functionality
- **Daily Entries**: One entry per day, date-based organization
- **Customizable Templates**: Support for custom journal templates with:
  - Multiple questions/sections
  - Different field types (text, textarea, etc.)
  - Collapsible/expandable sections
  - Template presets for quick switching
- **Location Tracking**: 
  - Save and select preset locations for entries
  - GPS capture for current location
  - Automatic matching of GPS coordinates to nearby saved locations
- **Time Restrictions** (optional): Journal only available before 2:00 PM local time (configurable)
- **Draft Auto-save**: Automatically save drafts to browser storage with debouncing
- **Entry Viewing**: View past entries by date with a clean, readable interface

### User Interface
- **Modern Design**: Notion-inspired UI with clean, minimal aesthetic
- **Dark/Light Mode**: Theme toggle with system preference detection
- **Responsive Layout**: Works on desktop and mobile devices
- **Progress Tracking**: Visual progress indicator showing completion status
- **Yearly Tracker**: GitHub-style contribution graph showing journaling consistency
- **Sidebar Navigation**: 
  - List of all entries
  - Calendar view with entry dates highlighted
  - Quick navigation to any entry
- **Settings Modal**: 
  - Manage locations (add, edit, delete)
  - Template editor with syntax highlighting
  - Template presets management
  - Database backup/restore functionality

### Data Management
- **Database**: SQLite with better-sqlite3 for local storage
- **Backup System**: Encrypted backup creation and restoration
- **Export**: Ability to export journal entries (JSON/CSV format)
- **Audit Logging**: Track important events for security monitoring

## Technical Requirements

### Tech Stack
- **Framework**: SvelteKit (latest version with Svelte 5)
- **Database**: SQLite with better-sqlite3
- **Encryption**: AES-256-GCM with PBKDF2 key derivation
- **Styling**: Tailwind CSS
- **Type Safety**: Full TypeScript support
- **Deployment**: Node.js adapter for server-side rendering

### Database Schema
- **entries**: Store encrypted journal entries with date, location, and template references
- **templates**: Store encrypted template definitions
- **template_presets**: Store reusable template presets
- **locations**: Store encrypted location data (name, coordinates, address)
- **sessions**: Session management and blacklist
- **auth_rate_limits**: Rate limiting for authentication
- **audit_log**: Security event logging

### Security Considerations
- All sensitive data must be encrypted before storage
- Encryption keys should be derived from user password, not stored
- Session secrets should be environment variables
- Rate limiting on all authentication endpoints
- Input validation and sanitization
- SQL injection prevention (use parameterized queries)
- XSS protection (proper escaping of user content)

### Environment Variables
- `JOURNAL_PASSPHRASE`: Password to unlock the journal
- `JOURNAL_ENCRYPTION_KEY`: AES-256-GCM encryption key (min 32 characters)
- `JOURNAL_SESSION_SECRET`: Secret for signing session cookies (min 32 characters)
- `JOURNAL_ENABLE_TIME_CUTOFF`: Optional flag to enable time restrictions

## User Experience Flow

1. **Login**: User enters password to access journal
2. **Journal Page**: 
   - If entry exists for today → redirect to view entry
   - If past cutoff time → show message
   - Otherwise → show journal form
3. **Form Interaction**:
   - User fills out template questions
   - Can capture GPS location or select from saved locations
   - Progress indicator shows completion status
   - Draft auto-saves as user types
   - Submit button enabled only when all required fields complete
4. **Entry View**: After submission, view the saved entry
5. **Navigation**: Access past entries via sidebar calendar/list view
6. **Settings**: Manage locations, templates, and backups

## Code Quality Standards

- **Modular Architecture**: Separate concerns into logical modules
- **Type Safety**: Full TypeScript coverage with proper types
- **Error Handling**: Graceful error handling with user-friendly messages
- **Code Organization**: 
  - Components in `src/lib/components/`
  - Database logic in `src/lib/db/`
  - Utilities in `src/lib/`
  - Routes in `src/routes/`
- **File Size**: Keep components under 200 lines when possible, split into sub-components
- **Accessibility**: Proper ARIA labels and keyboard navigation
- **Performance**: Optimize for fast load times and smooth interactions

## Deployment

- **Platform**: Fly.io with persistent volume for database
- **Database Storage**: Persistent volume mounted at `/data/`
- **Build Process**: Standard SvelteKit build with Node adapter
- **Environment Setup**: All required environment variables must be configured

## Additional Nice-to-Haves

- Statistics dashboard (entry count, streak tracking, etc.)
- Search functionality for past entries
- Rich text formatting support
- Image attachments
- Export to PDF
- Mobile app version
- Offline support with service workers

---

**Implementation Notes**: 
- Start with core authentication and encryption
- Build database schema and migrations
- Implement basic journal entry creation/viewing
- Add template system
- Enhance with location tracking
- Polish UI/UX
- Add advanced features (backups, export, etc.)
