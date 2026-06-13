/**
 * Google Apps Script Web App
 *
 * Setup:
 * 1) Create a Google Sheet and copy its ID from the URL.
 * 2) Open Extensions -> Apps Script on that sheet.
 * 3) Paste this script, set SHEET_ID and SHEET_NAME.
 * 4) Deploy -> New deployment -> Web app.
 * 5) Execute as: Me, Who has access: Anyone.
 * 6) Copy web app URL and set WAITLIST_WEBHOOK_URL in your hosting env.
 */

const SHEET_ID = "REPLACE_WITH_SHEET_ID";
const SHEET_NAME = "Waitlist";
const OWNER_EMAIL = "hamzaashergill@gmail.com";

function ensureHeader(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Submitted At",
      "Name",
      "Email",
      "Phone",
      "Country",
      "Heard From",
      "Destination Email"
    ]);
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    ensureHeader(sheet);

    sheet.appendRow([
      data.submittedAt || new Date().toISOString(),
      data.name || "",
      data.email || "",
      data.phone || "",
      data.country || "",
      Array.isArray(data.heardFrom) ? data.heardFrom.join(", ") : "",
      data.destinationEmail || OWNER_EMAIL
    ]);

    MailApp.sendEmail({
      to: OWNER_EMAIL,
      subject: `New HELIO waitlist signup: ${data.name || "Unknown"}`,
      htmlBody:
        `<p><b>Name:</b> ${data.name || ""}</p>` +
        `<p><b>Email:</b> ${data.email || ""}</p>` +
        `<p><b>Phone:</b> ${data.phone || ""}</p>` +
        `<p><b>Country:</b> ${data.country || ""}</p>` +
        `<p><b>Heard From:</b> ${Array.isArray(data.heardFrom) ? data.heardFrom.join(", ") : ""}</p>` +
        `<p><b>Submitted:</b> ${data.submittedAt || new Date().toISOString()}</p>`
    });

    return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(
      ContentService.MimeType.JSON
    );
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ ok: false, error: String(error) })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}
