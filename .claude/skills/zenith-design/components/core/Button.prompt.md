**Button** — Zenith's action button; teal `primary` is the only accent CTA, everything else is neutral surface. Use for any clickable action.

```jsx
<Button variant="primary">Add application</Button>
<Button>Cancel</Button>
<Button variant="ghost" size="sm">Filter</Button>
<Button variant="danger">Delete</Button>
```

Variants: `default` (neutral surface + hairline border), `primary` (teal), `ghost` (borderless, muted), `danger` (red). Sizes `sm`/`md`/`lg`. Pass `icon` for a leading glyph. Corner is 8px (`--radius-md`).
