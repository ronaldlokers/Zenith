A full-screen mobile splash / loading screen — Night gradient, ascent-path logo, wordmark, and a rising three-rung loader. Use on app cold-start and auth hand-off.

```jsx
<div style={{ position: "relative", width: 390, height: 844 }}>
  <SplashScreen logoSrc="assets/logo.svg" />
</div>
```

Props: `brand` (wordmark, default "Zenith"), `tagline` (line below; `""` hides it), `status` (`"loading"` | `"ready"` → `aria-busy`), `logoSrc` (falls back to the brand initial in a tile). Renders `position:absolute; inset:0`, so mount inside a positioned container.
