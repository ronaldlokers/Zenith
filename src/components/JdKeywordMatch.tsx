import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api";
import type { Skill, WorkExperience } from "../types";
import { Chip } from "./Chip";
import "./JdKeywordMatch.css";

// Extracted verbatim from detail.tsx (the application detail's JD paste +
// skill-keyword-match panel) as part of the #285 App.tsx/detail.tsx split —
// self-contained except .keyword-chips, shared with cv.tsx/feed.tsx (and
// the ApplicationDetailModal tag editor) and kept as-is; the chip itself
// already lives in the owned Chip component (src/components/Chip.css).
// JdKeywordMatch.css reproduces the App.css .jd-match-input/.jd-match-result
// recipe under the .zui-jd-match-* names this component emits.
export interface JdKeywordMatchProps {
  onError: (message: string | null) => void;
  initialText?: string;
}

export function JdKeywordMatch({ onError, initialText }: JdKeywordMatchProps) {
  const { t } = useTranslation();
  const [jdText, setJdText] = useState(initialText ?? "");
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [cvSkillNames, setCvSkillNames] = useState<Set<string> | null>(null);

  const load = () => {
    if (skills) return;
    Promise.all([
      api.list<Skill>("skills"),
      api.list<WorkExperience>("work-experience"),
    ])
      .then(([allSkills, workExp]) => {
        setSkills(allSkills);
        setCvSkillNames(
          new Set(
            workExp.flatMap((w) => w.skills.map((s) => s.name.toLowerCase())),
          ),
        );
      })
      .catch((e) => onError((e as Error).message));
  };

  useEffect(() => {
    if (initialText) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const jdLower = jdText.toLowerCase();
  const mentioned =
    jdText.trim() && skills
      ? skills.filter((s) => {
          const escaped = s.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(`\\b${escaped}\\b`, "i").test(jdLower);
        })
      : [];
  const matched = mentioned.filter((s) =>
    cvSkillNames?.has(s.name.toLowerCase()),
  );

  return (
    <div className="zui-jd-match">
      <textarea
        className="zui-jd-match-input"
        placeholder={t("detail.pasteJdPlaceholder")}
        value={jdText}
        onFocus={load}
        onChange={(e) => setJdText(e.target.value)}
        rows={4}
      />
      {jdText.trim() && skills && (
        <div className="zui-jd-match-result">
          <strong>
            {t("detail.keywordMatchCount", {
              matched: matched.length,
              total: mentioned.length,
            })}
          </strong>
          <div className="keyword-chips">
            {mentioned.map((s) => (
              <Chip key={s.id} matched={matched.includes(s)}>
                {s.name}
              </Chip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
