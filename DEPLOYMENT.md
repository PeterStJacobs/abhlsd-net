# ABHLSD Sites Deployment

## Architecture (both sites)
Cloudflare (DNS only) → Netlify (hosting/build) → GitHub repo (source)

---

# ABHLSD.net

## Domains / DNS (Cloudflare)
- A (apex): `abhlsd.net` → `75.2.60.5` (DNS only, TTL Auto)
- CNAME: `www` → `abhlsd-net.netlify.app` (DNS only, TTL Auto)

## Netlify
- Site / project name: `abhlsd-net`
- Owner: Louise's Team
- Site ID: `512fe027-f15b-4848-882a-b6048916939a`
- Repo: `github.com/PeterStJacobs/abhlsd-net`
- Build settings:
  - Base directory: `/`
  - Build command: Not set
  - Publish directory: Not set
  - Functions directory: `netlify/functions`
- Deploys: Active (logs public)

## GitHub
- Repo: `abhlsd-net`
- Default branch: `main`

## Deploy trigger
Commits to the production branch (typically `main`) trigger Netlify deploys.

---

# ABHLSD.com

## Domains / DNS (Cloudflare)
- A (apex): `abhlsd.com` → `75.2.60.5` (DNS only, TTL Auto)
- CNAME: `www` → `abhlsd-com.netlify.app` (DNS only, TTL Auto)

## GitHub
- Repo: `abhlsd-com`
- Default branch: `main`

## Netlify
- Site / project name: `abhlsd-com` (confirm in Netlify UI)
- Repo: `github.com/PeterStJacobs/abhlsd-com` (confirm if same owner/org)
- Build settings: (confirm in Netlify UI)
  - Base directory
  - Build command
  - Publish directory
  - Functions directory (if any)

## Deploy trigger
Commits to the production branch (typically `main`) trigger Netlify deploys.
