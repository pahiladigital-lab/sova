# Sova website

The website for **Sova**, a loofah-infused soap from Kathmandu (Rose ma Dose and la..la..la.. Vanilla).
Live at https://pahiladigital-lab.github.io/sova/

It is plain HTML, CSS and JavaScript: no build step, no libraries, free hosting on GitHub Pages.

```
index.html        home page
shop.html         shop page (basket + order form)
404.html          "page not found" page
style.css         design (colours are at the top, in :root)
script.js         menu, animations and small interactions (both pages)
shop.js           basket and ordering
notify.js         "Notify me" form for coming-soon bars
config.js         the two addresses orders are sent to
assets/           photos, logo, icons
assets/fonts/     the site's fonts (served from this site, not from Google)
google-sheet/     backup copy of the script that runs inside the "Sova orders" Google Sheet
sitemap.xml       list of pages for search engines
```

## Preview locally

```bash
cd sova
python3 -m http.server 8000
```

Then visit http://localhost:8000

## Change the photos

To swap a photo, save the new one with the **exact same file name** in `assets/`. No code changes needed.

| File | Where it shows | Best shape / size |
|---|---|---|
| `assets/hero-soap.jpg` | Big image at the top of the home page | Square, ~900×900 |
| `assets/product-soap.jpg` | "The soaps" card, main photo (tray) | Portrait 4:5, ~800×1000 |
| `assets/product-peek.jpg` | "The soaps" card, photo shown on hover / tap (loofah close-up) | Portrait 4:5, ~800×1000 |
| `assets/story.jpg` | "Our story" (founding team) | Portrait 4:5, ~880×1100 |
| `assets/ig-1.jpg` … `assets/ig-6.jpg` | Instagram grid | Square, ~600×600 |
| `assets/og-image.jpg` | Preview when the link is shared (WhatsApp, Facebook…) | 1200×630 |
| `assets/scent-rose.jpg`, `assets/scent-vanilla.jpg` | Rose ma Dose / Vanilla cards (home and shop) | 4:3, ~640×480 |
| `assets/pack.jpg` | Loofah Love Pack photo on the Shop page | 4:3, ~800×600 |
| `assets/logo.png` | Logo in the header and footer | Square PNG with transparent corners, 240×240 |
| `assets/favicon-32.png`, `favicon-64.png`, `apple-touch-icon.png` | Browser tab / phone home screen icon | 32×32, 64×64, 180×180 |

