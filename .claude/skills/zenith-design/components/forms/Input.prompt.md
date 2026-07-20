Labeled form inputs — `Input`, `Textarea`, `Select`, `Checkbox` — sharing the hairline-on-sunken field style with a gold focus ring.

```jsx
<Input label="Email" type="email" placeholder="name@company.com" />
<Textarea label="Summary" rows={3} hint="A short pitch." />
<Select label="Theme" options={["Auto", "Light", "Dark"]} />
<Checkbox label="Enable single-key shortcuts" defaultChecked />
```

All take `label`, and (except Checkbox) `hint` + native props. `Select` accepts `options` (strings or `{value,label}`) or explicit `<option>` children.
