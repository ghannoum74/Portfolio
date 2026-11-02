# Mobile game controls

The touch HUD uses the portfolio's cream parchment, brown ink and Coiny lettering. Illustrated SVG medallions have depressed press states and short captions; their accessible labels retain the complete nearby action. Navigation and fullscreen use icon-only medallions. Dialogue and exhibit panels leave room above the controls. The floating directional pad remains hidden until a movement touch begins and disappears on release, cancellation, blur, scene changes or portrait rotation.

## Movement tuning

`TOUCH_STICK` in `src/input/MobileControls.ts` uses an 84 CSS-pixel input radius. Input is measured from the original touch point; clamping the visual pad near an edge never changes that origin.

| Behavior | Start | Release |
| --- | --- | --- |
| Forward/backward | 24% (20.16px) | 17% (14.28px) |
| Left/right steering | 30% (25.2px) | 20% (16.8px) |
| Run | More than 78px | 64px or less |

Walking/steering distances apply within the input radius. Running additionally requires vertical intent (`abs(y) > 0.65`), so pushing sideways alone cannot start a sprint. Separate start/release thresholds avoid repeated state changes from small finger movements near a boundary.

Touch steering is proportional: `clamp((abs(x) - 0.20) / 0.80, 0, 1) ** 1.4 * 0.65`. This gives gentle correction near the center and limits full touch rotation to 65% of the physical-key rate (2.6 versus 4 radians per second). Physical keyboard movement remains unchanged. Walking and running speeds remain 2 and 8 world units per second.

## Verification

- All 15 mobile regression tests pass, including drift/hysteresis, actual PlayerController rotation, run thresholds, second-finger actions, gesture cleanup, context changes, icon preservation and keyboard coexistence.
- TypeScript and the production build pass, including verification of all 22 required GLBs.
- Isolated browser checks use the actual MobileControls and DialogueBox components at 667 × 375 and 568 × 320, plus the portrait guard at 375 × 667. The preview simulates coarse-pointer availability for layout checks; these are not physical phone or WebGL performance tests.
- The full suite is 140/157 passing. Its 17 failing test names are unchanged from the previous PR revision and exist on clean main; see `cauldron-ending-and-guide-loading.md` for the baseline limitations.
