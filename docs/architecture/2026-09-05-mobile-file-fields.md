# Mobile attachment and image interactions

## Evidence, owner and invariants

Mobile ManagedFileField uses desktop AntD buttons and AttachmentFileList's desktop
image viewer. Failed upload messages truncate, and upload callbacks can publish
a value after the editor is gone. Image preview can allocate blob URLs which are
never released when the selected image fails while another image succeeds.

The field kit owns transient upload/preview state. The existing upload renderer,
Data API and workflow file binding remain the only upload/auth/storage boundary.
The parent form owns committed DataFileRef arrays. No new file API, persistence,
permissions, theme or schema is introduced.

## Decision and failure/concurrency behavior

Extract the mobile upload control with scoped Ant Design Mobile actions, readable
file cards, count/size guidance, retry and removal. Reserve pending slots before
uploading; do not silently truncate selected files. Duplicate retries are locked.
Remove invalidates that upload's eventual result; unmount invalidates all results.
Removing a reference does not delete a stored blob. Backend cleanup policy is
unchanged. Requests already sent may finish server-side after removal.

Mobile image previews use Ant Design Mobile's viewer under the local CSS scope.
Keep desktop preview and document preview routes. Reuse existing authenticated
blob/preview reads and revoke transient URLs on replacement, failure and unmount.
Only the active preview request may update the viewer. Download failure keeps the
file and permits retry. Limits use the declared maxCount/maxSizeMb; server type,
size and authorization checks remain authoritative.

## Scope, rollback and falsifiable verification

Changes affect only the 2.0 frontend, template acceptance fixture and docs.
1.x, tenant data, production and backend schemas remain untouched. Revert this
package unit without data migration. Browser-test phone upload failure/retry,
removal during pending upload, capacity, canonical submit/reload, image preview,
download and no horizontal overflow. Run affected checks and fresh packed
independent app acceptance; controlled responses are not live acceptance.

## Pinned mobile dependency integration

Ant Design Mobile 5.42 ImageViewer renders its interactive footer within an
aria-hidden Mask. The platform adapter exposes only that viewer's owned mask as
an accessible dialog through the mounted footer ref. No host DOM is changed.
The browser journey locates the close button by accessible role. Existing host
input styles also override HTML hidden, so the encapsulated file picker explicitly
uses display:none; browser acceptance asserts it remains hidden.

The image upload branch previously selected single-file replacement by storage
type even when maxCount allowed multiple images. Both PC and mobile now derive
selection multiplicity from maxCount. This preserves the declared array contract
and stops a new image from replacing earlier images unexpectedly. The fixture
uses the standard AntD App feedback context so download errors are observable.

Using a real 640px image response (instead of a 1px placeholder) exposed an
existing editor-image overflow in the same mobile field fixture. Bound images in
the rich-text editor as in its read-only display, and give its grid a shrinkable
column. This closes the image/viewport invariant without redesigning rich text.
