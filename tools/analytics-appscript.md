# Passive analytics sink (optional)

The app can send passive, **no-PII** usage events (event name, screen, initials, coarse device,
timestamp — never location, IP, PIN, or message content) to a private Google Sheet, so you can see
*if and how* the app gets used without collecting anything sensitive. It's off until you set
`ANALYTICS_URL` in `sync-config.js`.

## Set it up

1. Create a new Google Sheet.
2. Extensions → **Apps Script**, paste the snippet below, and **Deploy → New deployment → Web app**
   (Execute as *me*, access *Anyone*). Copy the web-app URL.
3. Put that URL in `sync-config.js` → `ANALYTICS_URL`.

```javascript
function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('events')
    || SpreadsheetApp.getActiveSpreadsheet().insertSheet('events');
  const body = JSON.parse(e.postData.contents);
  (body.events || []).forEach(function (ev) {
    sheet.appendRow([new Date(ev.ts), ev.event, ev.screen, ev.who,
      ev.device && ev.device.kind, JSON.stringify(ev.meta || {})]);
  });
  return ContentService.createTextOutput('ok');
}
```

The app posts with `navigator.sendBeacon` in small batches. It never blocks the UI and silently
drops events if the sink is unreachable — analytics must never break the floor.
