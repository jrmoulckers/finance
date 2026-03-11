# Third-Party Software Notices

> **License clarification:** The Finance project itself is licensed under the
> [Business Source License 1.1 (BUSL-1.1)](LICENSE). The third-party dependencies
> listed below retain their own original licenses (Apache 2.0, MIT, BSD, ISC, etc.)
> and are not affected by the project's license. This file documents those
> third-party licenses and attributions as required by their respective terms.

This file lists third-party software used in the Finance application, along with their licenses and required attributions.

Last updated: 2026-03-08

---

## Table of Contents

- [Dependency List by License](#dependency-list-by-license)
  - [Apache License 2.0](#apache-license-20)
  - [MIT License](#mit-license)
  - [BSD License](#bsd-license)
  - [ISC License](#isc-license)
  - [Other Licenses](#other-licenses)
- [Special Attributions](#special-attributions)
- [Full License Texts](#full-license-texts)

---

## Dependency List by License

### Apache License 2.0

> **Note:** Apache 2.0 requires preservation of copyright notices and the contents of any NOTICE files provided by the dependency.

#### Kotlin & JetBrains

| Dependency                     | Version | URL                                                |
| ------------------------------ | ------- | -------------------------------------------------- |
| Kotlin                         | 2.1.0   | https://github.com/JetBrains/kotlin                |
| Kotlin Test                    | 2.1.0   | https://github.com/JetBrains/kotlin                |
| kotlinx-coroutines-core        | 1.9.0   | https://github.com/Kotlin/kotlinx.coroutines       |
| kotlinx-coroutines-test        | 1.9.0   | https://github.com/Kotlin/kotlinx.coroutines       |
| kotlinx-serialization-json     | 1.7.3   | https://github.com/Kotlin/kotlinx.serialization    |
| kotlinx-datetime               | 0.6.1   | https://github.com/Kotlin/kotlinx-datetime         |
| Compose Multiplatform          | 1.7.3   | https://github.com/JetBrains/compose-multiplatform |
| Kotlin Compose Compiler Plugin | 2.1.0   | https://github.com/JetBrains/kotlin                |
| Kover                          | 0.9.1   | https://github.com/Kotlin/kotlinx-kover            |

#### Android Jetpack & Google

| Dependency                      | Version          | URL                                                                       |
| ------------------------------- | ---------------- | ------------------------------------------------------------------------- |
| Compose BOM                     | 2024.12.01       | https://developer.android.com/jetpack/compose                             |
| Compose Material 3              | (managed by BOM) | https://developer.android.com/jetpack/androidx/releases/compose-material3 |
| Compose UI                      | (managed by BOM) | https://developer.android.com/jetpack/androidx/releases/compose-ui        |
| Compose UI Graphics             | (managed by BOM) | https://developer.android.com/jetpack/androidx/releases/compose-ui        |
| Compose UI Tooling              | (managed by BOM) | https://developer.android.com/jetpack/androidx/releases/compose-ui        |
| Compose UI Tooling Preview      | (managed by BOM) | https://developer.android.com/jetpack/androidx/releases/compose-ui        |
| Compose UI Test Manifest        | (managed by BOM) | https://developer.android.com/jetpack/androidx/releases/compose-ui        |
| Compose Material Icons Extended | (managed by BOM) | https://developer.android.com/jetpack/androidx/releases/compose-material  |
| Activity Compose                | 1.9.3            | https://developer.android.com/jetpack/androidx/releases/activity          |
| Navigation Compose              | 2.8.5            | https://developer.android.com/jetpack/androidx/releases/navigation        |
| Core KTX                        | 1.15.0           | https://developer.android.com/jetpack/androidx/releases/core              |
| Lifecycle ViewModel Compose     | 2.8.7            | https://developer.android.com/jetpack/androidx/releases/lifecycle         |
| Lifecycle Runtime Compose       | 2.8.7            | https://developer.android.com/jetpack/androidx/releases/lifecycle         |
| WorkManager Runtime KTX         | 2.10.0           | https://developer.android.com/jetpack/androidx/releases/work              |
| Biometric                       | 1.1.0            | https://developer.android.com/jetpack/androidx/releases/biometric         |
| Security Crypto                 | 1.0.0            | https://developer.android.com/jetpack/androidx/releases/security          |
| Android Gradle Plugin (AGP)     | 8.7.3            | https://developer.android.com/build                                       |

#### Ktor (JetBrains)

| Dependency                      | Version | URL                            |
| ------------------------------- | ------- | ------------------------------ |
| Ktor Client Core                | 3.0.3   | https://github.com/ktorio/ktor |
| Ktor Client Content Negotiation | 3.0.3   | https://github.com/ktorio/ktor |
| Ktor Client Auth                | 3.0.3   | https://github.com/ktorio/ktor |
| Ktor Client OkHttp              | 3.0.3   | https://github.com/ktorio/ktor |
| Ktor Client Darwin              | 3.0.3   | https://github.com/ktorio/ktor |
| Ktor Client JS                  | 3.0.3   | https://github.com/ktorio/ktor |
| Ktor Serialization kotlinx-json | 3.0.3   | https://github.com/ktorio/ktor |

#### Other Apache 2.0

| Dependency                       | Version  | URL                                                    |
| -------------------------------- | -------- | ------------------------------------------------------ |
| Koin Core                        | 4.0.1    | https://github.com/InsertKoinIO/koin                   |
| SQLDelight Runtime               | 2.0.2    | https://github.com/cashapp/sqldelight                  |
| SQLDelight Coroutines Extensions | 2.0.2    | https://github.com/cashapp/sqldelight                  |
| SQLDelight Android Driver        | 2.0.2    | https://github.com/cashapp/sqldelight                  |
| SQLDelight Native Driver         | 2.0.2    | https://github.com/cashapp/sqldelight                  |
| SQLDelight JVM Driver            | 2.0.2    | https://github.com/cashapp/sqldelight                  |
| SQLDelight Web Worker Driver     | 2.0.2    | https://github.com/cashapp/sqldelight                  |
| Detekt                           | 1.23.7   | https://github.com/detekt/detekt                       |
| Turbine                          | 1.2.0    | https://github.com/cashapp/turbine                     |
| Fastlane                         | (latest) | https://github.com/fastlane/fastlane                   |
| typescript-eslint                | 8.56.1   | https://github.com/typescript-eslint/typescript-eslint |

---

### MIT License

#### Web Application (React / Vite ecosystem)

| Dependency           | Version | URL                                             |
| -------------------- | ------- | ----------------------------------------------- |
| React                | 19.1.0  | https://github.com/facebook/react               |
| React DOM            | 19.1.0  | https://github.com/facebook/react               |
| React Router DOM     | 7.6.1   | https://github.com/remix-run/react-router       |
| D3                   | 7.9.0   | https://github.com/d3/d3                        |
| Recharts             | 2.15.3  | https://github.com/recharts/recharts            |
| sql.js               | 1.14.1  | https://github.com/sql-js/sql.js                |
| wa-sqlite            | 1.0.0   | https://github.com/nicolo-ribaudo/niccokunzmann |
| Vite                 | 6.3.5   | https://github.com/vitejs/vite                  |
| @vitejs/plugin-react | 4.5.2   | https://github.com/vitejs/vite-plugin-react     |
| TypeScript           | 5.8.3   | https://github.com/microsoft/TypeScript         |
| Vitest               | 3.2.1   | https://github.com/vitest-dev/vitest            |
| nanoid               | 3.3.11  | https://github.com/ai/nanoid                    |
| source-map-js        | 1.2.1   | https://github.com/nicolo-ribaudo/source-map-js |

#### Storybook

| Dependency                    | Version | URL                                      |
| ----------------------------- | ------- | ---------------------------------------- |
| Storybook                     | 8.6.14  | https://github.com/storybookjs/storybook |
| @storybook/addon-a11y         | 8.6.14  | https://github.com/storybookjs/storybook |
| @storybook/addon-essentials   | 8.6.14  | https://github.com/storybookjs/storybook |
| @storybook/addon-interactions | 8.6.14  | https://github.com/storybookjs/storybook |
| @storybook/react              | 8.6.14  | https://github.com/storybookjs/storybook |
| @storybook/react-vite         | 8.6.14  | https://github.com/storybookjs/storybook |

#### Type Definitions

| Dependency       | Version | URL                                                |
| ---------------- | ------- | -------------------------------------------------- |
| @types/d3        | 7.4.3   | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/react     | 19.1.4  | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/react-dom | 19.1.5  | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/sql.js    | 1.4.9   | https://github.com/DefinitelyTyped/DefinitelyTyped |

#### Root / Build Tooling

| Dependency                      | Version | URL                                                  |
| ------------------------------- | ------- | ---------------------------------------------------- |
| Husky                           | 9.1.7   | https://github.com/typicode/husky                    |
| Prettier                        | 3.8.1   | https://github.com/prettier/prettier                 |
| Turbo (Turborepo)               | 2.8.13  | https://github.com/vercel/turborepo                  |
| @commitlint/cli                 | 20.4.3  | https://github.com/conventional-changelog/commitlint |
| @commitlint/config-conventional | 20.4.3  | https://github.com/conventional-changelog/commitlint |
| @changesets/cli                 | 2.30.0  | https://github.com/changesets/changesets             |
| @changesets/changelog-github    | 0.6.0   | https://github.com/changesets/changesets             |

#### Design Tokens

| Dependency       | Version | URL                                      |
| ---------------- | ------- | ---------------------------------------- |
| Style Dictionary | 4.3.0   | https://github.com/amzn/style-dictionary |

---

### BSD License

> **Note:** BSD licenses require that the copyright notice and disclaimer are retained in all redistributions of source and/or binary forms.

| Dependency        | License Variant | Version | URL                                |
| ----------------- | --------------- | ------- | ---------------------------------- |
| SQLCipher Android | BSD 3-Clause    | 4.6.1   | https://www.zetetic.net/sqlcipher/ |
| D3 (sub-modules)  | BSD 3-Clause    | 7.9.0   | https://github.com/d3/d3           |

> See [Special Attributions — SQLCipher](#sqlcipher-zetetic) below for required attribution text.

---

### ISC License

| Dependency | Version      | URL                              |
| ---------- | ------------ | -------------------------------- |
| ESLint     | 10.0.3       | https://github.com/eslint/eslint |
| @eslint/js | 10.0.1       | https://github.com/eslint/eslint |
| rimraf     | (transitive) | https://github.com/isaacs/rimraf |

---

### Other Licenses

| Dependency                     | License                                   | Version  | URL                                |
| ------------------------------ | ----------------------------------------- | -------- | ---------------------------------- |
| Apple Swift (standard library) | Apache 2.0 with Runtime Library Exception | (system) | https://github.com/apple/swift     |
| SwiftUI / Swift Charts         | Proprietary (Apple SDK)                   | (system) | https://developer.apple.com/xcode/ |

---

## Special Attributions

### SQLCipher (Zetetic) {#sqlcipher-zetetic}

**License:** BSD 3-Clause
**Used in:** `packages/models` (Android driver — `net.zetetic:sqlcipher-android:4.6.1`)
**URL:** https://www.zetetic.net/sqlcipher/

SQLCipher is an open-source extension to SQLite that provides transparent 256-bit AES encryption of database files. It is used in the Finance application to encrypt all locally stored financial data on Android devices.

> Copyright (c) 2008-2024 Zetetic LLC
> All rights reserved.
>
> Redistribution and use in source and binary forms, with or without
> modification, are permitted provided that the following conditions are met:
>
> 1. Redistributions of source code must retain the above copyright notice,
>    this list of conditions and the following disclaimer.
> 2. Redistributions in binary form must reproduce the above copyright notice,
>    this list of conditions and the following disclaimer in the documentation
>    and/or other materials provided with the distribution.
> 3. Neither the name of the copyright holder nor the names of its
>    contributors may be used to endorse or promote products derived from this
>    software without specific prior written permission.
>
> THIS SOFTWARE IS PROVIDED BY ZETETIC LLC "AS IS" AND ANY EXPRESS OR IMPLIED
> WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
> MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO
> EVENT SHALL ZETETIC LLC BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
> SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
> PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS;
> OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
> WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR
> OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
> ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

---

### Kotlin (JetBrains)

**License:** Apache License 2.0
**URL:** https://kotlinlang.org/

> Copyright 2010-2024 JetBrains s.r.o. and Kotlin Programming Language contributors.
>
> Licensed under the Apache License, Version 2.0. You may obtain a copy of the License at
> http://www.apache.org/licenses/LICENSE-2.0

This project uses the Kotlin programming language and various kotlinx libraries (coroutines, serialization, datetime) developed by JetBrains and the Kotlin community.

---

### Android Jetpack (Google)

**License:** Apache License 2.0
**URL:** https://developer.android.com/jetpack

> Copyright (C) The Android Open Source Project
>
> Licensed under the Apache License, Version 2.0. You may obtain a copy of the License at
> http://www.apache.org/licenses/LICENSE-2.0

This project uses Android Jetpack libraries including Compose, Material 3, Navigation, Lifecycle, WorkManager, Biometric, and Security Crypto.

---

### React (Meta)

**License:** MIT License
**URL:** https://react.dev/

> Copyright (c) Meta Platforms, Inc. and affiliates.
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software
> and associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute,
> sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.

---

### SQLDelight (Cash App / Block, Inc.)

**License:** Apache License 2.0
**URL:** https://github.com/cashapp/sqldelight

> Copyright (C) Cash App (Block, Inc.)
>
> Licensed under the Apache License, Version 2.0.

Used for type-safe database access across all Kotlin Multiplatform targets.

---

### Ktor (JetBrains)

**License:** Apache License 2.0
**URL:** https://ktor.io/

> Copyright 2014-2024 JetBrains s.r.o. and contributors.
>
> Licensed under the Apache License, Version 2.0.

Used as the HTTP client for data synchronization across all platforms.

---

## Full License Texts

### MIT License

```
MIT License

Copyright (c) <year> <copyright holders>

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

---

### Apache License 2.0

```
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
      submitted to the Licensor for inclusion in the Work by the copyright owner
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
      on behalf of whom a Contribution has been received by the Licensor and
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
          within such NOTICE file, excluding any notices that do not
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

---

### BSD 3-Clause License

```
BSD 3-Clause License

Copyright (c) <year>, <copyright holder>
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

---

### ISC License

```
ISC License

Copyright (c) <year>, <copyright holder>

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```

---

## Maintaining This File

This file should be updated whenever dependencies are added, removed, or updated. To identify dependencies:

- **npm dependencies:** Check `package.json` (root), `apps/web/package.json`, `packages/design-tokens/package.json`
- **Kotlin/JVM dependencies:** Check `gradle/libs.versions.toml` and `*.build.gradle.kts` files
- **iOS dependencies:** Check `apps/ios/Package.swift`
- **Windows dependencies:** Check `apps/windows/build.gradle.kts`
- **Ruby dependencies:** Check `apps/ios/Gemfile`

Run `npm ls --all` and review Gradle dependency reports (`./gradlew dependencies`) to catch transitive dependencies with non-permissive licenses.
