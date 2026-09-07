---
"openxiangda": minor
"openxiangda-cli": minor
"openxiangda-contracts": minor
"openxiangda-devkit-core": minor
---

Close the `authorizationTransitions` contract at every public boundary. JSON
Schema, source validation and bundle materialization now accept only the
canonical transition keys and reject malformed or unknown values before an
application package can be prepared or activated.
