# Team viewer setup on Windows x64

## Open the supplied Solace season

1. Sign in to GitHub with access to this private fork. Download **faceit-scouting-team-windows-x64.zip** from the [scouting release](https://github.com/stooken/cs-demo-manager-scouting/releases/tag/scouting-solace-s59). Extract the entire ZIP into a permanent folder.
2. Download any of the 13 original `.dem.zst` archives into the extracted kit’s **demos** folder. Keep their filenames and compression. The [demo index](DEMOS.md) lists the map, opponent, round count and download for each fixture. The full set is 3.18 GB compressed. Allow additional disk space for the extracted demos and position database.
3. Quit any older CS Demo Manager from its tray menu after its work finishes. Open **app\cs-demo-manager.exe** in the kit and let the library initialize. Double-click **Import demos.cmd** in the kit root. If the archives already live in another folder, drag that **folder** onto **Import demos.cmd** instead. Firefox setup is optional for this collection.
4. The importer verifies each SHA-256 checksum, expands each demo into **Videos\FACEIT Demos** under your Windows profile, analyzes player positions, and links the fixture roster to the season. Keep the console open until it reports completion. You can start with one demo and run it again after adding others. A repeat run verifies existing files and reuses completed position analyses.
5. In the app, open **Teams → Imported seasons → Solace · ESEA League 59**. If Teams was already open during import, leave the view and return. If a fixture appears under **maps excluded for review**, use **Inspect match**, check the roster, then confirm the matching team.

From a terminal in the extracted kit you can verify the archives without analyzing them, or choose another destination for the expanded demos.

```powershell
.\runtime\node.exe .\native\import-season.mjs --archives "D:\CSDM-FACEIT" --check
.\runtime\node.exe .\native\import-season.mjs --archives "D:\CSDM-FACEIT" --output "D:\Replays\Solace"
```

To download the whole collection with an authenticated GitHub CLI, run this inside the extracted kit.

```powershell
gh release download scouting-solace-s59 --repo stooken/cs-demo-manager-scouting --pattern "*.dem.zst" --dir demos --skip-existing
```

## Read the heatmaps

**Round playback.** Choose a match, round and event. **Positions** shows sampled locations of living teammates. With a ten-second window, moving the slider to **1:35** shows activity in the preceding ten seconds. Press **Play** to advance, or **Jump to plant** to start at the recorded plant tick. The display changes to time since plant, clears pre-plant activity, and stops at the round win. The round selector shows the scouted team’s side and buy.

**Compare rounds.** Choose a map, event, side, team buy and clock window. For example, select **Positions → T → Eco → Round clock 01:35 → 01:25**, then switch only the buy to **Rifle (full buy)**. Both overlays now answer the same question about Solace’s T-side positioning. The rifle category uses the analyzer’s full-buy classification. Semi-buys and force-buys have their own filters.

**Read the denominator.** With **Share of eligible rounds**, each 128-unit square counts at most once per round. A square colored in the 50–<75% band had activity in that share of eligible rounds. The denominator includes rounds that reached the window even if the selected event never happened. After-plant windows include only rounds that reached that time after their own plant. The panel reports missing position recordings. **Point density** instead shows concentrations of individual events or samples.

**Scouting.** Use the season’s **Scouting** tab for T-side contact, entry and plant timings. Selecting a flagged round opens its 2D replay. Site-entry and fake estimates require usable bomb-zone data. If the importer reports missing zone data, you can still use the round clocks and recorded positions.

## Add another FACEIT season with Firefox

1. Use the same extracted kit. Run **Install.cmd** and check the printed app path points to **app\cs-demo-manager.exe** in this kit. The installer registers the native helper for your Windows account. Rerun it if you move the kit.
2. In Firefox 142 or newer, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, and select **extension\manifest.json**. Allow access to FACEIT when prompted. This release includes an unsigned extension, so repeat this step after restarting Firefox. A permanent installation requires a Mozilla-signed XPI.
3. Sign in to FACEIT, open the opponent’s ESEA team league page in the active tab, and click the extension icon. Confirm the team and season, review its schedule, and choose **Import this season**. Keep Firefox and a signed-in FACEIT tab in the same container open until **Download activity** finishes.
4. Click **Open season heatmap**, or open the imported season from **Teams**. Use **Retry fixture** for a failed part. Download availability depends on the signed-in account’s FACEIT access.
5. If the helper cannot find your archives, run the installer with Firefox’s actual download **parent** folder. For example, when Firefox writes `D:\Downloads\CSDM-FACEIT`, run the following in the kit root.

```powershell
.\Install.ps1 -DownloadsFolder "D:\Downloads" -CsdmExe "$PWD\app\cs-demo-manager.exe"
```

Choose **Check** in the extension to retry the connection. To remove the bridge, remove the add-on in Firefox and run **Uninstall.ps1**. The demo library remains available in CS Demo Manager.

## Build the kit from source

The main repository contains the viewer and the versioned demo manifest. The Firefox extension and Windows native helper live in a separate [bridge repository at the kit revision](https://github.com/stooken/faceit-csdm-bridge/tree/e0464f47aa0e3da840fb0366b1d240ed87d1b86b). Building requires access to both repositories, the app’s Vite+ toolchain, Node.js 24+, and the Go toolchain specified by the zone reader. From the root of the fork on Windows x64:

```powershell
git clone https://github.com/stooken/faceit-csdm-bridge.git ../faceit-csdm-bridge
git -C ../faceit-csdm-bridge checkout --detach e0464f47aa0e3da840fb0366b1d240ed87d1b86b
vp install --frozen-lockfile
vp run i18n:extract
vp run build
vp run package:dir
Push-Location ..\faceit-csdm-bridge\native\zones
go build -trimpath -o ..\zones.exe .
Pop-Location
.\..\faceit-csdm-bridge\Build.ps1
.\..\faceit-csdm-bridge\Build-Team.ps1 -CsdmFolder $PWD
```

The team ZIP is written under **..\faceit-csdm-bridge\dist**. The kit includes the desktop app, runtime, native helper, extension, season importer and roster manifest. The recordings are individual release assets so teammates can choose the fixtures they want.
