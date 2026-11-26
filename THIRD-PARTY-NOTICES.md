# Third-party notices

Lagsmith is MIT licensed (see [LICENSE](LICENSE)). It ships with the following third-party components. Each one keeps its own licence. Full licence texts are in each package's own folder (`node_modules/<package>/LICENSE`, or the crate's source on crates.io).

## Bundled in the app's interface

| Component | Licence | Source |
|---|---|---|
| Inter (variable font, via @fontsource-variable/inter) | SIL Open Font License 1.1 | https://github.com/rsms/inter |
| React, React DOM | MIT | https://github.com/facebook/react |
| Lucide icons (lucide-react) | ISC | https://github.com/lucide-icons/lucide |
| @tauri-apps/api | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri |
| Tailwind CSS (build time; generated CSS is bundled) | MIT | https://github.com/tailwindlabs/tailwindcss |

## Compiled into the app (Rust)

| Component | Licence | Source |
|---|---|---|
| Tauri and its runtime crates (tao, wry) | Apache-2.0 OR MIT | https://github.com/tauri-apps/tauri |
| windows (windows-rs) | MIT OR Apache-2.0 | https://github.com/microsoft/windows-rs |
| wmi | MIT OR Apache-2.0 | https://github.com/ohadravid/wmi-rs |
| winreg | MIT | https://github.com/gentoo90/winreg-rs |
| serde, serde_json | MIT OR Apache-2.0 | https://github.com/serde-rs |

The full Rust dependency tree is in `src-tauri/Cargo.lock`. Every crate in it is under a permissive licence (MIT, Apache-2.0, BSD, ISC, Zlib or Unicode); none is GPL or AGPL.

## Runtime provided by Windows

The app runs in Microsoft Edge WebView2, which is part of Windows 11. It is not redistributed by this project.

## Images

- `src/assets/laptop.webp`: the source and licence are being confirmed by the project owner.
- `public/logo.svg`: original artwork for this project, MIT.

## Trademarks

Windows is a trademark of Microsoft Corporation. VALORANT and Riot Vanguard are trademarks of Riot Games, Inc. EasyAntiCheat, BattlEye and FACEIT are trademarks of their respective owners. They are mentioned only to describe compatibility. Lagsmith is not affiliated with or endorsed by any of them.
