import { useTranslation } from "react-i18next";

// Zone ids are data, not copy — they stay untranslated. Only the label and
// the hint are localized.
function supportedZones(): string[] {
  // Supported everywhere current (Safari from 15.4). Where it is missing the
  // field still works, it just is not browsable. Cast through an optional
  // signature so the runtime guard survives tsc: lib.d.ts declares the
  // method as always present, so a plain `Intl.supportedValuesOf?.()` is
  // flagged as a condition that's always true.
  const intl = Intl as { supportedValuesOf?: (input: string) => string[] };
  const supported = intl.supportedValuesOf?.("timeZone") ?? [];
  return supported;
}

function groupByRegion(zones: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const zone of zones) {
    const region = zone.includes("/") ? zone.slice(0, zone.indexOf("/")) : "Other";
    const list = groups.get(region) ?? [];
    list.push(zone);
    groups.set(region, list);
  }
  return groups;
}

export function TimezoneField({
  value,
  onChange,
}: {
  value: string;
  onChange: (timezone: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const zones = supportedZones();
  // Intl.supportedValuesOf omits UTC — our own server-side fallback — and may
  // omit legacy aliases. Without this, opening Settings would silently reset a
  // working zone to whatever sorts first.
  const all = zones.includes(value) ? zones : [value, ...zones];
  const groups = groupByRegion(all);

  // Recomputed on render and on change; deliberately not on a timer. A
  // settings page is not open long enough for a minute of staleness to matter,
  // and a ticking value sits in a surface the screenshot rig captures.
  //
  // hourCycle: "h23" pins the hour cycle to 24-hour regardless of locale —
  // there is no other time-of-day rendering in the client, so this is the
  // precedent, and it matches the only other hour formatting in the repo
  // (worker/tz.ts). The hint's job is unambiguous verification of the
  // selected zone at a glance; 24-hour serves that and an AM/PM suffix only
  // lengthens it. Locale still governs digit shaping and separators — only
  // the hour cycle is pinned. hourCycle is used instead of hour12: false
  // because hour12 only requests 12/24-hour framing and leaves the actual
  // cycle (h11/h12/h23/h24) up to locale default/ICU version — the same
  // midnight-as-"24" quirk worker/tz.ts guards against with `% 24`.
  // hourCycle: "h23" says what is meant directly: 0-23, midnight is "0".
  const now = new Date().toLocaleTimeString(i18n.resolvedLanguage, {
    timeZone: value,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });

  return (
    <label className="settings-field">
      <span>{t("settings.timezone")}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {[...groups].map(([region, list]) => (
          <optgroup key={region} label={region}>
            {list.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <span className="muted small">{t("settings.timezoneNow", { time: now })}</span>
      {/* What it is for. The field showed a name and a clock and never said
          what setting it changed — and the answer is not "the app", which is
          the thing a reader would assume. Dates on screen come from this
          device, so they follow you when you travel; this is the day the
          server works in, which is what decides when a reminder is due,
          which week the digest covers, and what the calendar feed calls
          today. Somebody who moves and wonders why their reminders arrive at
          breakfast-in-the-wrong-country has nothing else to go on. */}
      <span className="muted small">{t("settings.timezoneHint")}</span>
    </label>
  );
}
