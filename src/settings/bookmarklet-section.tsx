import { useTranslation } from "react-i18next";
import { bookmarkletSource } from "../bookmarklet";
import "./settings.css";

// Install surface for the capture bookmarklet (#61).
//
// A link to drag, not a button to click: a bookmarklet only works from the
// bookmarks bar, and there is no API for putting one there. The href is the
// script itself, which is also why this is a plain <a> and not the owned
// Button — a javascript: URL on a control that is not a link would be a
// trick, and browsers block clicking one from the page anyway.
export function CaptureBookmarklet() {
  const { t } = useTranslation();
  const href = bookmarkletSource(window.location.origin);
  return (
    <div className="admin-invite">
      <h3>{t("capture.title")}</h3>
      <p className="muted small">{t("capture.hint")}</p>
      <p className="capture-drag">
        {/* eslint-disable-next-line no-script-url -- the href is the point */}
        <a className="capture-bookmarklet" href={href}>
          {t("capture.linkLabel")}
        </a>
      </p>
      <p className="muted small">{t("capture.privacy")}</p>
    </div>
  );
}
