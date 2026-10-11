# Shared Save installation parity

Evidence: the owned workflow lab failed whole-configuration validation on an approval's allowedOperations, although the released node policy accepts save_form. The native compiler operation allowlist had omitted this existing command. The shared compiler is the application installation owner.

Decision: recognise save_form in the canonical operation allowlist without changing permissions, task-page requirements or completion semantics. Unknown operations remain rejected. This is V2-only and does not change data or trigger workflow advancement. No schema or production deployment is required; source rollback prevents installation of declarations that explicitly configure Save.

Verification: exercise both emitted ESM/CJS whole-install validation with configured Save and an invented operation, then run the owned lab's normal check.
