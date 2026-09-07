# Source hosting capability schema

ZJU returns sourceHosting: { provider: 'forgejo', enabled: boolean } from the
platform capability endpoint. PlatformCapabilities already declares this field,
but its closed JSON schema omits it. Actual AJV validation rejects the entire
response with additionalProperty=sourceHosting before deployment starts.

Owner is the existing contracts package. Add the optional object with exactly
provider and enabled; accept the existing platform response and older responses
without it. Do not allow unknown properties, credentials, arbitrary providers,
or infer source hosting is required for CRUD. No runtime authorization, state,
deployment or compiler-version changes. This additive schema repair affects V2
discovery only; V1 stays unchanged. Rollback is package-only but reintroduces
the observed rejection. Verify enabled/disabled/absent acceptance and malformed
provider, type, extra-field rejection through the real deployment preflight
validator, then validate the ZJU response with built candidate bytes.
