The Night navigation rail (fixed 210px) used on every Zenith screen, plus its `NavItem` rows. Compose rows as children inside your own `<nav>`.

```jsx
<Sidebar logoSrc="assets/logo.svg" footer="8 active · 2 at zenith">
  <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <NavItem label="Overview" icon="M3 12l9-9 9 9M5 10v10h14V10" active />
    <NavItem label="Pipeline" icon="M4 6h16M4 12h10M4 18h6" />
  </nav>
</Sidebar>
```

`Sidebar` props: `brand`, `logoSrc`, `footer`, `children`. `NavItem` props: `label`, `icon` (SVG path string, 24×24), `active` (gold selected state). Icons stroke with currentColor.
