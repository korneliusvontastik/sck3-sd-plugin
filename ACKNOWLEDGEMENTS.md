# Acknowledgements

This plugin is built on the shoulders of those who came before. The Star Citizen Stream Deck community has produced remarkable work without any official game API — purely through ingenuity, passion and dedication. Their work is the direct inspiration for this project.

## Prior creators who inspired me to create my own plugin

| Creator | GitHub | Contribution |
|---|---|---|
| mhwlng | https://github.com/mhwlng/streamdeck-starcitizen | Created the original Star Citizen Stream Deck plugin (now archived) |
| jarex985 | https://github.com/Jarex985/SCStreamDeck | Modernised and improved upon mhwlng's original work |
| robdk97 | https://github.com/ROBdk97/SCStreamDeck | Continued modernisation and improvements on jarex985's fork, adding new features and providing ongoing maintenance |
| veelume | https://github.com/VeeLume/streamdeck-starcitizen | Built a Rust-based plugin on top of SCK3's assets and designs, contributing practical features such as the keybind generation logic |

## Legal & Trademark Disclaimer

This is an unofficial, non-commercial fan project created under Cloud Imperium Games' fan content policy. It is not affiliated with, endorsed by, or sponsored by Cloud Imperium Games, Roberts Space Industries, Turbulent, or any of their affiliates. "Star Citizen", "Roberts Space Industries", and "Cloud Imperium" are trademarks of Cloud Imperium Rights LLC. All Star Citizen assets, names, and data referenced by this plugin remain the property of their respective owners.

## Context

Star Citizen exposes no public API. All Stream Deck integration work to date — including this plugin — operates exclusively through keyboard input simulation mapped to the game's action system (`actionmaps.xml`, `defaultProfile.xml`).

## Data.p4k / CryXML Format

`defaultProfile.xml` ships inside Star Citizen's `Data.p4k` archive in CIG/CryEngine's CryXmlB binary encoding. This plugin's extraction code (`sck3/src/keybindkrafter/cryxml.ts`) is adapted from:

| Creator | Project | GitHub |
|---|---|---|
| dolkensp | unp4k — original `Data.p4k` reverse-engineering and the canonical `CryXmlSerializer.cs` | https://github.com/dolkensp/unp4k |
| Markemp | CryXmlViewer — TypeScript port of the CryXML parser this plugin's implementation is based on | https://github.com/Markemp/CryXmlViewer |
| StarCitizenToolBox | unp4k_rs — Rust port; source of the method 100 (ZStd + AES-128-CBC) decryption logic used in `p4k.ts` | https://github.com/StarCitizenToolBox/unp4k_rs |

## Fonts

This plugin's key labels are rendered with **UAV OSD Mono**, a monospaced font designed for on-screen-display / HUD-style readouts.

| Creator | Font | Site |
|---|---|---|
| Nicholas Kruse | UAV OSD Mono | https://nicholaskruse.com |

---

*KVT Korp — Kornelius Von Tastik*

<a href="https://robertsspaceindustries.com/community-hub"><img src="assets/branding/MadeByTheCommunity_Black_small.png" alt="Made by the Community" width="96"></a>

Used under RSI's [Fan Kit Agreement](https://robertsspaceindustries.com/en/fankit).
