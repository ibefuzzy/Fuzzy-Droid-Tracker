# Setting up the Live Friends server (Cloudflare, free plan)

Do these in order, in the Cloudflare dashboard (dash.cloudflare.com), logged in to your account.

## Step 1: Make the database
1. In the left menu, click **Storage & Databases**, then **D1 SQL Database**.
2. Click **Create**.
3. Name: `fdt-live`. Leave everything else as it is.
4. Click **Create**. Done; you don't type anything into it.

## Step 2: Make the Worker
1. In the left menu, click **Compute (Workers)**, then **Workers & Pages**.
2. Click **Create**, then pick **Start with Hello World** (it may say "Create Worker").
3. Name: `fdt-live`.
4. Click **Deploy**.

## Step 3: Put the code in
1. On the Worker's page, click **Edit code**.
2. In the editor, select all the sample code (Ctrl+A) and delete it.
3. On your PC, open `worker\live-friends-worker.mjs` (in the droid-tycoon-overlay folder) in Notepad.
   Select all (Ctrl+A), copy (Ctrl+C).
4. Paste it into the Cloudflare editor (Ctrl+V).
5. Click **Deploy** (top right).

## Step 4: Connect the Worker to the database
1. Go back to the Worker's page (click its name `fdt-live`).
2. Click **Settings**, then **Bindings**.
3. Click **Add**, then pick **D1 database**.
4. Variable name: `DB` (exactly that, capital letters).
5. Database: pick `fdt-live`.
6. Click **Save** (or **Deploy**).

## Step 5: Check it works
1. On the Worker's page, find its address. It looks like
   `https://fdt-live.YOURNAME.workers.dev`.
2. Open it in your browser. You should see:
   `{"ok":true,"service":"Fuzzy's Droid Tracker live friends"}`

## Step 6: Send the address to Claude
Paste the address from Step 5 into the chat. (It's not a secret.)

## Step 7: Turn off request logging (privacy)
New Workers keep a log of every request for a few days (it can include players' IP addresses).
1. Workers & Pages → `fdt-live` → **Settings**.
2. Find **Observability** (Workers Logs). Switch **Workers Logs** off (or Disable) and save.

## Updating the Worker code later
When Claude changes `worker\live-friends-worker.mjs`: Workers & Pages → `fdt-live` → **Edit code**,
select all, paste the new file, **Deploy**. The database and its data stay as they are.

If any button name doesn't match what you see, tell Claude what's on the screen.
