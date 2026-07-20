import React from "react";
import { Icon, ICON_NAMES } from "../components/icons/Icon.jsx";
import * as Art from "../assets/icons.tsx";

export default { title: "Icons", tags: ["autodocs"] };

const Cell = ({ children, name }) => (
  <div style={{ width: 92, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 12, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", color: "var(--ink)" }}>
    {children}
    <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--faint)", textAlign: "center" }}>{name}</span>
  </div>
);
const Grid = ({ children }) => <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{children}</div>;

export const LineIcons = {
  name: "Line icon set (Icon)",
  render: () => (
    <Grid>{ICON_NAMES.map((n) => <Cell key={n} name={n}><Icon name={n} size={24} /></Cell>)}</Grid>
  ),
};

export const IconSizes = {
  render: () => (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      {[16, 22, 32, 48].map((s) => <Icon key={s} name="pipeline" size={s} />)}
    </div>
  ),
};

const EMPTIES = ["EmptyCompaniesIcon", "EmptyPeopleIcon", "EmptyCvIcon", "EmptyFeedIcon", "EmptyCalendarIcon", "EmptyActivityIcon"];

export const EmptyStateArt = {
  name: "Empty-state illustrations",
  render: () => (
    <Grid>{EMPTIES.map((n) => { const I = Art[n]; return I ? <Cell key={n} name={n.replace(/^Empty|Icon$/g, "")}><span style={{ color: "var(--muted)" }}><I /></span></Cell> : null; })}</Grid>
  ),
};
