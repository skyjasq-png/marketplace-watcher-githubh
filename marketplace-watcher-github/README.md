# Marketplace Watcher GitHub

This is the free GitHub Actions version of your Facebook Marketplace mower watcher.

## Why this version

It uses:

- GitHub Actions scheduled every 10 minutes
- Playwright with real Chromium rendering
- ntfy phone alerts
- a checked-in `.state/seen.json` file so it does not alert on the same listing every run

## Free plan note

This is best kept in a **public GitHub repository** if you want it to stay free at a 10-minute schedule.

GitHub's docs say standard GitHub Actions runner usage is free for public repositories, while private repositories have included minute quotas. Sources:

- https://docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions
- https://github.com/pricing

## What to put in GitHub Secrets

Repository `Settings -> Secrets and variables -> Actions`

Create these repository secrets:

- `FACEBOOK_SEARCH_URL`
- `NTFY_TOPIC`
- `NTFY_SERVER_URL`
- `MAX_PRICE`
- `REQUIRED_KEYWORDS`
- `EXCLUDED_KEYWORDS`

Suggested values:

- `FACEBOOK_SEARCH_URL` = your exact Facebook Marketplace URL
- `NTFY_TOPIC` = `mcafee-mowers-forestcity-7f3d9a`
- `NTFY_SERVER_URL` = `https://ntfy.sh`
- `MAX_PRICE` = `100`
- `REQUIRED_KEYWORDS` = `lawn mower,mower,push mower,self propelled,riding mower`
- `EXCLUDED_KEYWORDS` = `wanted,repair,parts,broken`

## Test it

1. Push this folder to a GitHub repository
2. Add the secrets above
3. Open the `Actions` tab
4. Run `Marketplace Watcher`
5. Set `test_notify` to `true` for a phone test

Then run it again with `test_notify` left as `false` for the real watcher.
