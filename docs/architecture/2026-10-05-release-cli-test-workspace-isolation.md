# CLI identity release test workspace isolation

The CLI ownership test invokes the actual distribution launcher from the tool repository cwd. This checkout is inside a real application workspace, so the launcher correctly resolves the ancestor application's locked 2.55.1 engine. The test then incorrectly expects the candidate's 2.55.6 engine. This is a test-environment isolation defect, not a runtime distribution failure.

Use a fresh temporary directory outside any application workspace for this installation ownership assertion, keep the real candidate binary and strict product/engine version assertions, and clean it in finally. Existing workspace selection tests remain authoritative for dispatch inside applications. No package runtime bytes, migration or installed workspace binding changes; no verification gate is bypassed. Verify isolated test and full release gates against a new frozen source commit.
