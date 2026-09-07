# Platform-managed application source

Approved on 2026-09-07 for internal private installations. The problem is that
developer-owned remotes leave application source outside platform management.

The platform owns users, applications, app administrator membership and repository
binding. A shared Forgejo installation owns Git objects and collaborator permissions.
There is one private repository per application and one administrator level. Git
credentials are long-lived and installed through the operating system credential
helper, without placing secrets in a workspace or command result. Studio is retired
and is not used by the new source path. No tenant Git organization or revocation
workflow is introduced.

Release amendment approved on 2026-09-08: existing PLATFORM_ADMIN users receive
Forgejo site administrator access to all repositories, including other creators'
older and later repositories. The source resolve/clone CLI accepts explicit platform
and repository URLs before any workspace exists, uses the current platform session,
and resolves app identity from the existing backend binding. Clones do not install
dependencies, load app configuration, execute hooks/global filters, or recurse into
submodules. Unknown bindings and occupied targets fail without replacement.

The CLI consumes a repository returned by application provisioning, initializes and
pushes once, and exposes source status/setup/push for recovery and task completion.
It preserves conflicting external remotes unless import is explicit, keeps local
changes on failure, and never force-pushes. Setup only creates a commit in a repository
without any commits. Explicit push with a message commits unignored working changes.

The additive contract affects contracts/devkit/CLI and generated documentation/skills.
Sites without source hosting retain existing creation behavior. Stable V1 dispatch
and runtime are unaffected. The existing delivery mainline gate and AppPackage
source/digest metadata remain authoritative; server-managed builds are deferred.

Verification includes real Git retry/divergence tests, platform client contract
checks, credential helper persistence without plaintext fallback, and the affected
repository gates. Backend provider tests separately verify actual Forgejo API/Git
behavior. Rollback retains provider data and bindings; upgrading packages is not an
instruction to publish or deploy a platform.
