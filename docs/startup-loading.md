# Entrance loading

The loading screen waits for the exterior world, player and player animations, plus the Frequenc model and the four shared NPC animation clips. Frequenc is constructed, posed and registered for interaction before initial scene/highlight preparation and before scrolling is enabled.

The house and animated book start loading at the beginning of `World.init()`. Their background promise is deliberately outside the startup gate, uses a separate loading manager, and handles its own errors. A slow or unavailable house cannot keep the loading screen open. Entering the house shares any in-flight preload; a failed preload can be retried on entry. Collider creation explicitly waits for shared physics initialization, since cached interior assets may finish first. The preloaded house stays hidden and detached until entry.

The other six characters load after the initial overlay fades, with at most two model requests at a time. They reuse the startup animation clips and Frequenc instance. Failed background loads keep Frequenc available and can retry without duplicating characters. Interaction registration skips characters already registered during startup.

`tests/startup-loading.test.mjs` exercises delayed character/animation dependencies, optional NPC failure and retry, startup completion while house loading is still pending, house failure isolation, and cached-house/physics ordering.
