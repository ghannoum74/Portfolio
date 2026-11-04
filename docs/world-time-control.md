# Visitor time control

The normal world UI uses a compact parchment **World time** button. Open it to choose Morning (08:00), Day (12:00), Sunset (18:00) or Night (23:00), or move the time slider. Choosing either immediately overrides the existing world lighting clock. **Use my local time** clears that override and resumes the visitor's device clock; it is the default on every visit. The collapsed button displays the active time, updated once a second during gameplay.

The selector appears only while exploring outdoors. Loading, the introduction, modal conversations, scene transitions and cottage visits hide it and dismiss its popover. It supports native keyboard controls, Escape, outside-click dismissal and focus dismissal. Keyboard events inside the selector do not trigger gameplay shortcuts. Its mobile position leaves the help, sound and fullscreen buttons accessible, with 44px preset targets and a scrolling panel for short screens.

The former public lil-gui panel and C debug shortcut are available only when explicitly opening `?perfdiag=1`. Performance diagnostics remain available for controlled measurements. The visitor selector is independent of those tools. `terminal.local` is an explicitly allowed development-preview host in Vite; production hosting is unaffected.

Validation: TypeScript and the production build pass. Focused tests cover real DayNightCycle lighting changes, preset/manual/local mode changes, input containment and dismissal, and the diagnostic shortcut guard alongside existing clock, mobile and house-guide coverage. Browser QA exercised the actual selector in a desktop page and a 667 × 375 mobile iframe, including Night selection, local-time reset, keyboard slider Home and Escape. This browser has WebGL disabled, so the full 3D game could not be rendered; the component was tested in isolation against the real clock implementation. Temporary preview files are not shipped.

The full suite retains the nine existing content/asset/LOD fingerprint failures present before this change. The new time-selector tests pass.
