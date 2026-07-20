import React from "react";
import { Sidebar, NavItem } from "../components/navigation/Sidebar.jsx";
import { TopBar } from "../components/navigation/TopBar.jsx";
import { Tabs } from "../components/navigation/Tabs.jsx";
import { Popover, DropdownMenu } from "../components/navigation/Popover.jsx";
import { CommandPalette } from "../components/navigation/CommandPalette.jsx";
import { Breadcrumb } from "../components/navigation/Breadcrumb.jsx";
import { SegmentedControl } from "../components/navigation/SegmentedControl.jsx";
import { ContextMenu } from "../components/navigation/ContextMenu.jsx";
import { Button } from "../components/core/Button.jsx";
import { Badge } from "../components/core/Badge.jsx";

const NAV = [
  ["Overview", "M3 12l9-9 9 9M5 10v10h14V10"],
  ["Pipeline", "M4 6h16M4 12h10M4 18h6"],
  ["Feed", "M4 11a9 9 0 019 9M4 4a16 16 0 0116 16M5 19h.01"],
  ["Calendar", "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4"],
];

export default { title: "Navigation", tags: ["autodocs"] };

export const Shell = {
  name: "Sidebar + TopBar",
  render: () => (
    <div style={{ display: "flex", height: 360, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
      <Sidebar logoSrc="../assets/logo.svg" footer="8 active · 2 at zenith">
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>{NAV.map(([l, d]) => <NavItem key={l} label={l} icon={d} active={l === "Pipeline"} />)}</nav>
      </Sidebar>
      <div style={{ flex: 1 }}>
        <TopBar title="Pipeline" actions={<Button variant="primary">+ Add application</Button>}><Badge variant="accent">31 active</Badge></TopBar>
        <div style={{ padding: 20, color: "var(--muted)" }}>Screen content</div>
      </div>
    </div>
  ),
};

export const TabsStory = {
  name: "Tabs",
  render: () => {
    const [tab, setTab] = React.useState("general");
    return <Tabs active={tab} onChange={setTab} items={[{ key: "general", label: "General" }, { key: "sources", label: "Feed sources", count: 6 }, { key: "security", label: "Security" }]} />;
  },
};

export const Segmented = {
  render: () => {
    const [v, setV] = React.useState("board");
    return <SegmentedControl value={v} onChange={setV} options={[{ value: "board", label: "Board" }, { value: "list", label: "List" }, { value: "cal", label: "Calendar" }]} />;
  },
};

export const Menus = {
  name: "Popover & DropdownMenu",
  render: () => (
    <div style={{ display: "flex", gap: 16 }}>
      <DropdownMenu trigger={<Button>⋯ Actions</Button>} items={[{ label: "Move stage" }, { label: "Add note" }, { divider: true }, { label: "Withdraw", tone: "danger" }]} />
      <Popover trigger={<Button>Filters</Button>} width={220}>
        <div style={{ padding: "0.4rem 0.5rem", fontSize: 12, color: "var(--muted)" }}>Filter panel — any custom markup here.</div>
      </Popover>
    </div>
  ),
};

export const RightClick = {
  name: "ContextMenu",
  render: () => (
    <ContextMenu items={[{ label: "Move stage" }, { label: "Add note" }, { divider: true }, { label: "Withdraw", tone: "danger" }]}>
      <div style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", width: 240 }}>
        <strong>Senior Frontend Engineer</strong>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>Northwind · right-click me</div>
      </div>
    </ContextMenu>
  ),
};

export const Crumbs = {
  name: "Breadcrumb",
  render: () => <Breadcrumb items={[{ label: "Pipeline", href: "#" }, { label: "Northwind", href: "#" }, { label: "Senior Frontend Engineer" }]} />,
};

export const Palette = {
  name: "CommandPalette",
  render: () => {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <Button variant="primary" onClick={() => setOpen(true)}>Open ⌘K palette</Button>
        <CommandPalette open={open} onClose={() => setOpen(false)} groups={[
          { label: "Actions", items: [{ label: "Add application" }, { label: "Open settings" }] },
          { label: "Jobs", items: [{ label: "Senior Frontend Engineer", hint: "Northwind" }, { label: "Staff Engineer", hint: "Aperture" }] },
        ]} />
      </>
    );
  },
};
