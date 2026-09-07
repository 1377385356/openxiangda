# Operation Time Guards

Status: accepted for implementation.

Meeting acceptance found that new create input has no existing record on which
to assert a time window. Native Data remains the sole clock and transaction
owner. The public operation-time guard references one create/update operation's
literal datetime field, a comparison and an integer offset bounded to 366 days.
The server checks declared write access and uses its existing datetime codec.
No caller clock, duplicate input, arbitrary expression or SQL is accepted.

The server prepares all guard locks and beforeMutation before sampling one
clock_timestamp, checking dynamic predicates and entering mutations. The receipt
retains that acceptance time. Replay never reevaluates completed commands.
The existing 20-guard and 100-operation bounds apply. No identity, authorization,
environment or data ownership moves into the SDK. No V1 behavior changes.

Data API capability 1.1.0 advertises the additive guard. Applications compiled
against this capability must not activate on an older server. After activation,
server rollback requires removing use of the new guard first. Verify schema and
runtime validation parity, bounded invalid input, literal binding, deadline
equality, real lock contention and receipt replay through the deployed server.
