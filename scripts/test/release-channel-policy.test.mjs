import assert from "node:assert/strict";
import test from "node:test";
import {
  releaseChannelPolicy,
  releaseDistTagsMatch,
  releaseDistTagsAreRecoverable,
} from "../lib/release-channel-policy.mjs";

test("release tags converge only when latest and the prerelease channel agree", () => {
  const policy = {
    latest: "2.0.0-alpha.15",
    prerelease: { tag: "alpha", version: "2.0.0-alpha.15" },
  };
  assert.equal(
    releaseDistTagsMatch({
      policy,
      actualTags: { latest: "2.0.0-alpha.15", alpha: "2.0.0-alpha.14" },
    }),
    false
  );
  assert.equal(
    releaseDistTagsMatch({
      policy,
      actualTags: { latest: "2.0.0-alpha.15", alpha: "2.0.0-alpha.15" },
    }),
    true
  );
});

test("a stable release requires both latest and v2", () => {
  const policy = releaseChannelPolicy({ candidateVersion: '2.0.0', priorTags: {}, prereleaseTag: null });
  assert.equal(releaseDistTagsMatch({ policy, actualTags: { latest: '2.0.0' } }), false);
  assert.equal(
    releaseDistTagsMatch({
      policy,
      actualTags: { latest: "2.0.0", v2: '2.0.0', alpha: "2.0.0-alpha.15" },
    }),
    true
  );
});

test("a first prerelease owns both latest and its named channel", () => {
  assert.deepEqual(
    releaseChannelPolicy({
      candidateVersion: "2.0.0-alpha.14",
      prereleaseTag: "alpha",
      priorTags: {},
    }),
    {
      latest: "2.0.0-alpha.14",
      prerelease: { tag: "alpha", version: "2.0.0-alpha.14" },
    }
  );
});

test("a continuing prerelease advances latest and its named channel", () => {
  assert.equal(
    releaseChannelPolicy({
      candidateVersion: "2.0.0-alpha.14",
      prereleaseTag: "alpha",
      priorTags: { latest: "2.0.0-alpha.13" },
    }).latest,
    "2.0.0-alpha.14"
  );
});

test("a prerelease never replaces a stable or different prerelease latest", () => {
  for (const latest of ["1.9.0", "2.0.0-beta.2"]) {
    assert.equal(
      releaseChannelPolicy({
        candidateVersion: "2.0.0-alpha.14",
        prereleaseTag: "alpha",
        priorTags: { latest },
      }).latest,
      latest
    );
  }
});

test("a stable release owns latest and no prerelease channel", () => {
  assert.deepEqual(
    releaseChannelPolicy({
      candidateVersion: "2.0.0",
      prereleaseTag: null,
      priorTags: { latest: "1.9.0" },
    }),
    { latest: "2.0.0", prerelease: null, stable: { tag: 'v2', version: '2.0.0' } }
  );
});

test('stable publication recovery permits v2 only and preserves the v1 maintenance channel', () => {
  const input = { candidateVersion: '2.0.0', prereleaseTag: null, priorTags: { latest: '1.0.268', v1: '1.0.268' }, candidatePublished: true };
  assert.equal(releaseDistTagsAreRecoverable({ ...input, actualTags: { latest: '2.0.0', v2: '2.0.0', v1: '1.0.268' } }), true);
  assert.equal(releaseDistTagsAreRecoverable({ ...input, actualTags: { latest: '2.0.0', v2: '2.0.0', v1: '2.0.0' } }), false);
  assert.equal(releaseDistTagsAreRecoverable({ ...input, candidatePublished: false, actualTags: { latest: '1.0.268', v1: '1.0.268', v2: '2.0.0' } }), false);
});

test("a mismatched prerelease channel fails closed", () => {
  assert.throws(
    () =>
      releaseChannelPolicy({
        candidateVersion: "2.0.0-beta.1",
        prereleaseTag: "alpha",
        priorTags: {},
      }),
    /does not belong/
  );
});

test("dist tags must stay unchanged before the package write starts", () => {
  assert.equal(
    releaseDistTagsAreRecoverable({
      candidateVersion: "2.0.0-alpha.14",
      prereleaseTag: "alpha",
      priorTags: { latest: "2.0.0-alpha.13", alpha: "2.0.0-alpha.13" },
      actualTags: { latest: "2.0.0", alpha: "2.0.0-alpha.13" },
      candidatePublished: false,
    }),
    false
  );
});

test("a partial publish accepts only candidate tag mutations", () => {
  const input = {
    candidateVersion: "2.0.0-alpha.14",
    prereleaseTag: "alpha",
    priorTags: { latest: "2.0.0-alpha.13", alpha: "2.0.0-alpha.13" },
    candidatePublished: true,
  };
  assert.equal(
    releaseDistTagsAreRecoverable({
      ...input,
      actualTags: { latest: "2.0.0-alpha.14", alpha: "2.0.0-alpha.13" },
    }),
    true
  );
  assert.equal(
    releaseDistTagsAreRecoverable({
      ...input,
      actualTags: { latest: "2.0.0", alpha: "2.0.0-alpha.13" },
    }),
    false
  );
  assert.equal(
    releaseDistTagsAreRecoverable({
      ...input,
      actualTags: {
        latest: "2.0.0-alpha.14",
        alpha: "2.0.0-alpha.13",
        beta: "2.0.0-beta.1",
      },
    }),
    false
  );
});
