# Native attachment preview v2

Status: Accepted by the product owner for immediate implementation on 2026-08-21

Scope: Native managed-file contracts and the generated React application attachment surface

## Problem evidence

The current attachment field maps both Preview and Download to the same Native
file content URL. The platform deliberately responds to that URL with
`Content-Disposition: attachment`, so clicking Preview downloads even an image.
The generated application has no DOCX or XLSX renderer and therefore exposes an
upload/download control rather than a complete attachment experience.

OpenXiangda 1.x already proves the useful interaction and rendering behavior:
image galleries, separate preview/download actions, DOCX HTML rendering, XLSX
sheet rendering, PDF viewing, and an explicit unsupported-format fallback. Its
FormContext, RoleSession transport, storage adapters, and global file-ticket
API are not 2.0 boundaries and must not be copied.

The product owner confirmed the final presentation split:

- supported images open in an in-page lightbox;
- PDF, DOCX, and XLSX open a focused full-window application preview route;
- download remains a separate explicit action;
- legacy DOC/XLS/PPT formats remain download-only until a later OnlyOffice
  decision.

## Decision and owners

- Native Data API remains the only owner of managed-file identity, storage,
  application/environment binding, field access, row access, and bytes.
- A new read-only Native file preview metadata contract resolves capability only
  after the same file/field/row authorization as content download.
- The existing Native content route gains an explicit `disposition=inline`
  response mode. Its default remains `attachment`; the query never weakens
  authorization and never reveals an object-store URL or credential.
- The generated React application owns presentation. It ports the small,
  dependency-bounded preview behavior from 1.x into a local
  `components/platform-fields` implementation instead of importing any 1.x
  runtime package or adding a seventh public package.
- React Router remains the only preview-window lifecycle owner. A document
  preview opens a normal application URL under the current runtime basename,
  then fetches its own authorized metadata and bytes. It is not a raw storage
  URL and works in Connected Development and deployed `/view` mounts.

## Stable invariants and contracts

- `DataFileRef` stays the persisted field value. Preview metadata is a separate
  read model and does not duplicate file state in application data.
- `DataFilePreview` contains the authorized `DataFileRef`, preview type/render
  mode, `canPreview`, `canDownload`, and an optional bounded unsupported reason.
- PNG/JPEG/GIF/WebP and other browser-native images use an Ant Design image
  preview group. PDF uses the browser PDF surface; DOCX uses `docx-preview`;
  XLSX uses the bounded SheetJS client renderer with sheet tabs. All are
  read-only.
- A completed, unreferenced file is previewable only by its durable user owner.
  A referenced file is previewable only when the current principal can read its file
  field and record row. This is identical to the existing content contract.
- Preview and download are visibly separate. Preview failure never silently
  changes into a download; it shows the stable reason and an explicit Download
  action.
- Object URLs are revoked when the lightbox/page unmounts. Previewers bound
  file size and rendered spreadsheet rows/columns; they never execute document
  macros, formulas, scripts, or embedded active content.

## Failure, concurrency, security, and resource bounds

- Missing, cross-app, cross-environment, cross-resource, cross-record, or
  field-denied files fail closed through the existing Native
  machine error envelope. A renderer error is local UI state and creates no
  mutation, upload, event, outbox, or storage side effect.
- Metadata and content are `no-store`. The content response retains
  `X-Content-Type-Options: nosniff`; inline disposition only changes browser
  presentation after authorization.
- Initial client preview limits are 20 MiB for DOCX, 10 MiB for XLSX, and
  5,000 displayed spreadsheet rows by 200 columns. Oversized files remain
  downloadable with an explicit reason.
- Opening multiple preview windows performs independent reads against the
  active immutable Head. No new lock, lease, database table, SQL migration, or
  file ticket store is introduced.
- The two approved renderer surfaces raise the generated Web source budget from
  3,900 to 4,300 lines while retaining the existing 18-file hard limit. The
  budget increase is limited to the attachment preview topic and does not
  authorize unrelated shell or workflow growth.
- The complete generated application source-file budget rises from 50 to 52
  only for the reusable attachment field and isolated preview page. The
  existing 500 KiB source-byte budget is unchanged.
- DOCX and XLSX renderers are lazy-loaded only inside a preview window. The
  initial JavaScript gzip budget remains 600 KiB; total optional JavaScript is
  bounded at 750 KiB and the existing 2.5 MiB distribution budget is unchanged.

## Rollback and blast radius

Platform and v2 changes are independently revertible. Reverting the platform
commit restores download-only Native content. Reverting the v2 commit restores
the current attachment UI. Existing files, records, 1.x applications, other
tenants, and deployed immutable application versions are unchanged.

## Falsifiable verification

1. Native controller/service tests prove metadata and inline content reuse the
   same file/field/row authorization, while default content remains attachment.
2. Cross-app/environment/resource/record and unreferenced non-owner requests fail
   without exposing storage identity.
3. A browser uploads a PNG and Preview opens a lightbox without navigation or
   a download; Download remains independently functional.
4. A browser uploads PDF, DOCX, and XLSX files and each opens the application
   preview route in a new window with the expected renderer and toolbar.
5. XLSX sheet switching works within the row/column bounds; DOCX and XLSX are
   read-only and do not execute active content.
6. Unsupported and oversized files show a stable reason plus Download and do
   not auto-download.
7. Edit and detail use the same component; Connected Development and deployed
   runtime paths make zero RoleSession, Function, or raw object-store requests.
8. Contract tests, platform Native tests/build, template check/test/build/E2E,
   packed fresh-app smoke, and `pnpm verify:affected` pass.
