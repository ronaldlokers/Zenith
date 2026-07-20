**StatusBadge** — the pipeline-stage pill. The only component allowed to use the accessibility-locked `--st-*` stage colors. Use for application status; never for generic decoration.

```jsx
<StatusBadge status="interview" />
<StatusBadge status="offer" />
<StatusBadge status="ghosted" dot={false} />
```

Stages: interested, applied, screening, interview, offer, rejected, withdrawn, ghosted. Auto-labels unless you pass children.
