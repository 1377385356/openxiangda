# Devkit integration test process isolation

The full affected gate ran `devkit-core.test.ts` and `connected-runtime.test.ts`
concurrently. Both launch connected development using the default Nest port;
the actual-Nest test read a sibling fixture's JSON response before its Nest had
started. Its exact isolated six-test run passed. This is reproducible suite
interference, not an audit-policy acceptance result.

The test runner owns process scheduling. Serialize test files in this package
because these integration fixtures share local ports and process signals. Keep
every assertion, real Nest startup and normal runtime code unchanged. No platform
state, data, credentials or public API changes. Parallelizing independent package
gates remains allowed. This is independently reversible when fixtures gain an
exclusive port/process contract; do not remove the ready identity assertion.

Verify the full package and affected gates with both fixtures enabled. Runtime
port allocation's release-before-bind window and HTTP-only readiness remain a
separate concurrency finding to investigate with two actual developer sessions;
test scheduling is not a claimed fix for that runtime concern.
