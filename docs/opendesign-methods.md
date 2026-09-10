# OpenDesign 原文方法

固定上游提交：`07170f8d2213936b7862db04139d27e0af5437ed`；适配版本：1；能力摘要：`bd35b8a8f525210316d9711b6e5773d3b23d5d9b5aea96a66502137ad0d5dc16`。

这些原文是设计参考；先读[享搭适配与工作流](./design-workflow.md)。上游 preview/outputs 是示例产物，Best Pairings 是可选建议，并不表示这些工具已安装。实际授权与应用事实以当前任务为准。

## reference-design-contract

来源：https://github.com/nexu-io/open-design/blob/07170f8d2213936b7862db04139d27e0af5437ed/skills/reference-design-contract/SKILL.md

```yaml
name: reference-design-contract
zh_name: "参考转设计合约"
en_name: "Reference Design Contract"
description: |
  Turn vague taste, screenshots, URLs, product notes, or "make it feel like this"
  references into a grounded DESIGN.md plus an implementation handoff. Use it
  before prototypes, decks, redesigns, or image remix work when the user needs
  a reusable visual direction rather than a one-off prompt.
triggers:
  - "design contract"
  - "reference design brief"
  - "style contract"
  - "visual direction handoff"
  - "turn references into DESIGN.md"
  - "make it feel like this"
  - "做同款但不照抄"
  - "把参考图转成设计规范"
od:
  mode: design-system
  platform: desktop
  scenario: planning
  category: design-systems
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
    generates: true
    sections: [visual-theme, color, typography, spacing, layout, components, motion, voice, anti-patterns]
  craft:
    requires:
      - typography
      - color
      - anti-ai-slop
  inputs:
    - name: brief
      type: string
      required: true
      description: "Goal, audience, references, or the style problem to resolve"
  outputs:
    primary: DESIGN.md
    secondary:
      - design-contract.md
      - implementation-handoff.md
      - example.html
  capabilities_required:
    - file_write
  example_prompt: "Create a reference design contract for a developer-notes app. The direction should feel editorial, calm, tactile, and serious, but not copy any specific product. Produce DESIGN.md and an implementation handoff."
  example_prompt_i18n:
    zh-CN: "为一个开发者笔记应用创建「参考转设计合约」。方向要有编辑感、安静、触感强、认真，但不要照抄任何具体产品。输出 DESIGN.md 和实现交接说明。"
```

### Reference Design Contract

Use this skill when the user has taste signals, references, or a rough "like
this" request and needs a reusable design contract before generation. The goal
is not to write a longer prompt. The goal is to make design decisions explicit
enough that a later prototype, deck, redesign, or image-remix run can execute
without guessing.

#### What this skill produces

Create three files:

1. `DESIGN.md` — the reusable visual direction, following OpenDesign's
   standard nine-section design-system shape.
2. `design-contract.md` — the decision record: evidence used, keep/change
   boundaries, rationale, risks, and quality gate.
3. `implementation-handoff.md` — concise build instructions for the next
   artifact-producing skill or coding agent.

If a preview is useful, also create `example.html` as a small hand-built
contract preview. Do not make it the main deliverable.

#### Workflow

1. **Lock the job.** Identify target artifact type, audience, brand/product
   context, references, and constraints. Ask at most two questions only when a
   missing answer would change the direction. Otherwise choose a sensible
   default and label it as inferred.
2. **Read evidence.** Use provided screenshots, URLs, existing `DESIGN.md`,
   brand docs, image artifacts, or user notes. If evidence is missing, say so
   and base the contract on the brief only; do not invent brand facts.
3. **Separate reference semantics.** For every reference, split it into:
   - `Keep`: qualities to preserve, such as density, composition, material,
     typography rhythm, color temperature, or motion attitude.
   - `Change`: subject matter, copy, brand marks, exact layout, protected
     assets, and anything the user wants adapted.
   - `Do not copy`: literal screenshots, logos, claims, pricing, proprietary
     UI, or exact prompt wording from examples.
4. **Freeze the direction.** Choose one coherent visual stance. Do not provide
   five unrelated moodboards. If there are genuinely competing directions,
   name them briefly, pick the recommended one, and continue.
5. **Write `DESIGN.md`.** Use these nine headings exactly:
   - `## 1. Visual Theme & Atmosphere`
   - `## 2. Color`
   - `## 3. Typography`
   - `## 4. Spacing & Grid`
   - `## 5. Layout & Composition`
   - `## 6. Components`
   - `## 7. Motion & Interaction`
   - `## 8. Voice & Brand`
   - `## 9. Anti-patterns`
