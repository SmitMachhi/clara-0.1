# clara 0.1

A morning journal that locks at 2 PM. Because if you haven't reflected by then, you're just procrastinating.

## What Is This?

clara is a journaling app with rules. Every morning, it asks you questions like:
- What's making you anxious?
- What are you avoiding?
- What 3 things will you actually do today?

You answer. You submit. The app locks at 2 PM. Done.

Everything you write is encrypted. Not even the server can read your thoughts.

## Why?

Most journals are blank pages that make you feel guilty. clara gives you structure:
- Questions that force you to think (based on Tim Ferriss's "fear-setting")
- A deadline so you don't overthink
- A streak tracker so you can see if you're actually showing up

## How It Works

```
1. Open the app
2. Enter your secret passphrase (like a diary lock, but stronger)
3. Answer the morning questions
4. Hit submit before 2 PM
5. Come back tomorrow
```

That's it. No social features. No sharing. Just you and your thoughts.

## Features

- **Passphrase protection** - No email, no password. Just one phrase only you know.
- **Encrypted everything** - Your entries, locations, quotes - all scrambled before saving.
- **2 PM cutoff** - Journal closes in the afternoon. Morning ritual only.
- **Location tracking** - Optionally tag where you journaled (GPS or preset spots).
- **Daily quotes** - A motivational quote shown with each entry.
- **Year heatmap** - See your journaling streak at a glance (like GitHub's green squares).
- **Dark mode** - Easy on the eyes.
- **Backup & export** - Your data. Take it anywhere.
- **Self-hosted** - Runs on your own server. Nobody else has access.

## Tech Stack

| What | Why |
|------|-----|
| Svelte 5 + SvelteKit | Fast frontend, simple backend, one codebase |
| SQLite | Database lives in one file, no setup needed |
| Tailwind CSS | Styling without the pain |
| Fly.io + Docker | Deploy anywhere with one command |

## Get Started (Development)

```bash
# Clone it
git clone <your-repo>
cd morning-clarity-journal

# Install stuff
npm install

# Set up your secrets (copy and edit)
cp .env.example .env

# Run it
npm run dev
```

Open `http://localhost:5173`. Done.

## Environment Variables

Create a `.env` file with these:

| Variable | What It Does |
|----------|--------------|
| `JOURNAL_PASSPHRASE` | Your secret phrase to unlock the journal (16+ characters) |
| `JOURNAL_ENCRYPTION_KEY` | 32-byte hex key for encrypting data* |
| `JOURNAL_SESSION_SECRET` | Secret for signing sessions (32+ characters) |
| `JOURNAL_BACKUP_TOKEN` | Token for automated backups |
| `VITE_ENABLE_TIME_CUTOFF` | Set `true` to enforce the 2 PM lock |
| `JOURNAL_ENABLE_TIME_CUTOFF` | Set `true` on backend too |

*Generate encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Deploy to Fly.io

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch (first time)
fly launch

# Set your secrets
fly secrets set JOURNAL_PASSPHRASE="your-secret-phrase"
fly secrets set JOURNAL_ENCRYPTION_KEY="your-64-char-hex-key"
fly secrets set JOURNAL_SESSION_SECRET="your-32-char-secret"

# Deploy
fly deploy
```

The app runs on 256MB RAM. Tiny. Cheap. Private.

## Project Structure

```
src/
  routes/           # Pages and API endpoints
    +page.svelte    # Unlock screen
    journal/        # Main journaling page
    entry/[date]/   # View past entries
    api/            # Backend endpoints
  lib/
    db/             # Database stuff (SQLite)
    components/     # UI pieces
    template/       # Journal question templates
```

## Security

- All data encrypted with AES before hitting the database
- Sessions use signed tokens with expiration
- Rate limiting on login (no brute forcing)
- CSRF protection on all forms
- Security headers (CSP, HSTS, etc.)
- Audit logging for sensitive actions

## License

Do whatever you want with it. Just don't blame me if it breaks.

---

*"The chief task in life is simply this: to identify and separate matters so that I can say clearly to myself which are externals not under my control, and which have to do with the choices I actually control."* — Epictetus
