// index.js
import express from "express";
import fetch from "node-fetch";
import sharp from "sharp";

const app = express();

// Shopify CDN mag einen Browser-User-Agent
const SHOPIFY_FETCH_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/png,image/*,*/*",
};

// Mockup-URLs
const TOTE_MOCKUP_URL =
  "https://cdn.shopify.com/s/files/1/0958/7346/6743/files/IMG_1902.jpg?v=1765218360";

const MUG_MOCKUP_URL =
  "https://cdn.shopify.com/s/files/1/0958/7346/6743/files/IMG_1901.jpg?v=1765218358";

// NEU: T-Shirt Mockups
const TEE_WHITE_MOCKUP_URL =
  "https://cdn.shopify.com/s/files/1/0958/7346/6743/files/IMG_1926.jpg?v=1765367168";

const TEE_BLACK_MOCKUP_URL =
  "https://cdn.shopify.com/s/files/1/0958/7346/6743/files/IMG_1924.jpg?v=1765367167";

// NEU: Overlays für T-Shirts (PNG oben drauf)
const TEE_WHITE_OVERLAY_URL =
  "https://cdn.shopify.com/s/files/1/0958/7346/6743/files/ber_wei_e_Shirt.png?v=1765367191";

const TEE_BLACK_OVERLAY_URL =
  "https://cdn.shopify.com/s/files/1/0958/7346/6743/files/ber_schwarze_Shirt.png?v=1765367224";

// In-Memory Cache: key -> PNG Buffer
const previewCache = new Map();

// Healthcheck
app.get("/", (req, res) => {
  res.send("teeinblue-artwork-resizer (NO BG Removal, Tasche + Tasse) läuft.");
});

