# EmberAPI Roblox Portfolio

Static portfolio site for Roblox projects with live CCU and total visits loaded in the browser through RoProxy.

## Files

- `index.html`: page structure
- `styles.css`: visual design and responsive layout
- `script.js`: portfolio rendering and live stats loading
- `data/portfolio.json`: your editable profile and curated game list

## Edit your games

Add more objects to `data/portfolio.json` inside `games`.

Example:

```json
{
  "placeId": 1234567890,
  "featured": false,
  "role": "Lead Scripter",
  "summary": "Built the core progression loop, monetization hooks, and event systems.",
  "status": "Live",
  "year": "2025",
  "accent": "ember",
  "tags": ["Simulator", "Economy", "UI"],
  "externalUrl": "https://www.roblox.com/games/1234567890/Your-Game"
}
```

You can use either:

- `placeId` only: the site will resolve the universe automatically
- `placeId` and `universeId`: fewer API calls and slightly faster loads

## Local preview

Run a simple static server from this folder.

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Deploy to your domain

This site is static, so you do not need a build command.

### Cloudflare Pages

1. Create a new Pages project.
2. Upload this folder or connect it to a Git repo.
3. Set the build command to blank.
4. Set the output directory to `/` or leave it blank if using direct upload.
5. Deploy.
6. In Cloudflare, open the Pages project and add your custom domain.
7. Point your domain DNS to Cloudflare using the records they provide.

### Netlify

1. Create a new site from this folder or from a Git repo.
2. Leave the build command blank.
3. Publish the root folder.
4. Open `Domain management` in Netlify.
5. Add your custom domain.
6. Update your DNS records to the values Netlify gives you.

### Vercel

1. Import the folder as a new project.
2. Framework preset: `Other`.
3. Build command: leave blank.
4. Output directory: `.`
5. Deploy.
6. In project settings, add your custom domain.
7. Update your DNS to the records Vercel shows.

## RoProxy note

The site uses these browser-side endpoints:

- `https://apis.roproxy.com/universes/v1/places/{placeId}/universe`
- `https://games.roproxy.com/v1/games?universeIds=...`
- `https://thumbnails.roproxy.com/v1/games/icons?...`

RoProxy currently exposes browser CORS headers, which is why this static version works without a backend. If you ever want to stop depending on RoProxy, the next step is adding your own small proxy function on the host you choose.
