// ============================================================
//  STYLE ATELIER — TRY-ON API (Vercel Serverless Function)
// ============================================================
//
//  WHAT THIS FILE DOES:
//  This is a tiny backend that lives at /api/tryon. When the
//  browser sends it a photo + a hairstyle choice, this function:
//    1. Checks that the request looks legitimate
//    2. Calls Replicate's API with the user's photo
//    3. Polls Replicate until the AI is finished
//    4. Sends the new image back to the browser
//
//  WHY WE NEED IT:
//  Your REPLICATE_API_TOKEN is a secret. If it lived in
//  index.html, anyone could view your page source and steal it,
//  then run up your bill. By putting it on a serverless backend,
//  the token never leaves your server. The browser asks the
//  server, the server asks Replicate, the server returns the
//  image. The user never sees the token.
//
//  HOW VERCEL HANDLES THIS:
//  Vercel automatically hosts any file in /api/ as a serverless
//  function. You don't manage a server. It runs on demand,
//  scales to zero when idle, and is free up to 100K calls/month.
//
// ============================================================

// ---------- HAIRSTYLE LIBRARY ----------
// Each entry has a "name" (what users see) and a "prompt" (what
// the AI receives). Prompts are CAREFULLY crafted to:
//   - Preserve the face/identity (critical)
//   - Be specific about the cut, length, and texture
//   - Specify lighting/realism so it doesn't look fake
const HAIRSTYLES = {
  textured_pixie: {
    name: "Textured Pixie",
    prompt: "Change the hairstyle to a short textured pixie cut with subtle layers and tousled volume on top. Keep the face, skin tone, eye color, facial features, and identity exactly the same. Natural realistic hair texture appropriate to the subject's hair type. Studio portrait lighting. Photorealistic.",
  },
  curly_tapered: {
    name: "Curly Tapered Cut",
    prompt: "Change the hairstyle to a curly tapered cut: defined natural curls on top with shorter tapered sides. Keep the face, skin tone, eye color, facial features, and identity exactly the same. Healthy moisturized curl definition. Studio portrait lighting. Photorealistic.",
  },
  wavy_pixie: {
    name: "Wavy Pixie",
    prompt: "Change the hairstyle to a soft wavy pixie cut with feminine waves and movement. Keep the face, skin tone, eye color, facial features, and identity exactly the same. Soft and bouncy texture. Studio portrait lighting. Photorealistic.",
  },
  layered_crop: {
    name: "Layered Crop",
    prompt: "Change the hairstyle to a layered crop with bold modern layers and side sweep. Keep the face, skin tone, eye color, facial features, and identity exactly the same. Edgy but polished. Studio portrait lighting. Photorealistic.",
  },
  sleek_bob: {
    name: "Sleek Bob",
    prompt: "Change the hairstyle to a sleek straight chin-length bob with center parting. Keep the face, skin tone, eye color, facial features, and identity exactly the same. Polished glossy finish. Studio portrait lighting. Photorealistic.",
  },
  long_waves: {
    name: "Long Waves",
    prompt: "Change the hairstyle to long flowing wavy hair past the shoulders with soft volume. Keep the face, skin tone, eye color, facial features, and identity exactly the same. Healthy lustrous waves. Studio portrait lighting. Photorealistic.",
  },
  twist_out: {
    name: "Twist-Out",
    prompt: "Change the hairstyle to a defined twist-out with springy coily texture and natural volume. Keep the face, skin tone, eye color, facial features, and identity exactly the same. Healthy moisturized natural hair. Studio portrait lighting. Photorealistic.",
  },
  bantu_knots: {
    name: "Bantu Knots",
    prompt: "Change the hairstyle to neat parted bantu knots arranged across the head. Keep the face, skin tone, eye color, facial features, and identity exactly the same. Clean defined parts. Studio portrait lighting. Photorealistic.",
  },
};

