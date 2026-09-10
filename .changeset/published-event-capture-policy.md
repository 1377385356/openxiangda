---
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
---

Add opt-in, versioned data-event capture policies. Subscribed mode captures only
operations selected by published subscriptions, independently of live consumer
state. The default preserves complete legacy event capture. Require the platform
events.capture-policy capability and explicitly document the reduced replay history.
