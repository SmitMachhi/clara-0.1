# Fixing smit.lol SSL (PR_END_OF_FILE_ERROR)

**PR_END_OF_FILE_ERROR** means the TLS handshake failed—usually because there’s no valid certificate for the hostname you’re visiting, or the domain isn’t attached to your Fly app.

**“Could not find AppCertificate”** means that hostname hasn’t been added to the app yet (or the cert was never created).

## Quick fix (script)

From the `morning-clarity-journal` directory:

```bash
./scripts/fly-setup-smit-lol.sh
```

Then complete DNS at your registrar (see step 4 below) and run `flyctl certs check smit.lol` / `flyctl certs check www.smit.lol` once propagated.

---

## Manual steps

### 1. Ensure you’re in the app directory and logged in

```bash
cd morning-clarity-journal
flyctl auth whoami   # confirm you’re logged in
```

### 2. Allocate IPv4 and IPv6 (needed for Let’s Encrypt)

```bash
flyctl ips list
```

If you don’t see both a **v4** and **v6** address:

```bash
flyctl ips allocate-v4
flyctl ips allocate-v6
```

### 3. Add custom domains and create certs

Add **both** the apex (`smit.lol`) and `www.smit.lol`:

```bash
flyctl certs add smit.lol
flyctl certs add www.smit.lol
```

Each command will print DNS instructions. **You must complete DNS before certs will issue.**

### 4. Configure DNS

Do this at your domain registrar (where you manage smit.lol).

**Option A – A + AAAA (recommended)**

- **A** `smit.lol` → your app’s **IPv4** (from `flyctl ips list`)
- **AAAA** `smit.lol` → your app’s **IPv6**
- **A** `www.smit.lol` → same IPv4  
- **AAAA** `www.smit.lol` → same IPv6  

**Option B – CNAME for www**

- **A** / **AAAA** for `smit.lol` as above.
- **CNAME** `www.smit.lol` → `clara-0-1.fly.dev`

Use the exact values from `flyctl certs setup smit.lol` and `flyctl certs setup www.smit.lol` if they differ.

### 5. Wait for DNS and cert issuance

Propagation can take a few minutes. Then:

```bash
flyctl certs check smit.lol
flyctl certs check www.smit.lol
```

Both should show the certificate as **issued** (no validation errors). If you see **“Could not find AppCertificate”**, the hostname wasn’t added—run `fly certs add` for that hostname.

### 6. Redirect www ↔ apex (optional)

If you want `https://www.smit.lol` → `https://smit.lol` (or the other way), configure that in your app (e.g. redirects in `hooks.server.ts` or your HTTP layer). Fly does not do this automatically.

---

**Summary:** Add both `smit.lol` and `www.smit.lol` with `fly certs add`, point DNS to your Fly IPs (or CNAME for www), ensure IPv4+IPv6 exist, then verify with `fly certs check`. After certs are issued, **PR_END_OF_FILE_ERROR** should go away.
