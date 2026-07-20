import React from "react";
import { Alert } from "../components/feedback/Alert.jsx";
import { Toast } from "../components/feedback/Toast.jsx";
import { Modal } from "../components/feedback/Modal.jsx";
import { EmptyState } from "../components/feedback/EmptyState.jsx";
import { Tooltip } from "../components/feedback/Tooltip.jsx";
import { Spinner, Skeleton } from "../components/feedback/Spinner.jsx";
import { SplashScreen } from "../components/feedback/SplashScreen.jsx";
import { Button } from "../components/core/Button.jsx";
import { Avatar } from "../components/core/Avatar.jsx";
import { EmptyPeopleIcon, EmptyFeedIcon } from "../assets/icons.tsx";

const Stack = ({ children, w = 380 }) => <div style={{ maxWidth: w, display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>;
const Row = ({ children }) => <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>{children}</div>;

export default { title: "Feedback", tags: ["autodocs"] };

export const Alerts = {
  render: () => (
    <Stack>
      <Alert kind="info" title="Complete your profile">Add three skills so the feed can rank roles.</Alert>
      <Alert kind="success" title="CV synced">Your latest CV is attached to new applications.</Alert>
      <Alert kind="warning" title="3 applications have gone quiet" onDismiss={() => {}}>No reply in over 10 days.</Alert>
      <Alert kind="danger" title="Couldn't sync" action={<Button size="sm">Retry</Button>}>Calendar connection expired.</Alert>
    </Stack>
  ),
};

export const Toasts = {
  render: () => (
    <Stack>
      <Toast kind="success" title="Application added" message="Senior Designer at Aperture is now in Applied." onDismiss={() => {}} />
      <Toast kind="warning" title="Gone quiet" message="No reply from Northwind in 12 days." />
      <Toast kind="danger" title="Couldn't sync" message="Reconnect in Settings." onDismiss={() => {}} />
    </Stack>
  ),
};

export const ModalStory = {
  name: "Modal",
  render: () => {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <Button variant="primary" onClick={() => setOpen(true)}>Open dialog</Button>
        <Modal open={open} title="Withdraw application?" onClose={() => setOpen(false)}
          footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="danger" onClick={() => setOpen(false)}>Withdraw</Button></>}>
          This moves <strong>Product Designer · Aperture</strong> to Grounded. You can restore it later.
        </Modal>
      </>
    );
  },
};

export const Empty = {
  render: () => (
    <Row>
      <EmptyState icon={<EmptyPeopleIcon />} title="No contacts yet" description="Add people you've met in a process." action={<Button variant="primary">Add contact</Button>} />
      <EmptyState icon={<EmptyFeedIcon />} title="Your feed is quiet" description="Connect a job board and new roles land here." action={<Button>Connect a source</Button>} />
    </Row>
  ),
};

export const Tooltips = {
  render: () => (
    <Row>
      <Tooltip label="Add to pipeline"><Button variant="primary">＋</Button></Tooltip>
      <Tooltip label="Ronald Lokers" position="bottom"><Avatar name="Ronald Lokers" /></Tooltip>
      <Tooltip label="Keyboard: ⌘K"><Button>Command</Button></Tooltip>
    </Row>
  ),
};

export const Loading = {
  render: () => (
    <Row>
      <Spinner size={16} /><Spinner size={24} /><Spinner size={32} thickness={3} />
      <div style={{ width: 240, display: "flex", gap: 12 }}>
        <Skeleton circle height={40} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
          <Skeleton width="70%" height={12} /><Skeleton width="45%" height={10} />
        </div>
      </div>
    </Row>
  ),
};

export const Splash = {
  render: () => (
    <div style={{ position: "relative", width: 320, height: 520, borderRadius: 24, overflow: "hidden", border: "1px solid var(--border)" }}>
      <SplashScreen brand="Zenith" tagline="Reach your zenith." />
    </div>
  ),
};
