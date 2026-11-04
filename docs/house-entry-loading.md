# Cottage entry loading

Opening the door now uses a parchment loading cover with an inline SVG cottage, a sweeping broom and dust puffs. The heading is “Tidying up the cottage…” and the cleanup jokes rotate every 2.8 seconds while work is pending. The illustration uses the existing brown, sage and parchment palette; no image files, downloads or animation libraries are added.

The cover starts before house loading and remains through texture/program preparation, furniture/workshop lighting variants and interaction highlights. Its status changes with those actual preparation stages. It is indeterminate, with no invented percentages or additional minimum wait. The existing 450 ms fades remain; reduced-motion visitors get a still illustration, no rotating-message timer and immediate fades.

Background preloading remains independent of initial world readiness. A preloaded house still receives the entry transition while rendering resources are prepared. Once ready, the cover fades out and the first-visit tour can begin. Failure restores the exterior, gives a brief retry message and clears the message timer. Plain exit fades do not show the cleanup screen. Retry and disposal also clear timers, and stale fade completion cannot hide a newer entry.

The layout stacks on regular screens and puts the illustration beside the copy on short landscape screens. Stage announcements use a polite live status; the SVG and dots are decorative.

Validation: `tests/scene-transition.test.mjs` exercises announcement/visibility, rotating copy, normal exit, reduced motion, failure/retry and timer cleanup. Door integration cases in `tests/house-guide.test.mjs` hold both the model request and rendering preparation pending, verify that the cover stays up, reject duplicate entries and preserve the tour/recovery ordering.
