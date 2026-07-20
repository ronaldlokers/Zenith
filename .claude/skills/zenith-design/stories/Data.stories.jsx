import React from "react";
import { Table } from "../components/data/Table.jsx";
import { Timeline } from "../components/data/Timeline.jsx";
import { Pagination } from "../components/data/Pagination.jsx";
import { ProgressBar } from "../components/data/ProgressBar.jsx";
import { Accordion } from "../components/data/Accordion.jsx";
import { BarChart } from "../components/data/BarChart.jsx";
import { FunnelChart } from "../components/data/FunnelChart.jsx";
import { DonutChart } from "../components/data/DonutChart.jsx";
import { StatusBadge } from "../components/core/StatusBadge.jsx";

export default { title: "Data", tags: ["autodocs"] };

const ROWS = [
  { role: "Senior Frontend Engineer", company: "Northwind", stage: "interview", days: 3 },
  { role: "Staff Engineer", company: "Aperture", stage: "applied", days: 9 },
  { role: "Design Engineer", company: "Meridian", stage: "screening", days: 1 },
  { role: "UI Engineer", company: "Cirrus", stage: "offer", days: 5 },
];

export const DataTable = {
  name: "Table",
  render: () => {
    const [sort, setSort] = React.useState({ key: "days", dir: "asc" });
    const rows = [...ROWS].sort((a, b) => { const d = a[sort.key] > b[sort.key] ? 1 : -1; return sort.dir === "asc" ? d : -d; });
    const cols = [
      { key: "role", header: "Role", sortable: true, width: "42%" },
      { key: "company", header: "Company", sortable: true },
      { key: "stage", header: "Stage", render: (r) => <StatusBadge status={r.stage} /> },
      { key: "days", header: "Days", sortable: true, align: "right", render: (r) => r.days + "d" },
    ];
    return <Table columns={cols} rows={rows} sort={sort} onSort={setSort} onRowClick={() => {}} />;
  },
};

export const TimelineStory = {
  name: "Timeline",
  render: () => (
    <div style={{ maxWidth: 320 }}>
      <Timeline items={[
        { title: "Offer received", time: "Today", tone: "success", description: "Cirrus — review by Friday." },
        { title: "Final interview", time: "Mon", tone: "accent", description: "Panel with the design team." },
        { title: "Recruiter screen", time: "Last wk", tone: "info" },
        { title: "Applied", time: "2 wk ago", tone: "default" },
      ]} />
    </div>
  ),
};

export const PaginationStory = {
  name: "Pagination",
  render: () => {
    const [page, setPage] = React.useState(2);
    return <Pagination page={page} total={9} onChange={setPage} />;
  },
};

export const Progress = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 360 }}>
      <ProgressBar label="Profile completeness" value={72} showValue />
      <ProgressBar label="Weekly goal" value={5} max={8} tone="success" showValue />
      <ProgressBar label="Experience" value={40} tone="warning" showValue />
    </div>
  ),
};

export const AccordionStory = {
  name: "Accordion",
  render: () => (
    <div style={{ maxWidth: 460 }}>
      <Accordion defaultOpen="a" items={[
        { id: "a", title: "Notifications", content: "Choose which events email you and how often digests are sent." },
        { id: "b", title: "Privacy", content: "Zenith stores no telemetry. Your data stays yours." },
        { id: "c", title: "Data & export", content: "Download everything as JSON, or delete your account." },
      ]} />
    </div>
  ),
};

export const Bars = {
  name: "BarChart",
  render: () => (
    <div style={{ maxWidth: 420 }}>
      <BarChart height={160} data={[{ label: "W1", value: 4 }, { label: "W2", value: 7 }, { label: "W3", value: 5 }, { label: "W4", value: 9 }, { label: "W5", value: 6 }, { label: "W6", value: 11 }]} />
    </div>
  ),
};

export const Funnel = {
  name: "FunnelChart",
  render: () => (
    <div style={{ maxWidth: 460 }}>
      <FunnelChart data={[{ label: "Applied", value: 31 }, { label: "Screening", value: 18 }, { label: "Interview", value: 9 }, { label: "Offer", value: 3 }]} />
    </div>
  ),
};

export const Donut = {
  name: "DonutChart",
  render: () => (
    <DonutChart centerLabel="Applications" data={[{ label: "Referral", value: 8 }, { label: "Job board", value: 12 }, { label: "Recruiter", value: 6 }, { label: "Direct", value: 5 }]} />
  ),
};
