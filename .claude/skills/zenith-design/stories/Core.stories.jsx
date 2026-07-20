import React from "react";
import { Button } from "../components/core/Button.jsx";
import { Badge } from "../components/core/Badge.jsx";
import { StatusBadge } from "../components/core/StatusBadge.jsx";
import { Card } from "../components/core/Card.jsx";
import { Avatar, AvatarGroup } from "../components/core/Avatar.jsx";
import { StatCard } from "../components/core/StatCard.jsx";
import { StageStepper } from "../components/core/StageStepper.jsx";

const Row = ({ children }) => <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>{children}</div>;

export default { title: "Core", tags: ["autodocs"] };

export const Buttons = {
  render: () => (
    <Row>
      <Button variant="primary">Primary</Button>
      <Button>Default</Button>
      <Button variant="dark">Dark</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
      <Button disabled>Disabled</Button>
    </Row>
  ),
};

export const ButtonSizes = {
  render: () => (
    <Row>
      <Button variant="primary" size="sm">Small</Button>
      <Button variant="primary" size="md">Medium</Button>
      <Button variant="primary" size="lg">Large</Button>
    </Row>
  ),
};

export const Badges = {
  render: () => (
    <Row>
      <Badge>Default</Badge>
      <Badge variant="accent">31 active</Badge>
      <Badge variant="warn">Gone quiet</Badge>
    </Row>
  ),
};

export const StatusBadges = {
  render: () => (
    <Row>
      {["interested", "applied", "screening", "interview", "offer", "rejected"].map((s) => (
        <StatusBadge key={s} status={s} />
      ))}
    </Row>
  ),
};

export const Cards = {
  render: () => (
    <Card style={{ maxWidth: 320 }}>
      <strong style={{ fontSize: 15 }}>Senior Frontend Engineer</strong>
      <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)" }}>Northwind · applied 3 days ago</p>
    </Card>
  ),
};

export const Avatars = {
  render: () => (
    <Row>
      <Avatar name="Rae Mendez" size="sm" />
      <Avatar name="Jon Park" size="md" />
      <Avatar name="Priya Nair" size="lg" ring />
      <Avatar name="Sam Ito" size="xl" />
      <AvatarGroup people={["Rae Mendez", "Jon Park", "Priya Nair", "Sam Ito", "Lee Kwan", "Ada Bell"]} max={4} />
    </Row>
  ),
};

export const StatCards = {
  render: () => (
    <Row>
      <StatCard label="Active" value="18" delta="4" trend="up" />
      <StatCard label="Responses" value="42%" delta="6%" trend="up" />
      <StatCard label="Gone quiet" value="5" delta="2" trend="down" />
      <StatCard label="Offers" value="2" delta="1" trend="up" accent />
    </Row>
  ),
};

export const Ascent = {
  name: "StageStepper (The Ascent)",
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 520 }}>
      <StageStepper current="interview" />
      <StageStepper current="applied" dead />
    </div>
  ),
};