6. **Write `design-contract.md`.** Include:
   - goal and target artifact
   - evidence table with confidence (`observed`, `provided`, `inferred`)
   - keep/change/do-not-copy table
   - final design stance in one paragraph
   - risks and explicit unknowns
   - quality gate checklist
7. **Write `implementation-handoff.md`.** Keep it short and operational:
   - files to read
   - token/palette/type/layout constraints
   - asset rules
   - responsive requirements
   - "first artifact should prove..." acceptance notes
8. **Validate.** Read `references/checklist.md` and satisfy every P0 gate
   before final handoff.

#### Output rules

- Make every claim traceable to user input, observed reference evidence, or an
  explicitly labeled inference.
- Prefer concrete constraints over adjectives: "one warm accent, no purple or
  blue glow" beats "premium".
- Treat "do the same style" as "borrow controllable qualities", not "clone the
  original subject or prompt".
- If the user asks for immediate UI generation too, finish these contract files
  first, then hand off to the appropriate artifact skill in the next step.


## reference-design-contract

来源：https://github.com/nexu-io/open-design/blob/07170f8d2213936b7862db04139d27e0af5437ed/skills/reference-design-contract/references/checklist.md

### Reference Design Contract checklist

Use this checklist before final handoff.

#### P0 gates

- [ ] `DESIGN.md` exists and uses the nine standard OpenDesign headings.
- [ ] `design-contract.md` names the target artifact, audience, and evidence used.
- [ ] Every reference is split into `Keep`, `Change`, and `Do not copy`.
- [ ] Inferences are labeled; unverified brand facts are not presented as truth.
- [ ] The contract picks one coherent visual stance instead of a menu of moods.
- [ ] `implementation-handoff.md` is short enough to paste into the next generation run.
- [ ] Anti-patterns include exact things to avoid, not only vague phrases.
- [ ] The final response tells the user which files were produced and what to run next.

#### Quality bar

The contract should let a second agent build the first artifact without asking:

- What is the product or surface?
- What should be preserved from the references?
- What must not be copied?
- What colors, type, spacing, and component rules are binding?
- What would make the first artifact fail review?

If any of those answers are missing, revise the contract before handing off.


## frontend-design

来源：https://github.com/nexu-io/open-design/blob/07170f8d2213936b7862db04139d27e0af5437ed/skills/frontend-design/SKILL.md

```yaml
name: frontend-design
description: |
  Create distinctive, production-grade frontend interfaces with strong visual direction, polished typography, considered layout, and working HTML/CSS/JS or framework code. Use for websites, landing pages, dashboards, React components, application screens, and UI beautification.
triggers:
  - "frontend design"
  - "ui design"
  - "ux design"
  - "web design"
  - "production ui"
  - "landing page"
  - "dashboard design"
  - "react component design"
license: Complete terms in LICENSE.txt
od:
  mode: prototype
  category: web-artifacts
  craft:
    requires: [typography, color, anti-ai-slop]
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "Design and build a production-quality SaaS analytics dashboard for a finance team, with real interaction states, refined typography, and a distinctive visual direction."
  upstream: "https://github.com/anthropics/skills/tree/main/skills/frontend-design"
```

### frontend-design

> Adapted from Anthropic's official `frontend-design` skill for OpenDesign.

Use this skill when the user asks to build or improve a frontend interface: a website, landing page, dashboard, application screen, HTML/CSS artifact, React/Vue/Svelte component, or a visual redesign of an existing UI.

The goal is not just "make it nicer." The goal is to ship working frontend code with a clear design point of view, strong craft, and enough product detail that the result feels designed for the user's actual context.

#### Workflow

1. Understand the brief before choosing the look.
   - Identify the audience, primary job, domain, and emotional tone.
   - Note any technical constraints: framework, existing styles, accessibility, performance, export target, or responsive requirements.
   - If the repo already has design tokens, components, screenshots, or a `DESIGN.md`, use those as the source of truth.

2. Commit to one specific aesthetic direction.
   - Pick a direction that fits the product: brutally minimal, editorial, luxury, playful, industrial, retro-futuristic, dense operational, calm enterprise, artful consumer, or another precise direction.
   - Make the direction concrete through typography, spacing, color, hierarchy, motion, and component shape.
   - Avoid generic AI defaults: purple-blue gradients, vague glass cards, interchangeable SaaS layouts, over-rounded cards, stock icon rows, and decorative blobs that do not serve the interface.

