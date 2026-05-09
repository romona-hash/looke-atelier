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
//   - PRESERVE IDENTITY (this is the #1 priority — must work)
//   - Use specific terminology Flux Kontext responds to
//   - Lead with identity preservation, then describe ONLY the change
//   - Use explicit negative instructions ("do NOT modify")
//
// Why prompts are written this way:
// Flux Kontext is an "edit this image" model. It tries to keep the
// original whenever possible, but vague language gives it permission
// to drift. Specific identity-locking language ("preserve exact
// facial features," "do not modify face") tells it which regions to
// freeze and which to edit. The phrase "ONLY change the hair" is
// critical — it scopes the entire edit to a single region.
//
const HAIRSTYLES = {
  textured_pixie: {
    name: "Textured Pixie",
    prompt: "Preserve the exact identity, face, facial features, skin tone, skin texture, eye color, eye shape, eyebrows, nose, lips, jawline, ears, neck, and body of the person in the photo. Do NOT modify the face in any way. Do NOT change the person's appearance, age, or ethnicity. ONLY change the hairstyle to a short textured pixie cut with subtle piecey layers and tousled volume on top. Keep the original photo's lighting, background, clothing, and pose exactly as they are. Photorealistic.",
  },
  curly_tapered: {
    name: "Curly Tapered Cut",
    prompt: "Preserve the exact identity, face, facial features, skin tone, skin texture, eye color, eye shape, eyebrows, nose, lips, jawline, ears, neck, and body of the person in the photo. Do NOT modify the face in any way. Do NOT change the person's appearance, age, or ethnicity. ONLY change the hairstyle to a curly tapered cut with defined natural curls on top and shorter tapered sides. Healthy moisturized curl definition. Keep the original photo's lighting, background, clothing, and pose exactly as they are. Photorealistic.",
  },
  wavy_pixie: {
    name: "Wavy Pixie",
    prompt: "Preserve the exact identity, face, facial features, skin tone, skin texture, eye color, eye shape, eyebrows, nose, lips, jawline, ears, neck, and body of the person in the photo. Do NOT modify the face in any way. Do NOT change the person's appearance, age, or ethnicity. ONLY change the hairstyle to a soft wavy pixie cut with gentle feminine waves and movement. Keep the original photo's lighting, background, clothing, and pose exactly as they are. Photorealistic.",
  },
  layered_crop: {
    name: "Layered Crop",
    prompt: "Preserve the exact identity, face, facial features, skin tone, skin texture, eye color, eye shape, eyebrows, nose, lips, jawline, ears, neck, and body of the person in the photo. Do NOT modify the face in any way. Do NOT change the person's appearance, age, or ethnicity. ONLY change the hairstyle to a layered crop with bold modern layers and a sweeping side parting. Keep the original photo's lighting, background, clothing, and pose exactly as they are. Photorealistic.",
  },
  sleek_bob: {
    name: "Sleek Bob",
    prompt: "Preserve the exact identity, face, facial features, skin tone, skin texture, eye color, eye shape, eyebrows, nose, lips, jawline, ears, neck, and body of the person in the photo. Do NOT modify the face in any way. Do NOT change the person's appearance, age, or ethnicity. ONLY change the hairstyle to a sleek straight chin-length bob with center parting and polished glossy finish. Keep the original photo's lighting, background, clothing, and pose exactly as they are. Photorealistic.",
  },
  long_waves: {
    name: "Long Waves",
    prompt: "Preserve the exact identity, face, facial features, skin tone, skin texture, eye color, eye shape, eyebrows, nose, lips, jawline, ears, neck, and body of the person in the photo. Do NOT modify the face in any way. Do NOT change the person's appearance, age, or ethnicity. ONLY change the hairstyle to long flowing wavy hair past the shoulders with healthy lustrous waves and soft volume. Keep the original photo's lighting, background, clothing, and pose exactly as they are. Photorealistic.",
  },
  twist_out: {
    name: "Twist-Out",
    prompt: "Preserve the exact identity, face, facial features, skin tone, skin texture, eye color, eye shape, eyebrows, nose, lips, jawline, ears, neck, and body of the person in the photo. Do NOT modify the face in any way. Do NOT change the person's appearance, age, or ethnicity. ONLY change the hairstyle to a defined twist-out with springy coily texture, healthy moisture, and natural volume. Keep the original photo's lighting, background, clothing, and pose exactly as they are. Photorealistic.",
  },
  bantu_knots: {
    name: "Bantu Knots",
    prompt: "Preserve the exact identity, face, facial features, skin tone, skin texture, eye color, eye shape, eyebrows, nose, lips, jawline, ears, neck, and body of the person in the photo. Do NOT modify the face in any way. Do NOT change the person's appearance, age, or ethnicity. ONLY change the hairstyle to neat parted bantu knots arranged in clean rows across the scalp. Keep the original photo's lighting, background, clothing, and pose exactly as they are. Photorealistic.",
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
    const { photo, hairstyle, customDescription } = req.body || {};

    // ---------- VALIDATION ----------
    if (!photo || typeof photo !== "string") {
      return res.status(400).json({ error: "Missing or invalid photo." });
    }
    if (!photo.startsWith("data:image/")) {
      return res.status(400).json({ error: "Photo must be a data URL." });
    }

    // Accept EITHER a preset hairstyle ID OR a custom description
    const isCustom = hairstyle === "custom";
    if (isCustom) {
      if (!customDescription || typeof customDescription !== "string") {
        return res.status(400).json({ error: "Custom description is required when using custom hairstyle." });
      }
      const trimmed = customDescription.trim();
      if (trimmed.length < 3) {
        return res.status(400).json({ error: "Please describe the hairstyle in more detail (at least 3 characters)." });
      }
      if (trimmed.length > 200) {
        return res.status(400).json({ error: "Description too long. Please keep it under 200 characters." });
      }
      // Block obviously inappropriate inputs (basic safety filter)
      const blocked = /\b(nude|naked|sexual|porn|nsfw|child|kid|minor|underage)\b/i;
      if (blocked.test(trimmed)) {
        return res.status(400).json({ error: "Your description contains content that can't be processed. Please describe a hairstyle only." });
      }
    } else if (!hairstyle || !HAIRSTYLES[hairstyle]) {
      return res.status(400).json({
        error: "Invalid hairstyle. Choose one of: " + Object.keys(HAIRSTYLES).join(", ") + ", or send hairstyle='custom' with a customDescription.",
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

    // Build the prompt — preset uses pre-written prompt, custom builds from user description
    let prompt, displayName;
    if (isCustom) {
      const userDesc = customDescription.trim();
      prompt = `Preserve the exact identity, face, facial features, skin tone, skin texture, eye color, eye shape, eyebrows, nose, lips, jawline, ears, neck, and body of the person in the photo. Do NOT modify the face in any way. Do NOT change the person's appearance, age, or ethnicity. ONLY change the hairstyle to: ${userDesc}. Keep the original photo's lighting, background, clothing, and pose exactly as they are. Photorealistic.`;
      displayName = userDesc.charAt(0).toUpperCase() + userDesc.slice(1);
    } else {
      prompt = HAIRSTYLES[hairstyle].prompt;
      displayName = HAIRSTYLES[hairstyle].name;
    }

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
        // Tuned parameters for maximum identity preservation:
        //   - prompt_upsampling: false  → don't let the model "creatively
        //     interpret" the prompt; use it literally
        //   - aspect_ratio: "match_input_image" → keep the original photo's
        //     composition exactly
        //   - safety_tolerance: 2  → strict, conservative edits
        version: "black-forest-labs/flux-kontext-pro",
        input: {
          prompt: prompt,
          input_image: photo,
          output_format: "jpg",
          safety_tolerance: 2,
          prompt_upsampling: false,
          aspect_ratio: "match_input_image",
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
        hairstyleName: displayName,
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
