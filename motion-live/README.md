# Motion Live – setup (all free)

1. Put this folder on GitHub (new repo). Never commit your API key.
2. Go to vercel.com, sign in with GitHub, "Add New Project", pick the repo, deploy.
3. In Vercel: Project > Storage > add **Upstash Redis** (free). It adds the Redis env vars automatically.
4. In Vercel: Settings > Environment Variables, add `YOUTUBE_API_KEY` = your key. Then Redeploy.
5. Open your site. Wait a few hours for growth/hr to fill in (history builds while people visit).

Edit the creator list at the top of `api/stats.js` (handles without @).
Unmatched handles show in a small red note at the bottom of the page.
