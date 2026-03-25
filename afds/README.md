# AFdS V2 Prototype (Static)

Drop this folder into your `abhlsd-net` repo and deploy via Netlify (no build step needed).

## Install
1. Copy `calendar-of-this/` into the repo root.
2. Commit + push to `main`.
3. Visit `https://abhlsd.net/calendar-of-this/`

## What this prototype includes
- 3-column desktop layout (Day Inspector | Calendar | Clocks)
- Mobile bottom sheet with tabs (Inspector / Clocks)
- Month / Week / List views
- "+ more" popover for crowded days (mobile uses the bottom sheet)
- Jump control (Seoian default, Gregorian toggle) with auto-slashes
- Filters dropdown with toggles (SuperMonths)
- SuperDay clock based on selected Tamara/Martin IANA timezones (shows *now*)

## Notes
- SuperMonth ranges are loaded from `data/supermonths_ranges_fallback.json` generated from your fallback spreadsheet.
- Astronomy Engine integration is not wired yet in this prototype; this is a working UI + baseline calendar data.