3. Design the real interface, not a placeholder poster.
   - Include the controls, empty/loading/error states, tables, filters, navigation, and responsive behavior a real user would expect.
   - Use honest content. If data is unknown, label it as sample, pending, or unavailable instead of inventing claims.
   - Keep workflows efficient for the target user. Dashboards and tools should be scannable and dense enough for repeated use; marketing pages can be more expressive.

4. Build production-grade frontend code.
   - Prefer the repository's existing framework, component conventions, icons, tokens, and styling approach.
   - For standalone artifacts, create self-contained HTML/CSS/JS unless the user asked for a framework.
   - Use semantic markup, keyboard-accessible controls, visible focus states, sensible contrast, and responsive layout constraints.
   - Use CSS variables for repeated colors, spacing, shadows, and type scale.

5. Refine visual craft.
   - Typography: choose expressive but readable type pairings. Avoid using default system stacks as the main visual idea unless the direction is intentionally utilitarian.
   - Color: create a balanced palette with role clarity. Use accent color sparingly and deliberately.
   - Layout: use alignment, rhythm, density, and negative space intentionally. Do not let cards, panels, or labels drift.
   - Motion: add purposeful transitions for state changes, reveals, and feedback. Prefer transforms and opacity for performance.
   - Details: use texture, borders, shadows, dividers, media, and iconography only when they support the concept.

6. Self-review before final delivery.
   - The interface works at mobile and desktop widths.
   - Text fits its containers and does not overlap adjacent UI.
   - Interactive elements have hover/focus/active/disabled states.
   - The design avoids obvious AI-generated visual tropes.
   - The result has one memorable quality a user could describe after closing the page.

#### OpenDesign Integration

When OpenDesign provides an active design system, treat it as the product's brand contract. Use the injected color, typography, layout, and component guidance first, then apply this skill's frontend craft rules where the design system is silent.

When OpenDesign injects craft references such as `typography`, `color`, and `anti-ai-slop`, apply those checks before finishing. If the user's brand guidance conflicts with a generic craft rule, the user's brand guidance wins.

#### Source

- Upstream: https://github.com/anthropics/skills/tree/main/skills/frontend-design
- Category: `web-artifacts`

#### License

This skill is adapted from Anthropic's official skills repository. See `LICENSE.txt` in this folder for the upstream Apache-2.0 license terms.


## impeccable-design-polish

来源：https://github.com/nexu-io/open-design/blob/07170f8d2213936b7862db04139d27e0af5437ed/skills/impeccable-design-polish/SKILL.md

```yaml
name: impeccable-design-polish
description: |
  Follow-up design polish skill inspired by Impeccable. Use after a web or HTML artifact exists to audit, critique, polish, animate, harden, and prepare the page for a live/share pass.
triggers:
  - "impeccable"
  - "design polish"
  - "polish page"
  - "anti ai polish"
  - "critique design"
  - "animate page"
  - "harden ui"
  - "live review"
  - "反 AI 味"
od:
  mode: prototype
  surface: web
  platform: desktop
  category: creative-direction
  upstream: "https://github.com/pbakaus/impeccable"
  preview:
    type: html
  design_system:
    requires: true
  craft:
    requires:
      - typography
      - color
      - anti-ai-slop
      - animation-discipline
      - accessibility-baseline
  example_prompt: |
    Use impeccable-design-polish on the current HTML artifact: audit visual hierarchy, remove AI tells, tighten copy, add restrained motion, and harden responsive/accessibility issues.
```

### Impeccable Design Polish

Use this skill as the post-generation pass for an existing design. It should not restart the project from scratch; it should make the current artifact sharper, more usable, and closer to something a designer would ship.

#### Follow-Up Modes

- **Audit**: identify the highest-impact issues in hierarchy, spacing, color, type, interaction states, responsiveness, and accessibility.
- **Critique**: explain what feels generic, overdesigned, underdesigned, or inconsistent.
- **Polish**: directly edit the artifact to improve the top issues while preserving the user's intent.
- **Animate**: add restrained, useful motion only where it improves feedback or storytelling.
- **Harden**: repair mobile overflow, text clipping, contrast problems, missing states, broken links, and fragile layout assumptions.
- **Live**: prepare the artifact for presentation or sharing, including final visual QA and clear next actions.

#### Operating Rules

