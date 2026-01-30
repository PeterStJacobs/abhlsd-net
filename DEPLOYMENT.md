# ABHLSD.net Deployment

## Architecture
Cloudflare (DNS only) → Netlify (hosting/build) → GitHub repo (source)

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
- Default branch: `main`

## Deploy trigger
Commits to the production branch (typically `main`) trigger Netlify deploys.
