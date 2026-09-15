<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<style>
:root {
  --ink: #1d1f1e;
  --paper: #f7f7f2;
  --surface: #ffffff;
  --line: #d9d9cf;
  --accent: #08783f;
  --accent-ink: #ffffff;
  --danger: #a8321f;
  --muted: #5f635f;
  font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  line-height: 1.5;
}

button {
  font: inherit;
  cursor: pointer;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--surface);
  padding: 0.55rem 1rem;
}

button[type='submit'] {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-ink);
  font-weight: 600;
}

button:disabled { opacity: 0.55; cursor: progress; }

input {
  font: inherit;
  width: 100%;
  padding: 0.55rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: inherit;
}

input:focus-visible,
button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
