# Trip Booker ✈️

A very easy trip planner that works on phone, iPad and desktop. Type a trip the way you'd say it, or build it one decision at a time — it finds the best dates, flights and places to stay, adds everything up, and lets you save full itineraries.

## The three tabs

### ✨ Quick plan
Type something casual like:

- `ten people albufeira next summer a week ish`
- `8 lads magaluf july villa with private pool £600 each`
- `family of 4 somewhere hot february half term with a pool`
- `couple city break in march 3 nights under £400 each`

It understands group size (incl. kids), destinations (and countries/regions like "Greece" or "the Canaries"), dates ("next summer", "Easter", "half term", "12–19 June"), trip length ("a week ish", "long weekend", "10 days"), budget (per person or total), stay type (villa / apartment / hotel / hostel / all-inclusive), pools, bedrooms, hot tubs, sea views, departure airport ("from Leeds"), direct flights and luggage.

You get, for each destination:
- **Best dates** — the cheapest departure dates in your window.
- **Cheap / Average / Expensive** options (or **in-budget** options if you gave a budget), each with flights out and back, the stay, a full price breakdown, per-person and total.
- **More combinations** — everyone in one villa, split across apartments, hotel rooms, all-inclusive, private pool, closest to the beach, most central, alternative dates, rock-bottom hostel.
- If nothing fits the budget, it says how far over you are and can suggest **cheaper places** with the same vibe.
- If no place is named, it picks matching destinations (e.g. warm enough for that month).
- **Tap any combo to open it.** Each flight links to the real results for that exact day, airports and airline (Google Flights, Skyscanner, the airline), and the stay links to Airbnb / Booking.com / Vrbo searches matching its area, dates, group size, bedrooms, pool and price. When you find the real one, paste its link and price: the totals switch to your real prices and the links are saved with the trip ("Open Airbnb listing 12345").

### 🗓️ Step by step
1. **Where & who** — destination, airport, adults/children, number of nights.
2. **Dates & flights** — a calendar with the return-flight price per person under every date (colour-coded, school holidays marked, cheapest starred). Pick a date, then choose the outbound and return flights. Hold-bag options and "direct only".
3. **Where to stay** — villas, apartments, hotels and hostels in the style of Airbnb, Booking.com and Vrbo. Filter by type, pool / private pool, bedrooms, beds, max price per night, area, must-haves (hot tub, air con, sea view, parking…) and booking site; sort by value, price, rating, beach or centre.
4. **Extras** — taxi transfers or car hire, travel insurance, spending-money estimate.
5. **Summary** — everything added up, per person and total, then save.

### ♡ Saved trips
Full itineraries with flights, stay, your real booking links (tap to open the exact Airbnb / flight page you picked), day-by-day timeline, booking checklist with links (tick things off as you book), notes, costs, **Add to calendar** (.ics), share to the group chat, print/PDF, duplicate, edit, and backup/restore to move trips between devices.

## Phone & iPad
- Mobile-first layout: bottom tab bar on phones, top tabs + sticky running total on iPad/desktop, swipeable cards, 44px+ touch targets, no zoom-on-focus, safe-area aware (notch / home bar), dark mode.
- Installable: open the site in Safari → **Share → Add to Home Screen** and it opens full-screen like an app (also works offline for the app itself).

## About the prices
There's no free public API for Airbnb, and live flight APIs need paid keys and a server, so prices are **smart estimates**: a deterministic model built from typical fares and nightly rates per destination, adjusted for season, day of week, UK school holidays, how far ahead you book, group size and room/unit counts. The same search always gives the same numbers.

Every option links out to the real sites (Skyscanner, Google Flights, Kayak, the airline, Airbnb, Booking.com, Vrbo, Hotels.com) with your dates, group size and filters pre-filled, so you can check live prices and book. The listed stays are illustrative examples of what's typically available there; the links open real matching searches.

To plug in live data later, swap `getFlights` in `src/lib/flights.ts` and `listingsFor`/`quoteStay` in `src/lib/stays.ts` for calls to a flight API (e.g. Duffel, Kiwi Tequila, Skyscanner partner API) and a hotel API (e.g. Booking.com Demand API) via a small backend.

## Running it
```bash
npm install
npm run dev      # http://localhost:5173 (use --host to open it on your phone on the same Wi-Fi)
npm test         # parser + planner tests
npm run build    # static site in dist/
```

## Hosting (GitHub Pages)
`.github/workflows/deploy.yml` tests, builds and deploys to GitHub Pages on every push to `main`. One-off setup: repo **Settings → Pages → Source: GitHub Actions**. The app will then be at `https://<user>.github.io/<repo>/`.

## Code map
- `src/lib/parse.ts` — natural-language trip parser
- `src/lib/planner.ts` — best dates, destination picking and package combinations
- `src/lib/flights.ts`, `src/lib/stays.ts`, `src/lib/costs.ts` — pricing engine
- `src/lib/links.ts` — deep links to booking sites
- `src/data/` — destinations (50+) and UK/IE departure airports
- `src/components/` — Quick plan, Step-by-step planner, price calendar, saved trips
