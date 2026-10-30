# Mobile world controls

Touch devices get the same exterior and house world with a touch HUD. Desktop
keyboard/mouse controls remain available. No model replacement is needed for
the mobile or simplified alchemy interactions.

## Movement and actions

- Touch the lower-left area to reveal a floating directional pad. Drag up/down
  to walk forward/back, sideways to turn, and farther to run. Release and the
  pad disappears immediately. It is invisible while idle.
- Drag on the right side to look around. The movement and camera pointers are
  tracked separately, so lifting one finger cannot end the other's gesture.
- Tap Jump while moving, or the nearby object's action button to interact.
- Focused views have touch Previous/Next, Details and Back controls. The book
  includes Open website. NPC conversations have Continue and Back. Resting on
  chairs or the bed has Back; the cauldron/bookshelf panels have their own Close.
- Tours keep their existing touch Next/Skip buttons. Movement is unavailable
  during tours, scene transitions, focused cameras and modal panels.
- The entrance has a touch Enter world button. Help includes a touch manual;
  buttons respect safe areas and have at least 44 px touch targets. Inspectors
  scroll on short landscape screens. The default mobile DPR is capped at 1.5,
  including after orientation changes; explicit DPR overrides are preserved.

Input is cleared on release, pointer cancellation, lost capture, blur, hidden
pages, rotation and mode changes. Keyboard and touch state are separate sources
of the same movement flags; releasing one cannot cancel a held input from the
other. Touch button activation suppresses its compatibility click to avoid
advancing conversations or triggering actions twice.

## Landscape

Enter world and the fullscreen button request fullscreen and then
`screen.orientation.lock('landscape')` when available. Browsers differ in their
support and fullscreen requirements; see [MDN's orientation-lock documentation](https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock).
Neither API is treated as guaranteed.

While the world/rules are active in a portrait touch viewport, a native modal
asks the visitor to rotate their phone. Player input, camera tours and world
simulation pause. Landscape closes that prompt and resumes the previous state;
it cannot accidentally enable movement behind another open panel. A rejected
or missing orientation API keeps this manual-rotation route available. Desktop
portrait windows remain usable.

## Cauldron

The cauldron is the only alchemy proximity interaction. Potion bottles and the
recipe cabinet remain visible as decoration. Old recipe markers are ignored.
Its 2.5 m reach is measured from the pot bounds instead of its center, making
all sides easier to approach. E or the touch action opens it and starts the
first potion immediately. Changing potion starts that color automatically;
Close stops the effect and restores exploring.

## Verification

Typecheck and production build pass. Ten mobile interaction checks cover
pointer ownership/cancellation, movement plus touch actions, portrait pause and
recovery, rejected and missing orientation APIs, desktop behavior, mixed input,
and routing through the actual Game command handler. The renderer resize check
verifies mobile resolution and explicit overrides. Alchemy checks verify the
single registered target, all-side proximity, automatic brewing and teardown.

The complete suite has 192 passing checks and three pre-existing asset failures
(house compression, stone LOD source hash and reviewed culling hash). These
checks use a DOM harness; they do not establish real-phone FPS, browser chrome
layout or hardware orientation behavior. Physical-device smoke testing remains
pending. No deployment is included.