// ---------- THE FUNCTION VERCEL CALLS ----------
//
// `req` is the incoming request from the browser
// `res` is the response we send back
//
export default async function handler(req, res) {
  // Only accept POST requests (security best practice)
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { photo, hairstyle } = req.body || {};

    // ---------- VALIDATION ----------
    if (!photo || typeof photo !== "string") {
      return res.status(400).json({ error: "Missing or invalid photo." });
    }
    if (!photo.startsWith("data:image/")) {
      return res.status(400).json({ error: "Photo must be a data URL." });
    }
    if (!hairstyle || !HAIRSTYLES[hairstyle]) {
      return res.status(400).json({
        error: "Invalid hairstyle. Choose one of: " + Object.keys(HAIRSTYLES).join(", "),
      });
    }
    // Reject huge payloads (Vercel has a 4.5MB body limit by default,
    // and we cap our photos at ~5MB on the client side — but check here too)
    if (photo.length > 7_500_000) {
      return res.status(413).json({ error: "Photo too large. Please use a smaller image." });
    }

    // ---------- CHECK API KEY ----------
    const apiToken = process.env.REPLICATE_API_TOKEN;
    if (!apiToken) {
      console.error("REPLICATE_API_TOKEN not set in environment");
      return res.status(500).json({
        error: "Server is not configured. Please contact support.",
      });
    }

    const prompt = HAIRSTYLES[hairstyle].prompt;

    // ---------- CALL REPLICATE ----------
    //
    // Flux Kontext Pro is Black Forest Labs' edit-this-image model.
    // It excels at "change one aspect, keep everything else identical."
    //
    // The Replicate API works in two steps:
    //   1. POST /v1/predictions → returns a prediction ID (queued)
    //   2. Poll GET /v1/predictions/<id> until status is "succeeded"
    //
    // We do both inside this function so the browser only makes one call.
    //
    const startResp = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        "Prefer": "wait", // Tell Replicate to wait for completion if it can (faster path)
      },
      body: JSON.stringify({
        // Flux Kontext Pro by Black Forest Labs
        version: "black-forest-labs/flux-kontext-pro",
        input: {
          prompt: prompt,
          input_image: photo,
          output_format: "jpg",
          safety_tolerance: 2,
        },
      }),
    });

    if (!startResp.ok) {
      const errorText = await startResp.text();
      console.error("Replicate start error:", startResp.status, errorText);
      return res.status(502).json({
        error: "AI service is currently unavailable. Please try again in a moment.",
      });
    }

    let prediction = await startResp.json();

    // ---------- POLL UNTIL DONE ----------
    //
    // If "Prefer: wait" finished it for us, status is already "succeeded".
    // Otherwise, poll every 2 seconds, max 50 seconds total.
    //
    const POLL_INTERVAL_MS = 2000;
    const MAX_POLLS = 25; // 25 × 2s = 50 seconds
    let polls = 0;

    while (
      prediction.status !== "succeeded" &&
      prediction.status !== "failed" &&
      prediction.status !== "canceled" &&
      polls < MAX_POLLS
    ) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      polls++;

      const pollResp = await fetch(prediction.urls.get, {
        headers: { "Authorization": `Bearer ${apiToken}` },
      });
      if (!pollResp.ok) {
        console.error("Replicate poll error:", pollResp.status);
        break;
      }
      prediction = await pollResp.json();
    }

    // ---------- HANDLE RESULT ----------
    if (prediction.status === "succeeded") {
      // Replicate returns the output as a URL (or array of URLs).
      // For Flux Kontext, output is typically a single URL string.
      const imageUrl = Array.isArray(prediction.output)
        ? prediction.output[0]
        : prediction.output;
      if (!imageUrl) {
        return res.status(502).json({ error: "AI returned no image. Please try again." });
      }
      return res.status(200).json({
        success: true,
        imageUrl: imageUrl,
        hairstyleName: HAIRSTYLES[hairstyle].name,
      });
    }

    if (prediction.status === "failed") {
      console.error("Replicate prediction failed:", prediction.error);
      return res.status(502).json({
        error: prediction.error || "AI generation failed. Please try a different photo.",
      });
    }

    // Timed out
    return res.status(504).json({
      error: "AI took too long to respond. Please try again.",
    });
  } catch (err) {
    console.error("Unexpected error in /api/tryon:", err);
    return res.status(500).json({ error: "Something went wrong. Please try again." });
  }
}

// ---------- VERCEL CONFIG ----------
// Increase the body size limit since we're sending image data URLs.
// Default is 1MB; we need closer to 5MB.
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
  // Allow up to 60 seconds for AI generation (default is 10s)
  maxDuration: 60,
};
