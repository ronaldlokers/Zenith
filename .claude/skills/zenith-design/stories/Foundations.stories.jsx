import React from "react";

export default { title: "Foundations", tags: ["autodocs"] };

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 28 }}>
    <h3 style={{ fontFamily: "var(--mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--faint)", margin: "0 0 12px" }}>{title}</h3>
    {children}
  </div>
);
const Swatch = ({ token, label }) => (
  <div style={{ width: 120 }}>
    <div style={{ height: 56, borderRadius: 10, border: "1px solid var(--border)", background: `var(${token})` }} />
    <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600 }}>{label}</div>
    <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--muted)" }}>{token}</div>
  </div>
);
const Grid = ({ children }) => <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{children}</div>;

export const Colors = {
  render: () => (
    <div>
      <Section title="Brand & accent">
        <Grid>
          <Swatch token="--night" label="Night" />
          <Swatch token="--accent" label="Gold accent" />
          <Swatch token="--accent-soft" label="Gold soft" />
        </Grid>
      </Section>
      <Section title="Surfaces & ink">
        <Grid>
          <Swatch token="--bg" label="Canvas" />
          <Swatch token="--surface" label="Surface" />
          <Swatch token="--surface-sunken" label="Sunken" />
          <Swatch token="--border" label="Border" />
          <Swatch token="--ink" label="Ink" />
          <Swatch token="--muted" label="Muted" />
        </Grid>
      </Section>
      <Section title="Semantic">
        <Grid>
          <Swatch token="--success" label="Success" />
          <Swatch token="--warning" label="Warning" />
          <Swatch token="--danger" label="Danger" />
          <Swatch token="--info" label="Info" />
        </Grid>
      </Section>
      <Section title="The Ascent — pipeline stages (reserved)">
        <Grid>
          <Swatch token="--st-interested" label="Interested" />
          <Swatch token="--st-applied" label="Applied" />
          <Swatch token="--st-screening" label="Screening" />
          <Swatch token="--st-interview" label="Interview" />
          <Swatch token="--st-offer" label="Offer" />
          <Swatch token="--st-dead" label="Grounded" />
        </Grid>
      </Section>
    </div>
  ),
};

export const Typography = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontFamily: "var(--serif)", fontSize: "var(--text-display)", fontWeight: 600 }}>Display — Geist 600</div>
      <div style={{ fontFamily: "var(--serif)", fontSize: "var(--text-heading)", fontWeight: 600 }}>Heading — section & card titles</div>
      <div style={{ fontSize: "var(--text-body)" }}>Body — the quick brown fox jumps over the lazy dog.</div>
      <div style={{ fontFamily: "var(--mono)", fontSize: "var(--text-chrome)", textTransform: "uppercase", letterSpacing: "var(--track-chrome)", color: "var(--muted)" }}>Chrome — Geist Mono, uppercase, tracked</div>
    </div>
  ),
};

export const Elevation = {
  render: () => (
    <Grid>
      {["--shadow-1", "--shadow-2"].map((s) => (
        <div key={s} style={{ width: 160, height: 90, borderRadius: 12, background: "var(--surface)", boxShadow: `var(${s})`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)" }}>{s}</div>
      ))}
    </Grid>
  ),
};
