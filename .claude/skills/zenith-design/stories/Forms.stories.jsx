import React from "react";
import { Input, Textarea, Select, Checkbox, Switch, RadioGroup } from "../components/forms/Input.jsx";
import { Slider } from "../components/forms/Slider.jsx";
import { SearchField } from "../components/forms/SearchField.jsx";
import { Combobox } from "../components/forms/Combobox.jsx";
import { DatePicker } from "../components/forms/DatePicker.jsx";
import { FileUpload } from "../components/forms/FileUpload.jsx";

const Box = ({ children, w = 320 }) => <div style={{ maxWidth: w, display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>;

export default { title: "Forms", tags: ["autodocs"] };

export const TextFields = {
  render: () => (
    <Box>
      <Input label="Email" type="email" defaultValue="ronald@lokers.email" />
      <Textarea label="Summary" rows={3} hint="A short pitch for your CV." defaultValue="Design engineer focused on accessible, high-craft UI." />
      <Select label="Theme" options={["Auto (match system)", "Light", "Dark"]} />
    </Box>
  ),
};

export const Toggles = {
  render: () => {
    const [on, setOn] = React.useState(true);
    const [view, setView] = React.useState("board");
    return (
      <Box>
        <Checkbox label="Enable single-key shortcuts" defaultChecked />
        <Switch label="Weekly digest" hint="Email a Monday momentum recap." checked={on} onChange={setOn} />
        <RadioGroup label="Default view" name="view" value={view} onChange={setView} options={[{ value: "board", label: "Board" }, { value: "list", label: "List" }]} row />
      </Box>
    );
  },
};

export const Range = {
  render: () => {
    const [v, setV] = React.useState(70);
    return <Box><Slider label="Match threshold" value={v} onChange={setV} format={(n) => `${n}%`} /></Box>;
  },
};

export const Search = {
  render: () => {
    const [q, setQ] = React.useState("");
    return <Box><SearchField value={q} onChange={setQ} placeholder="Search applications…" width="100%" /></Box>;
  },
};

export const TagInput = {
  render: () => {
    const [tags, setTags] = React.useState(["React", "TypeScript"]);
    return <Box><Combobox label="Skills" value={tags} onChange={setTags} suggestions={["React", "TypeScript", "Figma", "Node", "GraphQL", "CSS", "Accessibility"]} placeholder="Add a skill…" /></Box>;
  },
};

export const DatePickerStory = {
  name: "DatePicker",
  render: () => {
    const [d, setD] = React.useState(null);
    return <Box><DatePicker label="Interview date" value={d} onChange={setD} /></Box>;
  },
};

export const Upload = {
  render: () => {
    const [files, setFiles] = React.useState([]);
    return <Box><FileUpload accept=".pdf,.docx" files={files} onFiles={setFiles} label="Drop your CV or click to browse" /></Box>;
  },
};
