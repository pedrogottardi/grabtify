/* Grabtify — shared field validation.
 *
 * Loaded both as a CommonJS module (Electron main process, node --test) and as
 * a plain <script> in the sandboxed renderer (where require() does not exist,
 * so it attaches itself to window.GrabtifyValidation instead).
 */
"use strict";

(function () {
  const URL_RE = /^https?:\/\/\S+$/i;
  const TIMECODE_RE = /^\d+(?::\d+){0,2}(?:\.\d+)?$/;

  // i18n resolves at call time so the message matches the current language.
  let i18n = null;
  if (typeof module !== "undefined" && module.exports) {
    i18n = require("./i18n");
  } else if (typeof window !== "undefined") {
    i18n = window.GrabtifyI18n || null;
  }

  function urlError() {
    return i18n ? i18n.t("validation.urlError") : "Enter a full http(s) link first.";
  }
  function timecodeError() {
    return i18n ? i18n.t("validation.timecodeError") : "Timecodes look like 90, 1:30, or 1:02:03.";
  }

  // Returns null when valid, otherwise the human-readable error message.
  function validateUrl(url) {
    url = (url || "").trim();
    if (!URL_RE.test(url)) return urlError();
    return null;
  }

  // Empty input is valid (the field is optional); returns null or an error.
  function validateTimecode(value) {
    value = (value || "").trim();
    if (!value) return null;
    if (!TIMECODE_RE.test(value)) return timecodeError();
    return null;
  }

  // "90", "1:30", or "1:02:03.5" → seconds. Empty input → null. Anything else
  // throws so the caller can surface the message to the user.
  function parseTimecode(value) {
    value = (value || "").trim();
    if (!value) return null;
    if (!TIMECODE_RE.test(value)) throw new Error(timecodeError());
    const parts = value.split(":");
    let secs = 0;
    for (const p of parts) secs = secs * 60 + parseFloat(p);
    if (Number.isNaN(secs)) throw new Error(timecodeError());
    return secs;
  }

  const api = {
    validateUrl: validateUrl,
    validateTimecode: validateTimecode,
    parseTimecode: parseTimecode,
  };
  Object.defineProperty(api, "URL_ERROR", { enumerable: true, get: urlError });
  Object.defineProperty(api, "TIMECODE_ERROR", { enumerable: true, get: timecodeError });

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.GrabtifyValidation = api;
})();
