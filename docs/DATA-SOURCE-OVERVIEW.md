# Data-source overview

The portal reports what it can prove about each pipeline without treating all sources as continuous feeds.

- **Imported** means a source capture is retained in the clinical evidence database. Its timestamp is the capture time, not a promise of ongoing synchronisation.
- **Fresh** and **Delayed** apply only to the Google Health importer and use its configured source-data threshold.
- **Not linked** means the data may exist elsewhere in the platform, but the portal has no verified freshness connection to it.
- **Unavailable** means the configured status service could not be reached. No credential or upstream error body is returned to the browser.

`GET /overview/sources` derives clinical counts, capture time, event-date range, review count and parser versions from the read-only SQLite database. Missing dates are handled case-insensitively.

## Optional Google Health link

Set these only in the private `clinical-api` container environment:

```text
GOOGLE_IMPORTER_STATUS_URL=http://10.30.30.2:8010/status
GOOGLE_IMPORTER_STATUS_USER=<HTTP Basic user>
GOOGLE_IMPORTER_STATUS_PASSWORD=<HTTP Basic password>
```

The API reads only the importer freshness and sync state, then returns a sanitised summary. The raw status document, current measurements, 24-hour series and credentials are never proxied to the browser.

On Mobius, use the importer's private LAN endpoint rather than routing this server-to-server check through the public Cloudflare tunnel. The public status URL remains useful for human administration, but Cloudflare may reject a container hairpin request.

Apple Health upload freshness comes from Open Wearables' supported recent-sync API:

```text
OPEN_WEARABLES_STATUS_URL=http://10.30.30.2:8003
OPEN_WEARABLES_USER_ID=<Open Wearables user UUID>
OPEN_WEARABLES_API_KEY=<read-capable API key>
APPLE_FRESH_AFTER_HOURS=24
```

The portal filters the recent sync feed to Apple events and returns only state and timestamps. A failed latest upload is marked as needing attention; a completed upload older than the configured threshold is delayed. Open Wearables retains this recent sync feed for 24 hours, so an empty window is reported as delayed rather than silently treated as healthy.
