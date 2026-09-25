// scripts/lib/promoted-set.mjs — the registry set scripts/promote-set.mjs appends for a green
// candidate, kept apart from the script so its rules are tested without a scaffold or a build.
//
// The Firebase iOS pairing (KD-243) travels with the candidate: `create-cmp add firebase` refuses an
// iOS app whose set does not pair its own `firebase-gitlive`, so a set promoted without one would be
// refused for every iOS app until someone hand-recorded it. The pairing is carried only when it pairs
// the candidate's own GitLive version and cites GitLive's catalog at that tag; it is never copied
// across from another GitLive version. Anything else refuses the promotion, before the build.

import { firebaseIosPodFor, AddFirebaseRefusal } from "../../src/lib/add-firebase.mjs";

/** GitLive's own version catalog at the tag of `gitlive` — where `firebase-cocoapods` is read. */
export const gitliveCatalogUrl = (gitlive) =>
  `https://github.com/GitLiveApp/firebase-kotlin-sdk/blob/v${gitlive}/gradle/libs.versions.toml`;

/** Why `candidate`'s Firebase iOS pairing cannot be promoted, or null when it can. */
export function firebaseIosPairingProblem(candidate) {
  const gitlive = candidate.versions?.["firebase-gitlive"];
  if (!gitlive) return `candidate ${candidate.id} pins no firebase-gitlive, so it has no Firebase iOS pairing to promote.`;
  const pair = candidate.firebaseIos;
  const url = gitliveCatalogUrl(gitlive);
  let addAccepts = true; // the set must be one `add firebase` accepts for an iOS app
  try { firebaseIosPodFor(candidate); } catch (e) { if (!(e instanceof AddFirebaseRefusal)) throw e; addAccepts = false; }
  const whole = /^\d+\.\d+\.\d+$/.test(pair?.version ?? "");
  const cited = typeof pair?.source === "string" && pair.source.includes(url);
  if (addAccepts && whole && cited) return null;
  const has = !pair
    ? "records no firebaseIos"
    : `records firebaseIos ${JSON.stringify({ gitlive: pair.gitlive, version: pair.version })}` +
      (pair.gitlive !== gitlive ? ` for another GitLive version` : whole ? ` with a source that does not cite ${url}` : ` with no whole x.y.z version`);
  return (
    `candidate ${candidate.id} pins firebase-gitlive ${gitlive} and ${has}, so the promoted set would ` +
    `leave \`create-cmp add firebase\` refusing every iOS app on it.\n` +
    `  Record on the candidate in src/versions/candidates.json:\n` +
    `    "firebaseIos": { "gitlive": "${gitlive}", "version": "<firebase-cocoapods>", "source": "${url} — firebase-cocoapods" }\n` +
    `  where <firebase-cocoapods> is that key's whole x.y.z in GitLive's gradle/libs.versions.toml at tag v${gitlive}. ` +
    `A pairing recorded for another GitLive version is never carried across.`
  );
}

/** The proven-green registry set for `candidate`; throws when its Firebase iOS pairing is not promotable. */
export function promotedSet(candidate, note) {
  const problem = firebaseIosPairingProblem(candidate);
  if (problem) throw new Error(problem);
  return {
    id: candidate.id,
    label: candidate.label,
    status: "proven-green",
    versions: candidate.versions,
    firebaseIos: structuredClone(candidate.firebaseIos),
    ...(candidate.androidSdk ? { androidSdk: candidate.androidSdk } : {}),
    ...(candidate.gradleProperties ? { gradleProperties: candidate.gradleProperties } : {}),
    ...(candidate.gradleWrapper ? { gradleWrapper: candidate.gradleWrapper } : {}),
    notes: [...(candidate.notes || []), note],
  };
}
