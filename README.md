# Looke Atelier — Setup & Deployment Guide

You're about to launch a real AI-powered web app. This guide walks you through every step. Take it slow. Read each section before doing it.

---

## What you're deploying

Three files:
- `index.html` — the main app (frontend)
- `api/tryon.js` — the backend function that securely calls Replicate's AI
- `vercel.json` — Vercel configuration

Plus three external services:
- **GitHub** (stores your code)
- **Vercel** (hosts your app, runs the backend function)
- **Replicate** (the AI that generates the try-on images)
- **Stripe** (collects payments — already on your list)

---

## STEP 1 — Get your Replicate API key

1. Go to https://replicate.com and sign up (use your existing Google or GitHub account, easiest)
2. Add a payment method at https://replicate.com/account/billing — start with $5–10 of credit
3. Go to https://replicate.com/account/api-tokens
4. Click **"Create token"** — name it "Looke Atelier"
5. Copy the token. It starts with `r8_...` and is about 40 characters long
6. **Keep this token secret.** Never paste it into your HTML, never commit it to GitHub

> **Cost reality check.** Each try-on with Flux Kontext Pro costs about $0.03–0.05. Starting with $10 gets you ~200–300 generations to test with. When you start charging customers, you'll buy more credit.

---

## STEP 2 — Push code to GitHub

If you've already got a GitHub repo for Looke Atelier, just replace the existing files with these new ones. Otherwise:

1. Go to https://github.com/new
2. Name your repo (e.g. "looke-atelier")
3. Make it **Private** (don't expose your work to the public yet)
4. Click **Create repository**
5. On your computer, drag these three files/folders into your local repo folder:
   - `index.html`
   - `api/tryon.js` (the `api` folder is important — keep it!)
   - `vercel.json`
6. Use GitHub Desktop (or your terminal) to commit and push

> **Important.** The folder structure matters. Vercel looks for files inside `/api/` and turns them into serverless functions automatically. If you put `tryon.js` anywhere else, the AI try-on will not work.

Your repo should look like this:

```
looke-atelier/
├── api/
│   └── tryon.js
├── index.html
└── vercel.json
```

---

## STEP 3 — Connect Vercel to your repo

1. Go to https://vercel.com (sign in with your existing GitHub)
2. Click **"Add New…" → "Project"**
3. Find your `looke-atelier` repo and click **Import**
4. **Don't change any build settings** — Vercel auto-detects the static HTML and the API function
5. **Before clicking Deploy**, scroll to **Environment Variables** and add this:
   - **Name:** `REPLICATE_API_TOKEN`
   - **Value:** the `r8_...` token you got in Step 1
   - Click **Add**
6. Now click **Deploy**

> **Why the env var matters.** This is how your token stays secret. Vercel injects it into your serverless function at runtime, so the token exists on the server but never appears in your code or in your browser. If you skip this step, the AI call will fail.

After ~30 seconds your app is live at a URL like `looke-atelier.vercel.app`.

---

## STEP 4 — Test the AI try-on

1. Visit your live URL
2. Upload a clear front-facing portrait of yourself
3. Click any hairstyle in the gallery
4. Click **"✨ Generate My Try-On"**
5. Wait 20–45 seconds
6. You should see a Before/After reveal

If it fails, check:
- Did you add `REPLICATE_API_TOKEN` to Vercel's environment variables?
- Did you put credit in your Replicate account?
- Is the image you uploaded a clear, front-facing portrait? (AI struggles with profile shots, hats, sunglasses)

---

## STEP 5 — Set up Stripe Payment Links

1. Go to https://dashboard.stripe.com/payment-links
2. Click **"+ New"** twice to create two products:

   **Product 1: Looke Atelier Pro**
   - Price: $9.99 / month
   - Recurring: Monthly
   - Copy the resulting payment link URL (looks like `https://buy.stripe.com/abc123...`)

   **Product 2: Looke Atelier Premium**
   - Price: $19.99 / month
   - Recurring: Monthly
   - Copy that URL too

3. Open `index.html` and find this near the top of the `<script>` tag:

   ```js
   const STRIPE_LINKS = {
     pro:     "https://buy.stripe.com/REPLACE_ME_PRO_LINK",
     premium: "https://buy.stripe.com/REPLACE_ME_PREMIUM_LINK",
   };
   ```

4. Replace both URLs with your real ones, save, push to GitHub. Vercel auto-redeploys in 30 seconds.

---

## STEP 6 — Important: Pricing enforcement is honor-system right now

The free tier gives users **2 try-ons total**. The Pro plan gives **10 per month**. The Premium plan gives **30 per month**. The app tracks these in the user's browser via localStorage.

**Honest limitation:** A determined user could clear their browser and get more free try-ons, costing you ~$0.05 each time. For an MVP, this is fine — most users won't bother. When you have real revenue and active abuse, you'll need a real backend with a database to enforce limits server-side. Until then, accept the small leakage as a cost of doing business.

When customers upgrade via Stripe, **their account doesn't auto-upgrade in the app.** Stripe charges them, but the app still treats them as free-tier. To upgrade them properly:

- **Quick fix for now:** When someone subscribes, manually email them and ask for the email they used. Then in your browser console on your live app, run:
  ```js
  const users = JSON.parse(localStorage.getItem("sa_users"));
  users["customer@email.com"].plan = "pro"; // or "premium"
  localStorage.setItem("sa_users", JSON.stringify(users));
  ```
  This only works for *your* browser, of course — the customer's plan will still show as free on their device.

- **Real fix:** You'll need a database (Supabase is free and easy) and Stripe webhooks. Tell me when you're ready and I'll build that.

---

## STEP 7 — Buy a custom domain (optional but recommended)

1. Go to GoDaddy, Namecheap, or buy directly through Vercel
2. Suggestion: `lookeatelier.com` if available, or `lookeatelier.app`, or similar
3. In Vercel: **Project Settings → Domains → Add**
4. Follow Vercel's DNS instructions (it'll tell you exactly what to enter at your domain registrar)