1. Inspect the current HTML/page before editing. Do not guess from the prompt alone.
2. Keep the existing content, brand, and scenario unless the user explicitly asks to change them.
3. Prefer a few decisive fixes over broad cosmetic churn.
4. Remove common AI tells:
   - purple-blue glow gradients with no product reason
   - generic 3-card feature rows
   - oversized rounded cards everywhere
   - empty marketing adjectives
   - inconsistent spacing and type scale
   - decorative effects that do not support comprehension
5. Preserve accessibility: focus states, contrast, semantic controls, readable text, and reduced-motion fallbacks.
6. Finish with the artifact in a better runnable state, not just a critique list.

#### Best Pairings

- Pair with `design-taste-frontend` or `gpt-taste` for stronger anti-slop redesign work.
- Pair with `emilkowalski-motion` or GSAP skills for motion-specific polish.
- Pair with image/video skills when the artifact needs real visual assets rather than CSS-only decoration.



## opendesign-license

```text
                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for describing the origin of the Work and
      reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Support. While redistributing the Work or
      Derivative Works thereof, You may choose to offer, and charge a
      fee for, acceptance of support, warranty, indemnity, or other
      liability obligations and/or rights consistent with this License.
      However, in accepting such obligations, You may act only on Your
      own behalf and on Your sole responsibility, not on behalf of any
      other Contributor, and only if You agree to indemnify, defend,
      and hold each Contributor harmless for any liability incurred by,
      or claims asserted against, such Contributor by reason of your
      accepting any such warranty or support.

   END OF TERMS AND CONDITIONS

   APPENDIX: How to apply the Apache License to your work.

      To apply the Apache License to your work, attach the following
      boilerplate notice, with the fields enclosed by brackets "[]"
      replaced with your own identifying information. (Don't include
      the brackets!)  The text should be enclosed in the appropriate
      comment syntax for the file format. We also recommend that a
      file or class name and description of purpose be included on the
      same "printed page" as the copyright notice for easier
      identification within third-party archives.

   Copyright 2026 Open Design contributors

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.

```

## frontend-license