Tips:
- Keep photos as **JPG**, ideally under ~150 KB each (https://squoosh.app shrinks them). Big photos make the site slow on phones.
- Phone photos carry hidden data such as GPS location. Squoosh removes it; do not upload photos straight from the camera roll.
- If you change a photo, also change its description (`alt="…"` in the HTML) to say what is really in it.

## Change text

Home page text is in `index.html`, shop text in `shop.html`. Search for the words you want and edit them.
Spots waiting for your details are marked with `PLACEHOLDER` comments.

Colours: edit the variables at the top of `style.css` (`--leaf-deep`, `--turmeric`, etc.).

### If you edit `style.css` or any `.js` file yourself
Each page loads these files with a version label, for example `style.css?v=df88bf04`. Phones keep old copies
for a while, so after you change one of these files, change the label next to it in `index.html`, `shop.html`
and `404.html` to anything new (for example `?v=2`). Otherwise some visitors keep seeing the old version.

## Prices

A price lives in **two places**, and both must match:
1. `shop.html`: the visible text ("NPR 150") and the `data-price="150"` on that product.
2. `google-sheet/Code.gs` → `PRICES` (inside the Google Sheet's script). The Sheet works out every
   order's total from this list and never trusts the number the browser sends.

If they differ, the order is still saved with the Sheet's total and its **Note** starts with
`CHECK TOTAL: website showed NPR …`. You will also see that note if someone tampers with the page.
After editing the script: **Deploy → Manage deployments → Edit → Version: New version → Deploy**.

## Shop page (`shop.html`)

Customers pick Rose ma Dose, Vanilla or the **Loofah Love Pack** (5 bars, any mix), enter name, phone and
delivery address (email optional), can tick **This is a gift**, and tap **Place order**. Then:

- the order is emailed to **sovasoap.np9@gmail.com** through Web3Forms (free plan), and
- it is saved as a row in the **Orders** tab of the private "Sova orders" Google Sheet.

The customer sees a thank-you screen with an order number such as `SOVA-GQYHP9` only when at least one of
those two confirmed it received the order. No payment is taken on the site; you contact the customer to
confirm payment and delivery.

The **Notify me** form on the home page (Coming soon cards) works the same way and fills the **Notify me** tab.

Settings (`config.js`):
- `web3formsKey`: the Web3Forms access key (public by design; manage it at web3forms.com).
- `sheetUrl`: the Google Apps Script web-app address.

Keep the Sheet private: it holds customers' phone numbers and addresses.

### Automatic customer emails (Google Sheet)
In the **Orders** tab, changing **Status** to Confirmed, Out for delivery, Delivered or Cancelled emails the
customer automatically from sovasoap.np9@gmail.com (as "Sova"), if they gave an email. The **Updates sent**
column records each email, so nothing is sent twice. Email wording is at the top of `google-sheet/Code.gs`
(`EMAILS`), and `WHATSAPP` adds your number to the "Confirmed" email.

After pasting a new version of the script into Apps Script: run `setupEmailUpdates` once, then
**Deploy → Manage deployments → Edit → Version: New version → Deploy** (this keeps the same address).

## If the site moves to its own domain

Change the address `https://pahiladigital-lab.github.io/sova/` to the new one in:
`index.html` and `shop.html` (`canonical`, `og:url`, `og:image`), `sitemap.xml`, and in `404.html` change
`<base href="/sova/">` to `<base href="/">`. Also update the Website URL in the Web3Forms dashboard, and
re-create any printed QR codes if the old address stops redirecting.

## Still to fill in

- [ ] Payment methods and delivery areas, charges and timing (How to order steps 2–3 and the FAQ answer)
- [ ] Bar weight
- [ ] Confirm the Vanilla ingredient name (currently "vanilla fragrance"; search for CONFIRM in `index.html`)
- [ ] Phone / WhatsApp number (footer, and `WHATSAPP` in the Sheet script)

## Security

What protects the site:
- **Strict security policy** on every page (`Content-Security-Policy` in each `<head>`): only this site's own
  files can load, pages can only send data to Web3Forms and the Sheet script, and text can never be turned
  into HTML or script. If you edit the one-line inline `<script>` in `<head>`, its `sha256-…` value in the
  policy must be updated too.
- **No third parties in the page**: fonts are served from `assets/fonts/`, so visitors' browsers contact
  nobody else just to view the site.
- **The Sheet does not trust the browser**: it re-checks every field, builds the item list and total from its
  own prices, ignores repeats and junk, and blocks spreadsheet formulas. Customer emails only ever contain
  text the Sheet built itself.
- **Anti-spam** on the forms: a short wait before sending, limits per browser and per phone number, fake
  phone numbers rejected, and a hidden trap for bots.
- Both pages refuse to be shown inside another website's frame.
- External links open safely in a new tab, and photos carry no hidden location data.

What code cannot do for you:
- **Always confirm an order with the customer before delivering**, and never click links inside an order
  email; anyone can send a fake one.
- Turn on **two-factor authentication** for Gmail (sovasoap.np9), Instagram (@sova.np9) and GitHub.
- In the repo, **Settings → Pages → Enforce HTTPS** must be ticked.
- Only give write access to the repo and the Sheet to people who need it.
- If spam starts, enable spam protection in the Web3Forms dashboard.

## Deploying

The site is published by GitHub Pages from the `main` branch (Settings → Pages → Deploy from a branch →
`main` / root). Every push to `main` goes live in about a minute.
