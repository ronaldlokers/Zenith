The surface header that opens each Zenith screen — serif title, optional middle content, and a right-aligned `actions` slot. Pair with `Sidebar` for the app shell.

```jsx
<TopBar title="Pipeline" actions={<Button variant="primary" size="sm">+ Add application</Button>}>
  <Badge variant="accent">31 active</Badge>
</TopBar>
```

Props: `title` (serif), `actions` (right-aligned node), `children` (middle content). Renders a bottom hairline on `--surface`.
