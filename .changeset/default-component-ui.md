---
"openxiangda": minor
"openxiangda-cli": patch
"openxiangda-skill-kit": patch
---

Remove the platform appearance feature and its public APIs, stored preference,
system listeners, menu controls, custom palette namespace and mobile color mode.
Use the component libraries' default appearance, scope runtime CSS to components,
and update application templates and AI guidance. Existing alpha applications
must remove imports of the deleted appearance APIs and use standard components.
