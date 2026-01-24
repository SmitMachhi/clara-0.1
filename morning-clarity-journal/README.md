# Morning Clarity Journal

A personal journaling web app for daily morning rituals. Built with SvelteKit, SQLite, and AES-256-GCM encryption.

## Features

- **Password Protected**: Single-user authentication with password gate
- **Time Lock**: Journal only available before 2:00 PM local time
- **Encrypted Storage**: All journal entries encrypted at rest using AES-256-GCM
- **Yearly Tracker**: GitHub-style visualization of journaling consistency
- **Dark/Light Mode**: Notion-inspired UI with theme toggle
- **Location Tracking**: Save and select locations for each entry

## Tech Stack

- **Framework**: SvelteKit (Vite-based)
- **Database**: SQLite with better-sqlite3
- **Encryption**: AES-256-GCM with PBKDF2 key derivation
- **Styling**: Tailwind CSS
- **Deployment**: Fly.io with persistent volume

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment to Fly.io

### Prerequisites

1. Install [flyctl](https://fly.io/docs/hands-on/install-flyctl/)
2. Create a Fly.io account and login: `fly auth login`

### HTTPS

- Fly.io provides HTTPS by default for public apps
- The app enforces HTTPS in production using the `x-forwarded-proto` header and redirects HTTP to HTTPS

### Deploy

```bash
# Create the app (first time only)
fly launch --no-deploy

# Create persistent volume for SQLite database
fly volumes create journal_data --size 1 --region sjc

# Deploy
fly deploy
```

### Post-deployment

- Your app will be available at `https://morning-clarity-journal.fly.dev`
- The SQLite database is stored in `/data/journal.db` on the persistent volume
- Logs: `fly logs`
- SSH into container: `fly ssh console`

## Security

- All journal content is encrypted with AES-256-GCM
- Encryption key derived from password using PBKDF2 (100k iterations)
- Session stored in httpOnly cookie (24h expiry)
- Rate limiting on authentication endpoints (5 attempts per 15 minutes)
- Database stored on encrypted volume in production
- Rotate `JOURNAL_SESSION_SECRET` if `cookies.txt` or `data/journal.db*` was ever committed

## Environment Variables

All three environment variables are required in production:

- `JOURNAL_PASSPHRASE` - Password to unlock the journal
- `JOURNAL_ENCRYPTION_KEY` - AES-256-GCM encryption key (min 32 characters)
- `JOURNAL_SESSION_SECRET` - Secret for signing session cookies (min 32 characters)
Optional: set `VITE_ENABLE_TIME_CUTOFF=true` (or `JOURNAL_ENABLE_TIME_CUTOFF=true` on the server) to enforce the 14:00 cutoff.

## License

Private - Personal use only