// --------------------------------------------------
// Bild von URL laden (Shopify-kompatibel)
// --------------------------------------------------
async function loadImage(url) {
  const resp = await fetch(url, { headers: SHOPIFY_FETCH_HEADERS });
  if (!resp.ok) {
    throw new Error(`Bild konnte nicht geladen werden: ${url} (HTTP ${resp.status})`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

// --------------------------------------------------
// Artwork auf Mockup legen (ohne Hintergrundentfernung)
// Optional: overlayUrl -> PNG wird ÜBER alles gelegt
// --------------------------------------------------
async function placeArtworkOnMockup({ artworkUrl, mockupUrl, scale, offsetX, offsetY, overlayUrl }) {
  // Artwork laden
  const artBuf = await loadImage(artworkUrl);

  // in PNG mit Alpha konvertieren + **um –90° drehen**
  const artPng = await sharp(artBuf)
    .ensureAlpha()
    .jpeg({ quality: 90 })
    .toBuffer();

  // Mockup laden
  const mockBuf = await loadImage(mockupUrl);
  const mockSharp = sharp(mockBuf);
  const meta = await mockSharp.metadata();

  if (!meta.width || !meta.height) {
    throw new Error("Konnte Mockup-Abmessungen nicht lesen.");
  }

  // Artwork skalieren: Breite = scale * Mockup-Breite
  const scaledArt = await sharp(artPng)
    .resize(Math.round(meta.width * scale), null, {
      fit: "inside",
      fastShrinkOnLoad: true,
    })
    .png()
    .toBuffer();

  const left = Math.round(meta.width * offsetX);
  const top = Math.round(meta.height * offsetY);

  const composites = [
    { input: scaledArt, left, top }
  ];

  // Falls Overlay gesetzt: PNG über alles legen
  if (overlayUrl) {
    const overlayBuf = await loadImage(overlayUrl);
    const overlayPng = await sharp(overlayBuf)
      .ensureAlpha()
      .png()
      .toBuffer();

    composites.push({
      input: overlayPng,
      left: 0,
      top: 0,
    });
  }

  // Artwork (und ggf. Overlay) auf Mockup compositen
  const finalBuffer = await mockSharp
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer();

  return finalBuffer;
}

// --------------------------------------------------
// /tote-preview – Artwork auf Tragetasche
// --------------------------------------------------
app.get("/tote-preview", async (req, res) => {
  const artworkUrl = req.query.url;

  if (!artworkUrl || typeof artworkUrl !== "string") {
    return res.status(400).json({ error: "Parameter 'url' fehlt oder ist ungültig." });
  }

  const cacheKey = "TOTE_" + artworkUrl;
  if (previewCache.has(cacheKey)) {
    res.setHeader("Content-Type", "image/png");
    return res.send(previewCache.get(cacheKey));
  }

  try {
    const finalBuffer = await placeArtworkOnMockup({
      artworkUrl,
      mockupUrl: TOTE_MOCKUP_URL,
      scale: 0.34,   // ~42 % der Taschenbreite
      offsetX: 0.295, // leicht links
      offsetY: 0.41, // etwas nach unten
      overlayUrl: undefined, // keine zusätzliche Ebene
    });

    previewCache.set(cacheKey, finalBuffer);
    res.setHeader("Content-Type", "image/png");
    res.send(finalBuffer);
  } catch (err) {
    console.error("Fehler in /tote-preview (NO BG):", err);
    res.status(500).json({
      error: "Interner Fehler in /tote-preview (NO BG)",
      detail: err.message || String(err),
    });
  }
});

// --------------------------------------------------
// /mug-preview – Artwork auf Tasse
// --------------------------------------------------
app.get("/mug-preview", async (req, res) => {
  const artworkUrl = req.query.url;

  if (!artworkUrl || typeof artworkUrl !== "string") {
    return res.status(400).json({ error: "Parameter 'url' fehlt oder ist ungültig." });
  }

  const cacheKey = "MUG_" + artworkUrl;
  if (previewCache.has(cacheKey)) {
    res.setHeader("Content-Type", "image/png");
    return res.send(previewCache.get(cacheKey));
  }

  try {
    const finalBuffer = await placeArtworkOnMockup({
      artworkUrl,
      mockupUrl: MUG_MOCKUP_URL,
      scale: 0.30,
      offsetX: 0.34,
      offsetY: 0.39,
      overlayUrl: undefined, // keine zusätzliche Ebene
    });

    previewCache.set(cacheKey, finalBuffer);
    res.setHeader("Content-Type", "image/png");
    res.send(finalBuffer);
  } catch (err) {
    console.error("Fehler in /mug-preview (NO BG):", err);
    res.status(500).json({
      error: "Interner Fehler in /mug-preview (NO BG)",
      detail: err.message || String(err),
    });
  }
});

// --------------------------------------------------
// NEU: /tee-white-preview – Artwork auf T-Shirt weiß + Overlay
// --------------------------------------------------
app.get("/tee-white-preview", async (req, res) => {
  const artworkUrl = req.query.url;

  if (!artworkUrl || typeof artworkUrl !== "string") {
    return res.status(400).json({ error: "Parameter 'url' fehlt oder ist ungültig." });
  }

  const cacheKey = "TEE_WHITE_" + artworkUrl;
  if (previewCache.has(cacheKey)) {
    res.setHeader("Content-Type", "image/png");
    return res.send(previewCache.get(cacheKey));
  }

  try {
    const finalBuffer = await placeArtworkOnMockup({
      artworkUrl,
      mockupUrl: TEE_WHITE_MOCKUP_URL,
      // Werte so gewählt, dass Druck relativ zentriert auf der Brust liegt.
      scale: 0.36,
      offsetX: 0.31,
      offsetY: 0.26,
      overlayUrl: TEE_WHITE_OVERLAY_URL,
    });

    previewCache.set(cacheKey, finalBuffer);
    res.setHeader("Content-Type", "image/png");
    res.send(finalBuffer);
  } catch (err) {
    console.error("Fehler in /tee-white-preview:", err);
    res.status(500).json({
      error: "Interner Fehler in /tee-white-preview",
      detail: err.message || String(err),
    });
  }
});

// --------------------------------------------------
// NEU: /tee-black-preview – Artwork auf T-Shirt schwarz + Overlay
// --------------------------------------------------
app.get("/tee-black-preview", async (req, res) => {
  const artworkUrl = req.query.url;

  if (!artworkUrl || typeof artworkUrl !== "string") {
    return res.status(400).json({ error: "Parameter 'url' fehlt oder ist ungültig." });
  }

  const cacheKey = "TEE_BLACK_" + artworkUrl;
  if (previewCache.has(cacheKey)) {
    res.setHeader("Content-Type", "image/png");
    return res.send(previewCache.get(cacheKey));
  }

  try {
    const finalBuffer = await placeArtworkOnMockup({
      artworkUrl,
      mockupUrl: TEE_BLACK_MOCKUP_URL,
      // gleiche Positionierung wie beim weißen Shirt
      scale: 0.36,
      offsetX: 0.31, // kleiner geht nach links
      offsetY: 0.26, // kleiner geht nach oben
      overlayUrl: TEE_BLACK_OVERLAY_URL,
    });

    previewCache.set(cacheKey, finalBuffer);
    res.setHeader("Content-Type", "image/png");
    res.send(finalBuffer);
  } catch (err) {
    console.error("Fehler in /tee-black-preview:", err);
    res.status(500).json({
      error: "Interner Fehler in /tee-black-preview",
      detail: err.message || String(err),
    });
  }
});

// --------------------------------------------------
// Serverstart
// --------------------------------------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log("Server läuft auf Port " + PORT);
});
