/**
 * Kinder Sefarim Bibliography — rebuild trigger
 * ------------------------------------------------------------------
 * Pings a Netlify build hook whenever the sheet is edited, so the
 * published site rebuilds with the new data. Edits are debounced: a
 * burst of edits fires at most one build ~1 minute after the last one.
 *
 * SETUP (do this once, inside the sheet that holds the catalog):
 *   1. In Google Sheets: Extensions → Apps Script. Paste this file in.
 *   2. Create a Netlify build hook:
 *        Netlify → Site configuration → Build & deploy → Build hooks
 *        → "Add build hook" → copy the URL.
 *   3. Paste that URL into BUILD_HOOK_URL below and Save.
 *   4. Run installTrigger() once (choose it in the toolbar → Run) and
 *      approve the permission prompt. That installs the on-edit trigger.
 *   5. Done. Editing any cell now schedules a rebuild.
 *
 * To test without editing: run buildNow() manually.
 */

// ⬇️ Paste your Netlify build hook URL here.
var BUILD_HOOK_URL = 'https://api.netlify.com/build_hooks/REPLACE_ME';

var DEBOUNCE_MS = 60 * 1000; // wait this long after the last edit before building

/** Installable on-edit handler — schedules a debounced rebuild. */
function onSheetEdit(e) {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('lastEdit', String(Date.now()));
  scheduleBuild_();
}

/** Ensure exactly one pending "maybeBuild" time trigger exists. */
function scheduleBuild_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'maybeBuild') return; // already pending
  }
  ScriptApp.newTrigger('maybeBuild')
    .timeBased()
    .after(DEBOUNCE_MS)
    .create();
}

/** Fires the build if the sheet has been quiet for DEBOUNCE_MS; else reschedules. */
function maybeBuild() {
  // Clean up the trigger that invoked us.
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'maybeBuild') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  var props = PropertiesService.getScriptProperties();
  var last = Number(props.getProperty('lastEdit') || 0);
  if (Date.now() - last < DEBOUNCE_MS) {
    scheduleBuild_(); // more edits arrived; wait another cycle
    return;
  }
  buildNow();
}

/** Immediately triggers a Netlify rebuild. */
function buildNow() {
  if (BUILD_HOOK_URL.indexOf('REPLACE_ME') !== -1) {
    throw new Error('Set BUILD_HOOK_URL to your Netlify build hook first.');
  }
  UrlFetchApp.fetch(BUILD_HOOK_URL, { method: 'post', muteHttpExceptions: true });
}

/** Run once to install the on-edit trigger. */
function installTrigger() {
  // Remove duplicates first so re-running is safe.
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onSheetEdit') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('onSheetEdit')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
}
