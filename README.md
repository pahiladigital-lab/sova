# Sova website

A one-page site for **Sova**, a loofah-infused soap from Kathmandu (Rose ma Dose and la..la..la.. Vanilla).
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
| `assets/product-soap.jpg` | "The bar" card, main photo (tray) | Portrait 4:5, ~880×1100 |
| `assets/product-peek.jpg` | "The bar" card, photo shown on hover / tap (loofah close-up) | Portrait 4:5, ~880×1100 |
| `assets/story.jpg` | "Our story" (founding team) | Portrait 4:5, ~880×1100 |
| `assets/ig-1.jpg` … `assets/ig-6.jpg` | Instagram grid | Square, ~600×600 |
| `assets/og-image.jpg` | Preview when the link is shared (WhatsApp, Facebook…) | 1200×630 |
| `assets/scent-rose.jpg`, `assets/scent-vanilla.jpg` | Small photos on the Rose ma Dose / Vanilla cards | Square, 240×240 |
| `assets/pack.jpg` | Loofah Love Pack photo on the Shop page | 4:3, ~800×600 |
| `assets/logo.png` | Logo in the header and footer | Square PNG with transparent corners, 240×240 |
| `assets/favicon-32.png`, `favicon-64.png`, `apple-touch-icon.png` | Browser tab / phone home screen icon | 32×32, 64×64, 180×180 |

Tips:
- Keep photos as **JPG** and under ~200 KB each (use https://squoosh.app to shrink them).
- If you also change the **alt text** (the description in `alt="…"` in `index.html`), describe what's really in your photo.
- **Logo:** your Sova logo is `assets/logo.png`. Replace that file to update it everywhere.

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

- [ ] Bar weight (not shown yet)
- [ ] Confirm the Vanilla ingredient name (currently "vanilla fragrance", search for CONFIRM in index.html)
- [ ] Payment methods (How to order → step 2, and the FAQ answer "How do payment and delivery work?")
- [ ] Delivery areas, charges and timing (How to order → step 3)
- [ ] Website domain (canonical / og:url / full og:image URL in `<head>`)
- [ ] Phone number (commented out in the footer)

## Shop page (`shop.html`)

The home page links to a separate Shop page (menu "Shop", the yellow "Shop now" band, and buttons).
Customers pick Rose ma Dose / Vanilla, enter name, phone and delivery address, and tap **Place order**.
The order is sent automatically to **sovasoap.np9@gmail.com** through Web3Forms (free plan), and the
customer sees a thank-you screen with an order number (e.g. `SOVA-AWULREG`). No payment is taken on the
site; you contact the customer to confirm payment and delivery.

The **Loofah Love Pack** (5 bars, any Rose/Vanilla mix, `data-price="500"`) and a **gift option**
(tick box + optional note) are on the Shop page; both appear in the order email.

The **Notify me** form on the home page (Coming soon cards) emails launch requests the same way
(`notify.js`), with the same anti-spam checks.

Settings:
- `config.js` → `web3formsKey`: the Web3Forms access key (public by design; manage it at web3forms.com).
  Used by both the Shop page and Notify me.
- `googleForm`: optional second destination (a Google Form → Google Sheet). Empty = off.
- Prices come from `data-price` on each `.sp-product` in `shop.html`.

If no destination is set up, the page tells customers to DM @sova.np9 instead of pretending to send.

## Security

The site is static (no forms, logins, database or third-party scripts), so there is very little to attack.
Built-in protections:
- **Content Security Policy** (`<meta http-equiv="Content-Security-Policy">` in `index.html`): only this site's
  own files and Google Fonts can load, so injected scripts are blocked. If you edit the one-line inline
  `<script>` in `<head>`, its `sha256-…` hash in the policy must be updated too, or it will be blocked.
- External links open with `rel="noopener noreferrer"`.
- Photos have their hidden metadata (including phone GPS location) removed.
- An "official channel" note tells customers that orders only go through @sova.np9 and this website.
- The Shop page may only send data to Web3Forms and Google Forms (`connect-src` in its security policy).
- Anti-spam on the Shop page (limits are at the top of `shop.js`): no sending within 5 seconds of opening
  the page, 2 minutes between orders, max 3 orders per hour per browser, a "same order again?" check,
  rejection of fake phone numbers (e.g. 0000000000), and a hidden spam trap that silently drops bots.
- Both pages refuse to be shown inside another website's frame (they hide and link to the real site).
- Limits live in the visitor's browser, so a determined person can get around them. Always confirm an
  order with the customer before delivering. If spam starts, enable spam protection in the Web3Forms dashboard.

The bigger risks are your **accounts**, not the code:
- Turn on two-factor authentication for the GitHub account and for the @sova.np9 Instagram.
- In the repo, go to **Settings → Pages** and tick **Enforce HTTPS**.
- Only give write access to the repo to people who need it.