```text

                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.

      "Legal Entity" shall mean the union of the acting entity and all
      other entities that control, are controlled by, or are under common
      control with that entity. For the purposes of this definition,
      "control" means (i) the power, direct or indirect, to cause the
      direction or management of such entity, whether by contract or
      otherwise, or (ii) ownership of fifty percent (50%) or more of the
      outstanding shares, or (iii) beneficial ownership of such entity.

      "You" (or "Your") shall mean an individual or Legal Entity
      exercising permissions granted by this License.

      "Source" form shall mean the preferred form for making modifications,
      including but not limited to software source code, documentation
      source, and configuration files.

      "Object" form shall mean any form resulting from mechanical
      transformation or translation of a Source form, including but
      not limited to compiled object code, generated documentation,
      and conversions to other media types.

      "Work" shall mean the work of authorship, whether in Source or
      Object form, made available under the License, as indicated by a
      copyright notice that is included in or attached to the work
      (an example is provided in the Appendix below).

      "Derivative Works" shall mean any work, whether in Source or Object
      form, that is based on (or derived from) the Work and for which the
      editorial revisions, annotations, elaborations, or other modifications
      represent, as a whole, an original work of authorship. For the purposes
      of this License, Derivative Works shall not include works that remain
      separable from, or merely link (or bind by name) to the interfaces of,
      the Work and Derivative Works thereof.

      "Contribution" shall mean any work of authorship, including
      the original version of the Work and any modifications or additions
      to that Work or Derivative Works thereof, that is intentionally
      submitted to Licensor for inclusion in the Work by the copyright owner
      or by an individual or Legal Entity authorized to submit on behalf of
      the copyright owner. For the purposes of this definition, "submitted"
      means any form of electronic, verbal, or written communication sent
      to the Licensor or its representatives, including but not limited to
      communication on electronic mailing lists, source code control systems,
      and issue tracking systems that are managed by, or on behalf of, the
      Licensor for the purpose of discussing and improving the Work, but
      excluding communication that is conspicuously marked or otherwise
      designated in writing by the copyright owner as "Not a Contribution."

      "Contributor" shall mean Licensor and any individual or Legal Entity
      on behalf of whom a Contribution has been received by Licensor and
      subsequently incorporated within the Work.

   2. Grant of Copyright License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      copyright license to reproduce, prepare Derivative Works of,
      publicly display, publicly perform, sublicense, and distribute the
      Work and such Derivative Works in Source or Object form.

   3. Grant of Patent License. Subject to the terms and conditions of
      this License, each Contributor hereby grants to You a perpetual,
      worldwide, non-exclusive, no-charge, royalty-free, irrevocable
      (except as stated in this section) patent license to make, have made,
      use, offer to sell, sell, import, and otherwise transfer the Work,
      where such license applies only to those patent claims licensable
      by such Contributor that are necessarily infringed by their
      Contribution(s) alone or by combination of their Contribution(s)
      with the Work to which such Contribution(s) was submitted. If You
      institute patent litigation against any entity (including a
      cross-claim or counterclaim in a lawsuit) alleging that the Work
      or a Contribution incorporated within the Work constitutes direct
      or contributory patent infringement, then any patent licenses
      granted to You under this License for that Work shall terminate
      as of the date such litigation is filed.

   4. Redistribution. You may reproduce and distribute copies of the
      Work or Derivative Works thereof in any medium, with or without
      modifications, and in Source or Object form, provided that You
      meet the following conditions:

      (a) You must give any other recipients of the Work or
          Derivative Works a copy of this License; and

      (b) You must cause any modified files to carry prominent notices
          stating that You changed the files; and

      (c) You must retain, in the Source form of any Derivative Works
          that You distribute, all copyright, patent, trademark, and
          attribution notices from the Source form of the Work,
          excluding those notices that do not pertain to any part of
          the Derivative Works; and

      (d) If the Work includes a "NOTICE" text file as part of its
          distribution, then any Derivative Works that You distribute must
          include a readable copy of the attribution notices contained
          within such NOTICE file, excluding those notices that do not
          pertain to any part of the Derivative Works, in at least one
          of the following places: within a NOTICE text file distributed
          as part of the Derivative Works; within the Source form or
          documentation, if provided along with the Derivative Works; or,
          within a display generated by the Derivative Works, if and
          wherever such third-party notices normally appear. The contents
          of the NOTICE file are for informational purposes only and
          do not modify the License. You may add Your own attribution
          notices within Derivative Works that You distribute, alongside
          or as an addendum to the NOTICE text from the Work, provided
          that such additional attribution notices cannot be construed
          as modifying the License.

      You may add Your own copyright statement to Your modifications and
      may provide additional or different license terms and conditions
      for use, reproduction, or distribution of Your modifications, or
      for any such Derivative Works as a whole, provided Your use,
      reproduction, and distribution of the Work otherwise complies with
      the conditions stated in this License.

   5. Submission of Contributions. Unless You explicitly state otherwise,
      any Contribution intentionally submitted for inclusion in the Work
      by You to the Licensor shall be under the terms and conditions of
      this License, without any additional terms or conditions.
      Notwithstanding the above, nothing herein shall supersede or modify
      the terms of any separate license agreement you may have executed
      with Licensor regarding such Contributions.

   6. Trademarks. This License does not grant permission to use the trade
      names, trademarks, service marks, or product names of the Licensor,
      except as required for reasonable and customary use in describing the
      origin of the Work and reproducing the content of the NOTICE file.

   7. Disclaimer of Warranty. Unless required by applicable law or
      agreed to in writing, Licensor provides the Work (and each
      Contributor provides its Contributions) on an "AS IS" BASIS,
      WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or
      implied, including, without limitation, any warranties or conditions
      of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
      PARTICULAR PURPOSE. You are solely responsible for determining the
      appropriateness of using or redistributing the Work and assume any
      risks associated with Your exercise of permissions under this License.

   8. Limitation of Liability. In no event and under no legal theory,
      whether in tort (including negligence), contract, or otherwise,
      unless required by applicable law (such as deliberate and grossly
      negligent acts) or agreed to in writing, shall any Contributor be
      liable to You for damages, including any direct, indirect, special,
      incidental, or consequential damages of any character arising as a
      result of this License or out of the use or inability to use the
      Work (including but not limited to damages for loss of goodwill,
      work stoppage, computer failure or malfunction, or any and all
      other commercial damages or losses), even if such Contributor
      has been advised of the possibility of such damages.

   9. Accepting Warranty or Additional Liability. While redistributing
      the Work or Derivative Works thereof, You may choose to offer,
      and charge a fee for, acceptance of support, warranty, indemnity,
      or other liability obligations and/or rights consistent with this
      License. However, in accepting such obligations, You may act only
      on Your own behalf and on Your sole responsibility, not on behalf
      of any other Contributor, and only if You agree to indemnify,
      defend, and hold each Contributor harmless for any liability
      incurred by, or claims asserted against, such Contributor by reason
      of your accepting any such warranty or additional liability.

   END OF TERMS AND CONDITIONS

```

## refero-license

```text
MIT License

Copyright (c) 2026 Refero

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

```
