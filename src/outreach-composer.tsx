import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "./api";
import type { Contact, OutreachTemplate, Profile } from "./types";
import { Button, FieldLabel } from "./components";
import {
  fillTemplate,
  firstName,
  STARTER_TEMPLATES,
  TEMPLATE_VARS,
} from "./outreach-templates";

// Compose an outreach message from a reusable template (#472), with the
// contact's details, their company, and the user's own name substituted in.
// Lives in the contact detail; templates are per-user and editable.
export function OutreachComposer({
  contact,
  onError,
  onChanged,
  notify,
}: {
  contact: Contact;
  onError: (message: string | null) => void;
  onChanged: () => Promise<void> | void;
  notify: (message: string, undo?: () => void) => void;
}) {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<OutreachTemplate[] | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [selectedId, setSelectedId] = useState<number | "">("");
  const [managing, setManaging] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formBody, setFormBody] = useState("");
  const [busy, setBusy] = useState(false);

  const loadTemplates = () =>
    api
      .list<OutreachTemplate>("outreach-templates")
      .then(setTemplates)
      .catch((e) => onError((e as Error).message));

  useEffect(() => {
    loadTemplates();
    api.profile().then(setProfile).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vars = {
    first_name: firstName(contact.name),
    name: contact.name,
    company: contact.company_name,
    role: contact.role,
    my_name: profile?.name,
  };

  const selected = templates?.find((tpl) => tpl.id === selectedId) ?? null;
  const filled = selected ? fillTemplate(selected.body, vars) : "";

  const addStarters = () => {
    setBusy(true);
    Promise.all(
      STARTER_TEMPLATES.map((s, i) =>
        api.create<OutreachTemplate>("outreach-templates", {
          name: t(s.nameKey),
          body: t(s.bodyKey),
          sort_order: i,
        }),
      ),
    )
      .then(loadTemplates)
      .catch((e) => onError((e as Error).message))
      .finally(() => setBusy(false));
  };

  const copy = () => {
    navigator.clipboard
      .writeText(filled)
      .then(() => notify(t("templates.copied")))
      .catch(() => onError(t("templates.copyFailed")));
  };

  const markContacted = () => {
    const today = new Date().toISOString().slice(0, 10);
    Promise.resolve(
      api.update("contacts", contact.id, {
        ...contact,
        last_contacted_at: today,
        outreach_status:
          contact.outreach_status === "not_contacted"
            ? "awaiting_reply"
            : contact.outreach_status,
      }),
    )
      .then(() => onChanged())
      .then(() => notify(t("templates.markedContacted")))
      .catch((e) => onError((e as Error).message));
  };

  const startNew = () => {
    setEditId(null);
    setFormName("");
    setFormBody("");
    setManaging(true);
  };
  const startEdit = (tpl: OutreachTemplate) => {
    setEditId(tpl.id);
    setFormName(tpl.name);
    setFormBody(tpl.body);
    setManaging(true);
  };
  const saveForm = () => {
    if (!formName.trim() || !formBody.trim()) return;
    setBusy(true);
    const payload = { name: formName.trim(), body: formBody.trim() };
    const req =
      editId != null
        ? api.update<OutreachTemplate>("outreach-templates", editId, payload)
        : api.create<OutreachTemplate>("outreach-templates", payload);
    Promise.resolve(req)
      .then(() => {
        setEditId(null);
        setFormName("");
        setFormBody("");
        return loadTemplates();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setBusy(false));
  };
  const removeTemplate = (tpl: OutreachTemplate) => {
    setBusy(true);
    Promise.resolve(api.remove("outreach-templates", tpl.id))
      .then(() => {
        if (selectedId === tpl.id) setSelectedId("");
        return loadTemplates();
      })
      .catch((e) => onError((e as Error).message))
      .finally(() => setBusy(false));
  };

  if (!templates) return null;

  return (
    <div className="outreach-composer">
      <div className="outreach-composer-head">
        <FieldLabel>{t("templates.compose")}</FieldLabel>
        <Button variant="link" onClick={() => (managing ? setManaging(false) : startNew())}>
          {managing ? t("templates.done") : t("templates.manage")}
        </Button>
      </div>

      {templates.length === 0 && !managing ? (
        <div className="outreach-empty">
          <p className="muted small">{t("templates.empty")}</p>
          <Button variant="secondary" disabled={busy} onClick={addStarters}>
            {t("templates.addStarters")}
          </Button>
        </div>
      ) : !managing ? (
        <>
          <select
            className="outreach-select"
            value={selectedId}
            onChange={(e) =>
              setSelectedId(e.target.value ? Number(e.target.value) : "")
            }
          >
            <option value="">{t("templates.choose")}</option>
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
              </option>
            ))}
          </select>
          {selected && (
            <>
              <textarea
                className="outreach-filled"
                readOnly
                value={filled}
                rows={7}
                aria-label={t("templates.preview")}
              />
              <div className="outreach-actions">
                <Button variant="primary" onClick={copy}>
                  {t("templates.copy")}
                </Button>
                <Button variant="secondary" onClick={markContacted}>
                  {t("templates.markContacted")}
                </Button>
              </div>
            </>
          )}
        </>
      ) : (
        <div className="outreach-manage">
          <ul className="outreach-manage-list">
            {templates.map((tpl) => (
              <li key={tpl.id}>
                <span className="outreach-manage-name">{tpl.name}</span>
                <span className="outreach-manage-actions">
                  <button onClick={() => startEdit(tpl)}>
                    {t("common.edit")}
                  </button>
                  <button className="danger" onClick={() => removeTemplate(tpl)}>
                    {t("common.delete")}
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <div className="outreach-form">
            <input
              placeholder={t("templates.namePlaceholder")}
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
            <textarea
              placeholder={t("templates.bodyPlaceholder")}
              value={formBody}
              onChange={(e) => setFormBody(e.target.value)}
              rows={6}
            />
            <p className="outreach-vars muted small">
              {t("templates.varsHint")}{" "}
              {TEMPLATE_VARS.map((v) => `{{${v}}}`).join(" · ")}
            </p>
            <div className="outreach-actions">
              <Button
                variant="primary"
                disabled={busy || !formName.trim() || !formBody.trim()}
                onClick={saveForm}
              >
                {editId != null ? t("common.save") : t("templates.add")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
