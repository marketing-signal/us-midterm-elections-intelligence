# Midterms data refresh

1. Repo layout: `Midterms Intelligence (standalone).html`, `midterms-data.json`, `backend/refresh-midterms-data.mjs`, `.github/workflows/midterms-refresh.yml`.
2. Add repo secrets `SIGNAL_API_BASE` and `SIGNAL_API_KEY`.
3. In `refresh-midterms-data.mjs`, edit the `signal()` adapter to match your Signal AI API endpoints and auth. This is the only part I couldn't verify.
4. Turn on GitHub Pages. The page re-reads `midterms-data.json` every hour.

What the job updates: daily volume, the last-24-hours panel, the latest-stories feed, and the "Last updated" timestamp.
What it leaves as-is: weekly topics, share of voice, state and issue sentiment, spikes, and other feeds (they come from the original Oct 1 to Nov 2 snapshot). Extend the script the same way if you want those refreshed.

Any host works (S3, SharePoint, intranet). Replace the workflow with a cron job that runs the script and uploads `midterms-data.json`.
