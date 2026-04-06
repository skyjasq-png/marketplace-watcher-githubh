import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const REQUIRED_ENV = ["FACEBOOK_SEARCH_URL", "NTFY_TOPIC"];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const CONFIG = {
  facebookSearchUrl: process.env.FACEBOOK_SEARCH_URL,
  ntfyTopic: process.env.NTFY_TOPIC,
  ntfyServerUrl: process.env.NTFY_SERVER_URL || "https://ntfy.sh",
  maxPrice: Number(process.env.MAX_PRICE || 100),
  requiredKeywords: (process.env.REQUIRED_KEYWORDS ||
    "lawn mower,mower,push mower,self propelled,riding mower")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean),
  excludedKeywords: (process.env.EXCLUDED_KEYWORDS || "wanted,repair,parts,broken")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean),
};

const stateDir = path.join(process.cwd(), ".state");
const statePath = path.join(stateDir, "seen.json");

function ensureState() {
  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
  if (!fs.existsSync(statePath)) fs.writeFileSync(statePath, JSON.stringify({ seen: {} }, null, 2));
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function saveState(state) {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
}

function extractPrice(text) {
  const match = text.match(/\$([0-9][0-9,]*)/);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function cleanText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function allowedByKeywords(title, location) {
  const haystack = `${title} ${location}`.toLowerCase();
  if (CONFIG.excludedKeywords.some((word) => haystack.includes(word))) return false;
  return CONFIG.requiredKeywords.some((word) => haystack.includes(word));
}

async function parseListings(page) {
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const listings = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href*="/marketplace/item/"]'));
    const seen = new Set();
    const rows = [];

    for (const anchor of anchors) {
      const href = anchor.getAttribute("href") || "";
      const match = href.match(/\/marketplace\/item\/(\d+)/);
      if (!match) continue;
      const id = match[1];
      if (seen.has(id)) continue;
      seen.add(id);

      const textParts = (anchor.innerText || "")
        .split("\n")
        .map((x) => x.trim())
        .filter(Boolean);

      rows.push({
        id,
        href: href.startsWith("http") ? href : `https://www.facebook.com${href}`,
        textParts,
      });
    }

    return rows;
  });

  return listings
    .map((row) => {
      const priceText = row.textParts.find((part) => /^\$[0-9][0-9,]*$/.test(part)) || "";
      const location =
        row.textParts.find((part) => /^[A-Za-z0-9 .'-]+,\s*[A-Z]{2}\b/.test(part)) || "";
      const title =
        row.textParts.find(
          (part) =>
            part !== priceText &&
            part !== location &&
            !part.startsWith("$") &&
            part.length > 2
        ) || "";

      return {
        id: `facebook-${row.id}`,
        source: "facebook",
        title: cleanText(title),
        location: cleanText(location),
        link: row.href.replace(/&amp;/g, "&"),
        price: extractPrice(priceText),
      };
    })
    .filter((listing) => listing.title)
    .filter((listing) => listing.price === null || listing.price <= CONFIG.maxPrice)
    .filter((listing) => allowedByKeywords(listing.title, listing.location));
}

async function sendNtfy(listing) {
  const priceText = listing.price !== null ? `$${listing.price}` : "price not found";
  const locationText = listing.location ? ` | ${listing.location}` : "";
  const message = `Lawn mower match on ${listing.source}: ${listing.title} | ${priceText}${locationText} | ${listing.link}`;

  const response = await fetch(`${CONFIG.ntfyServerUrl.replace(/\/$/, "")}/${CONFIG.ntfyTopic}`, {
    method: "POST",
    headers: {
      Title: "Marketplace mower match",
      Priority: listing.price !== null && listing.price <= 50 ? "high" : "default",
      Tags: "tractor,rotating_light",
      Click: listing.link,
    },
    body: message,
  });

  if (!response.ok) {
    throw new Error(`ntfy send failed with ${response.status}`);
  }
}

async function sendTestNtfy() {
  const response = await fetch(`${CONFIG.ntfyServerUrl.replace(/\/$/, "")}/${CONFIG.ntfyTopic}`, {
    method: "POST",
    headers: {
      Title: "GitHub watcher test",
      Priority: "high",
      Tags: "white_check_mark,bell",
    },
    body: `GitHub Actions watcher test sent at ${new Date().toISOString()}`,
  });

  if (!response.ok) {
    throw new Error(`ntfy test send failed with ${response.status}`);
  }
}

async function main() {
  if (process.argv.includes("--test-notify")) {
    await sendTestNtfy();
    console.log("Sent test notification.");
    return;
  }

  const state = ensureState();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  });

  await page.goto(CONFIG.facebookSearchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  const listings = await parseListings(page);
  await browser.close();

  let sent = 0;
  for (const listing of listings) {
    if (state.seen[listing.id]) continue;
    await sendNtfy(listing);
    state.seen[listing.id] = {
      title: listing.title,
      link: listing.link,
      seenAt: new Date().toISOString(),
    };
    sent += 1;
  }

  saveState(state);
  console.log(JSON.stringify({ ok: true, checked: listings.length, sent }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