---

## STEP 8 — Test everything one more time

Run through this checklist on your phone (most users will be on mobile):

- [ ] Sign up creates an account
- [ ] Log out works
- [ ] Log in works
- [ ] Upload a portrait
- [ ] Pick a hairstyle and generate try-on
- [ ] Result loads in 20–45 seconds
- [ ] Save to history works
- [ ] Download works
- [ ] After 2 try-ons, the upgrade modal appears
- [ ] Pricing buttons take you to Stripe checkout
- [ ] Stripe accepts a real test card

---

## How much will this cost you?

| Item | Cost |
|------|------|
| Vercel hosting | Free (up to 100K function calls/month) |
| Vercel bandwidth | Free up to 100GB/month |
| GitHub | Free for private repos |
| Replicate AI | $0.03–0.05 per try-on |
| Stripe | 2.9% + $0.30 per transaction |
| Domain | $10–15/year |

**Per-user economics example:**
- Free user does 2 try-ons → costs you $0.10
- Pro subscriber pays $9.99/mo, does 8 try-ons → costs you $0.40 in API + ~$0.59 in Stripe fees → you keep ~$9.00/mo
- Premium subscriber pays $19.99/mo, does 25 try-ons → costs you $1.25 in API + ~$0.88 in Stripe fees → you keep ~$17.86/mo

The math is healthy. The risk is **acquisition cost** — how much you spend on ads or marketing to get one paying customer. If you spend $30 to acquire one Pro subscriber, it takes ~3.5 months for them to become profitable. Plan accordingly.

---

## When something breaks

**"Server is not configured"** → You forgot to add `REPLICATE_API_TOKEN` to Vercel env vars. Fix: Settings → Environment Variables → add it → redeploy.

**"AI service is currently unavailable"** → Replicate is down (rare) or your API token is wrong. Check your token, check https://replicate.com/status.

**"AI took too long to respond"** → Sometimes the model takes >60s. The serverless function times out. Have the user click "try again — no charge" (the app handles this automatically).

**The image doesn't look like the user** → AI face preservation is imperfect. About 1 in 10 generations are unusable. The "🔄 Try a different style" button lets users retry without burning a credit.

**Vercel function logs** → For any other issue, go to Vercel → your project → Deployments → click latest → Functions tab → click `api/tryon.js` → see the actual error.

---

## What to build next

Once this is live and working:

1. **Real subscription tracking** (Supabase + Stripe webhooks) — so paying customers automatically get their plan upgraded
2. **More features** — glasses try-on, outfit try-on, makeup try-on
3. **Sharing** — let users share their before/after to Instagram with one tap
4. **Referral program** — give 1 free try-on for each friend they bring
5. **Email capture** — collect emails for marketing even from free users

Tell me when you're ready for any of these.

---

## You're ready

You've built an actual SaaS product. Most people never get this far. Now ship it.

Looke Atelier · Built with Claude
