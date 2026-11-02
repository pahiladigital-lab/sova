# Sova website

A one-page site for **Sova**, a loofah-infused natural soap from Kathmandu.
It's plain HTML, CSS and JavaScript with no build step and no libraries.

```
index.html   all page content
style.css    design (colours are at the top, in :root)
script.js    animations & interactions
assets/      images, favicon
```

## Preview locally

Open `index.html` in a browser, or run a tiny local server (better, matches hosting):

```bash
cd sova
python3 -m http.server 8000
```

Then visit http://localhost:8000

## Change the photos

The site uses your real photos (cropped, compressed and with phone location data removed).
To swap one, save the new photo with the **exact same file name** in `assets/` and it appears
automatically. No code changes needed.

| File | Where it shows | Best shape / size |
|---|---|---|
| `assets/hero-soap.jpg` | Big image at the top | Square, ~1000×1000 |
| `assets/product-soap.jpg` | "The bar" card (tap to peek) | Portrait 4:5, ~880×1100 |
| `assets/story.jpg` | "Our story" (founding team) | Portrait 4:5, ~880×1100 |
| `assets/ig-1.jpg` … `assets/ig-6.jpg` | Instagram grid | Square, ~600×600 |
| `assets/og-image.jpg` | Preview when the link is shared (WhatsApp, Facebook…) | 1200×630 |
| `assets/favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` | Browser tab / phone home screen icon | Square (32×32 and 180×180 for the PNGs) |

Tips:
- Keep photos as **JPG** and under ~200 KB each (use https://squoosh.app to shrink them).
- If you also change the **alt text** (the description in `alt="…"` in `index.html`), describe what's really in your photo.
- **Logo:** the logo is drawn in code (leaf + "sova"). To use your own logo file, put it in
  `assets/logo.png` and follow the comment next to `class="logo"` in `index.html`.

## Change text

All text is in `index.html`. Search for the words you want to change and edit them.
Spots waiting for your details are marked with `PLACEHOLDER` comments. Search for that word.

Colours: edit the variables at the top of `style.css` (`--leaf-deep`, `--turmeric`, etc.).

## Deploy for free

### GitHub Pages
1. Create a repository on GitHub and upload the contents of this folder (so `index.html` is at the top level).
2. Go to the repo's **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, branch **main**, folder **/ (root)**, then click **Save**.
4. After a minute your site is live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

### Netlify (drag and drop)
1. Go to https://app.netlify.com/drop
2. Drag this whole folder onto the page. You get a live link in seconds.

### Custom domain (later)
Both GitHub Pages and Netlify let you attach your own domain in their settings. Once you have one,
fill in the commented-out `canonical` and `og:url` lines in `<head>` of `index.html` and change
`og:image` to the full address, e.g. `https://yourdomain.com/assets/og-image.jpg`.

## Placeholders still to fill in

- [ ] Your logo file (the site currently uses a simple drawn leaf + "sova" wordmark)
- [ ] Ingredient list and bar weight ("The bar" section currently says "Full ingredient list coming soon")
- [ ] Payment methods (How to order → step 2)
- [ ] Delivery areas, charges and timing (How to order → step 3)
- [ ] Website domain (canonical / og:url / full og:image URL in `<head>`)
- [ ] Email and phone (commented out in the footer)
- [ ] Favicon (browser tab icon) is a simple leaf. Replace it with your logo if you like
